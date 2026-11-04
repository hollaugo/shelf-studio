import "server-only";
import { db, publicUrl } from "@/lib/supabase/server";
import { getProductBySku, getSources } from "./products";
import { describeAsset, type CardView } from "@/lib/domain/describe";
import { planShots } from "@/lib/pipeline/plan";
import { accountLimits } from "@/lib/runway/client";
import { SHOT_ORDER, type Asset, type Channel, type ChannelSpec, type CheckRow, type Generation, type ShotTemplate } from "@/lib/domain/types";

export type AssetView = {
  asset: Asset;
  view: CardView;
  url: string | null;
  sceneUrl: string | null;
  meta: string;
  mode: ShotTemplate["mode"];
};

function metaLine(asset: Asset, spec: ChannelSpec | undefined) {
  if (asset.shot_key === "copy") return "Title, bullets, description, SEO and AEO";
  if (asset.shot_key === "video") return "5 s · 9:16 · from approved still";
  const size = spec ? `${spec.width} × ${spec.height}` : "";
  if (asset.shot_key === "hero") return `${size} · pure white`;
  if (asset.shot_key === "claim_card") return `${size} · from SKU data`;
  return `${size} · scene + real packshot`;
}

export async function getDetail(sku: string) {
  const product = await getProductBySku(sku);
  if (!product) return null;
  const [sources, assetsRes, gensRes, specsRes, templatesRes] = await Promise.all([
    getSources(product.id),
    db().from("assets").select("*").eq("product_id", product.id).eq("is_current", true),
    db().from("generations").select("*").eq("product_id", product.id),
    db().from("channel_specs").select("*"),
    db().from("shot_templates").select("*"),
  ]);
  const assets = (assetsRes.data ?? []) as Asset[];
  const gens = (gensRes.data ?? []) as Generation[];
  const specs = (specsRes.data ?? []) as ChannelSpec[];
  const templates = (templatesRes.data ?? []) as ShotTemplate[];
  const { data: checkData } = assets.length ? await db().from("check_results").select("*").in("asset_id", assets.map((a) => a.id)) : { data: [] };
  const checks = (checkData ?? []) as CheckRow[];
  const genById = new Map(gens.map((g) => [g.id, g]));
  const specById = new Map(specs.map((s) => [s.id, s]));
  const modeOf = (k: string) => templates.find((t) => t.key === k)?.mode ?? "generated";

  const views: AssetView[] = assets.map((asset) => {
    const generation = asset.generation_id ? genById.get(asset.generation_id) ?? null : null;
    const sourceApproved = assets.some((a) => a.product_id === asset.product_id && a.shot_key === "lifestyle" && (a.state === "approved" || a.state === "published") && a.channel === asset.channel);
    const mode = modeOf(asset.shot_key);
    return {
      asset, mode,
      view: describeAsset(asset, mode, generation, checks.filter((c) => c.asset_id === asset.id).map((c) => c.result), sourceApproved),
      url: publicUrl("outputs", asset.storage_path),
      sceneUrl: publicUrl("outputs", generation?.output_path),
      meta: metaLine(asset, asset.spec_id ? specById.get(asset.spec_id) : undefined),
    };
  }).sort((a, b) => SHOT_ORDER.indexOf(a.asset.shot_key) - SHOT_ORDER.indexOf(b.asset.shot_key));

  const estimate = (channels: Channel[]) => planShots({ runId: "estimate", channels, specs, templates, existing: new Set(assets.map((a) => `${a.channel}:${a.shot_key}`)) });
  const estimates = Object.fromEntries(product.channels.map((c) => [c, estimate([c])])) as Record<Channel, ReturnType<typeof estimate>>;
  const everything = estimate(product.channels);

  const running = gens.filter((g) => g.status === "running").length;
  const queued = gens.filter((g) => g.status === "queued").length;
  const limits = await accountLimits().catch(() => null);
  const imageLimit = limits?.models["gemini_image3.1_flash"];

  return {
    product,
    sources,
    views,
    estimates,
    everything,
    channels: product.channels,
    run: {
      running, queued,
      working: assets.filter((a) => a.state === "generating" || a.state === "compositing" || (a.state === "checking" && !a.checks_done_at)).length,
      spent: gens.reduce((s, g) => s + g.credits, 0),
      maxConcurrent: imageLimit?.maxConcurrent ?? null,
      maxDaily: imageLimit?.maxDaily ?? null,
      usedToday: imageLimit?.usedToday ?? null,
      creditBalance: limits?.creditBalance ?? null,
    },
  };
}

export type Detail = NonNullable<Awaited<ReturnType<typeof getDetail>>>;
