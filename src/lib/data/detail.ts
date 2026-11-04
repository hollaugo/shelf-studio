import "server-only";
import { connection } from "next/server";
import { db } from "@/lib/supabase/server";
import { getProductBySku, getSources } from "./products";
import { canGenerate, itemNote, type Pdp, type PdpItem } from "@/lib/domain/pdp";
import { planShots, reusableScene } from "@/lib/pipeline/plan";
import { accountLimits, MODELS } from "@/lib/runway/client";
import { buildViews } from "./views";
import { pdpsOf } from "./pdps";
import type { AssetView } from "./views";
import type { Asset, Channel, ChannelSpec, CheckRow, Generation, ShotTemplate } from "@/lib/domain/types";

export type { AssetView };

export async function getDetail(sku: string) {
  await connection(); // Live account data and SDK calls belong to the request, not the prerender.
  const product = await getProductBySku(sku);
  if (!product) return null;
  const [sources, assetsRes, gensRes, specsRes, templatesRes, pdps] = await Promise.all([
    getSources(product.id),
    db().from("assets").select("*").eq("product_id", product.id).eq("is_current", true),
    db().from("generations").select("*").eq("product_id", product.id),
    db().from("channel_specs").select("*"),
    db().from("shot_templates").select("*"),
    pdpsOf(product.id),
  ]);
  const assets = (assetsRes.data ?? []) as Asset[];
  const gens = (gensRes.data ?? []) as Generation[];
  const specs = (specsRes.data ?? []) as ChannelSpec[];
  const templates = (templatesRes.data ?? []) as ShotTemplate[];
  const { data: checkData } = assets.length ? await db().from("check_results").select("*").in("asset_id", assets.map((a) => a.id)) : { data: [] };
  const checks = (checkData ?? []) as CheckRow[];
  const { data: itemRows } = pdps.length ? await db().from("pdp_items").select("*").in("pdp_id", pdps.map((p) => p.id)) : { data: [] };
  const items = (itemRows ?? []) as unknown as PdpItem[];
  const openOf = (channel: Channel) => pdps.find((p) => p.channel === channel && (p.status === "draft" || p.status === "in_review" || p.status === "approved")) ?? null;
  const baseOf = (pdp: Pdp | null) => {
    const base = pdp?.based_on ? pdps.find((p) => p.id === pdp.based_on) : null;
    return pdp && base ? { assetIds: items.filter((i) => i.pdp_id === base.id).map((i) => i.asset_id), version: base.version } : null;
  };
  const views: AssetView[] = buildViews(assets, gens, specs, templates, checks).map((v) => {
    const open = openOf(v.asset.channel);
    return { ...v, note: open ? itemNote(v.asset.id, baseOf(open), open.version) : null };
  });

  const reusableScenes = new Map(gens.filter(reusableScene).map((g) => [`${g.inputs.shot}:${g.ratio}`, g.scene_key]));
  const estimate = (channels: Channel[]) => planShots({ runId: "estimate", channels, specs, templates, reusableScenes, existing: new Set(assets.map((a) => `${a.channel}:${a.shot_key}`)) });
  const estimates = Object.fromEntries(product.channels.map((c) => [c, estimate([c])])) as Record<Channel, ReturnType<typeof estimate>>;
  const everything = estimate(product.channels.filter((c) => canGenerate(pdps.filter((p) => p.channel === c))));

  const running = gens.filter((g) => g.status === "running").length;
  const queued = gens.filter((g) => g.status === "queued").length;
  const limits = await accountLimits().catch(() => null);
  const imageLimit = limits?.models[MODELS.scene];

  return {
    product,
    sources,
    views,
    pdps,
    checks,
    estimates,
    everything,
    channels: product.channels,
    videoModel: templates.find((t) => t.key === "video")?.model ?? null,
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
