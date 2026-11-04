import "server-only";
import { db, publicUrl } from "@/lib/supabase/server";
import { itemNote, type Pdp, type PdpItem } from "@/lib/domain/pdp";
import { summarizeChecks } from "@/lib/domain/status";
import { SHOT_ORDER, type Asset, type ChannelSpec, type CheckRow, type Generation, type Product, type ShotTemplate } from "@/lib/domain/types";
import { getProduct } from "./products";
import { buildViews, type AssetView } from "./views";

/** Newest version first. */
export async function pdpsOf(productId: string, channel?: string) {
  let query = db().from("pdps").select("*").eq("product_id", productId);
  if (channel) query = query.eq("channel", channel);
  const { data } = await query.order("version", { ascending: false });
  return (data ?? []) as unknown as Pdp[];
}

export async function draftFor(productId: string, channel: string) {
  const { data } = await db().from("pdps").select("*").eq("product_id", productId).eq("channel", channel).eq("status", "draft").maybeSingle();
  return data as unknown as Pdp | null;
}

export async function getPdp(id: string) {
  const { data } = await db().from("pdps").select("*").eq("id", id).maybeSingle();
  return data as unknown as Pdp | null;
}

export async function itemsOf(pdpId: string) {
  const { data } = await db().from("pdp_items").select("*").eq("pdp_id", pdpId);
  return (data ?? []) as unknown as PdpItem[];
}

export async function itemAssets(items: Pick<PdpItem, "asset_id">[]) {
  if (!items.length) return [];
  const { data } = await db().from("assets").select("*").in("id", items.map((i) => i.asset_id));
  return (data ?? []) as unknown as Asset[];
}

export type BoardPdp = {
  pdp: Pdp;
  product: Pick<Product, "name" | "sku">;
  thumbnail: string | null;
  itemCount: number;
  flagged: number;
  checks: ReturnType<typeof summarizeChecks>;
  draftVersion: number | null;
};

export async function getBoard(): Promise<BoardPdp[]> {
  const [{ data: rows }, { data: productRows }] = await Promise.all([
    db().from("pdps").select("*").in("status", ["in_review", "changes_requested", "approved", "live", "draft"]).order("created_at", { ascending: false }),
    db().from("products").select("id,name,sku,hidden"),
  ]);
  const products = new Map(((productRows ?? []) as unknown as (Pick<Product, "name" | "sku"> & { id: string; hidden: boolean })[]).filter((p) => !p.hidden).map((p) => [p.id, p]));
  const all = ((rows ?? []) as unknown as Pdp[]).filter((p) => products.has(p.product_id));
  const drafts = all.filter((p) => p.status === "draft");
  // A version sent back is only on the board while its replacement is being worked on.
  const pdps = all.filter((p) => p.status !== "draft" && (p.status !== "changes_requested" || drafts.some((d) => d.based_on === p.id)));
  if (!pdps.length) return [];
  const { data: itemRows } = await db().from("pdp_items").select("*").in("pdp_id", pdps.map((p) => p.id));
  const items = (itemRows ?? []) as unknown as PdpItem[];
  const assets = new Map((await itemAssets(items)).map((a) => [a.id, a]));
  const { data: checkRows } = items.length ? await db().from("check_results").select("asset_id,result").in("asset_id", items.map((i) => i.asset_id)) : { data: [] };
  const checks = (checkRows ?? []) as unknown as Pick<CheckRow, "asset_id" | "result">[];
  return pdps.map((pdp) => {
    const mine = items.filter((i) => i.pdp_id === pdp.id);
    const ids = mine.map((i) => i.asset_id);
    const image = SHOT_ORDER.map((shot) => mine.find((i) => i.shot_key === shot)).find((i) => i && i.shot_key !== "video" && i.shot_key !== "copy");
    return {
      pdp,
      product: products.get(pdp.product_id)!,
      thumbnail: image ? publicUrl("outputs", assets.get(image.asset_id)?.storage_path) : null,
      itemCount: mine.length,
      flagged: mine.filter((i) => i.flagged).length,
      checks: summarizeChecks(checks.filter((c) => ids.includes(c.asset_id)).map((c) => c.result)),
      draftVersion: drafts.find((d) => d.based_on === pdp.id)?.version ?? null,
    };
  });
}

export type VersionItem = { item: PdpItem; view: AssetView; checks: CheckRow[]; note: string | null };

/** One frozen version, for reviewing or as a record. */
export async function getVersion(id: string) {
  const pdp = await getPdp(id);
  if (!pdp) return null;
  const [product, items, versions] = await Promise.all([getProduct(pdp.product_id), itemsOf(id), pdpsOf(pdp.product_id, pdp.channel)]);
  if (!product) return null;
  const assets = await itemAssets(items);
  const ids = assets.map((a) => a.id);
  const [{ data: gens }, { data: specs }, { data: templates }, { data: checkRows }, { data: reviews }, { data: publications }, baseItems] = await Promise.all([
    db().from("generations").select("*").eq("product_id", pdp.product_id),
    db().from("channel_specs").select("*"),
    db().from("shot_templates").select("*"),
    ids.length ? db().from("check_results").select("*").in("asset_id", ids) : Promise.resolve({ data: [] }),
    db().from("reviews").select("*").eq("pdp_id", id).order("created_at", { ascending: false }),
    db().from("publications").select("*").eq("pdp_id", id).order("published_at", { ascending: false }).limit(1),
    pdp.based_on ? itemsOf(pdp.based_on) : Promise.resolve([]),
  ]);
  const checks = (checkRows ?? []) as CheckRow[];
  const views = buildViews(assets, (gens ?? []) as Generation[], (specs ?? []) as ChannelSpec[], (templates ?? []) as ShotTemplate[], checks);
  const baseVersion = versions.find((v) => v.id === pdp.based_on)?.version;
  const base = baseItems.length && baseVersion ? { assetIds: baseItems.map((i) => i.asset_id), version: baseVersion } : null;
  const rows: VersionItem[] = views.flatMap((view) => {
    const item = items.find((i) => i.asset_id === view.asset.id);
    return item ? [{ item, view, checks: checks.filter((c) => c.asset_id === view.asset.id), note: itemNote(view.asset.id, base, pdp.version) }] : [];
  });
  return {
    pdp, product, items: rows, versions,
    reviews: (reviews ?? []) as unknown as { id: string; decision: "approve" | "reject"; note: string | null; reviewer_role: string; created_at: string }[],
    publication: ((publications ?? []) as unknown as { url: string | null; published_by: string; published_at: string }[])[0] ?? null,
  };
}

export type Version = NonNullable<Awaited<ReturnType<typeof getVersion>>>;
