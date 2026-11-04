import "server-only";
import { db, publicUrl } from "@/lib/supabase/server";
import type { Listing } from "@/lib/agent/channel-rules";
import type { Asset, Channel, Product, ShotKey } from "@/lib/domain/types";

export type SiteAsset = { id: string; shot: ShotKey; channel: Channel; url: string; alt: string; publishedAt: string };
export type SiteProduct = { product: Product; hero: SiteAsset | null; lifestyle: SiteAsset | null; inUse: SiteAsset | null; claim: SiteAsset | null; video: SiteAsset | null; copy: Listing | null; publishedAt: string; count: number };

/** Prefers the website's own renditions, then falls back to any published one. */
function pick(assets: SiteAsset[], shot: ShotKey) {
  const rows = assets.filter((a) => a.shot === shot);
  return rows.find((a) => a.channel === "verda") ?? rows[0] ?? null;
}

async function published(productIds?: string[]) {
  let q = db().from("assets").select("*").eq("is_current", true).eq("state", "published");
  if (productIds) q = q.in("product_id", productIds);
  const { data } = await q;
  const assets = (data ?? []) as unknown as Asset[];
  const { data: pubs } = assets.length ? await db().from("publications").select("asset_id,published_at").eq("target", "website").in("asset_id", assets.map((a) => a.id)) : { data: [] };
  const when = new Map(((pubs ?? []) as unknown as { asset_id: string; published_at: string }[]).map((p) => [p.asset_id, p.published_at]));
  return assets.filter((a) => when.has(a.id)).map((a) => ({ asset: a, publishedAt: when.get(a.id)! }));
}

function toSite(product: Product, rows: Awaited<ReturnType<typeof published>>): SiteProduct | null {
  const mine = rows.filter((r) => r.asset.product_id === product.id);
  if (!mine.length) return null;
  const media: SiteAsset[] = mine.filter((r) => r.asset.storage_path).map((r) => ({ id: r.asset.id, shot: r.asset.shot_key, channel: r.asset.channel, url: publicUrl("outputs", r.asset.storage_path)!, alt: r.asset.alt_text ?? product.name, publishedAt: r.publishedAt }));
  const copies = mine.filter((r) => r.asset.shot_key === "copy");
  const copy = (copies.find((r) => r.asset.channel === "verda") ?? copies[0])?.asset.content as Listing | undefined;
  return {
    product, hero: pick(media, "hero"), lifestyle: pick(media, "lifestyle"), inUse: pick(media, "in_use"), claim: pick(media, "claim_card"), video: pick(media, "video"),
    copy: copy ?? null, count: mine.length,
    publishedAt: mine.reduce((max, r) => (r.publishedAt > max ? r.publishedAt : max), mine[0].publishedAt),
  };
}

export async function listSiteProducts() {
  const [{ data: products }, rows] = await Promise.all([db().from("products").select("*").eq("hidden", false).order("sku"), published()]);
  return ((products ?? []) as unknown as Product[]).map((p) => toSite(p, rows)).filter(Boolean) as SiteProduct[];
}

export async function getSiteProduct(slug: string) {
  const { data } = await db().from("products").select("*").eq("slug", slug).maybeSingle();
  const product = data as unknown as Product | null;
  if (!product || product.hidden) return null;
  return toSite(product, await published([product.id]));
}

export async function listAllProducts() {
  const { data } = await db().from("products").select("*").eq("hidden", false).order("sku");
  return (data ?? []) as unknown as Product[];
}

export async function publicationLog() {
  const { data } = await db().from("publications").select("id,asset_id,channel,target,url,published_by,published_at").order("published_at", { ascending: false }).limit(50);
  const pubs = (data ?? []) as unknown as { id: string; asset_id: string; channel: Channel; target: string; url: string; published_by: string; published_at: string }[];
  const { data: assetRows } = pubs.length ? await db().from("assets").select("id,shot_key,version,storage_path,product_id").in("id", pubs.map((p) => p.asset_id)) : { data: [] };
  const assets = new Map(((assetRows ?? []) as unknown as Asset[]).map((a) => [a.id, a]));
  return pubs.map((p) => ({ ...p, asset: assets.get(p.asset_id) }));
}
