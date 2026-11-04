import "server-only";
import { db } from "@/lib/supabase/server";
import { computeMetrics, type MetricsInput } from "@/lib/domain/metrics";

/** The Model lab's spend is research, not the cost of making a product's assets. */
const isLabSpend = (sceneKey: string) => sceneKey.startsWith("eval:") || sceneKey.startsWith("lab:");

export async function getMetrics() {
  const [products, assets, publications, generations, cutouts, reviews, baseline] = await Promise.all([
    db().from("products").select("id,sku,name,source,channels,created_at").eq("hidden", false).order("sku"),
    db().from("assets").select("id,product_id,channel,shot_key,state,is_current"),
    db().from("publications").select("asset_id,published_at"),
    db().from("generations").select("product_id,scene_key,credits"),
    db().from("events").select("entity_id,credits").eq("type", "cutout_created"),
    db().from("reviews").select("asset_id,decision,created_at"),
    db().from("settings").select("value").eq("key", "baseline_turnaround_days").maybeSingle(),
  ]);
  const allAssets = (assets.data ?? []) as unknown as { id: string; product_id: string; channel: string; shot_key: string; state: string; is_current: boolean }[];
  const byId = new Map(allAssets.map((a) => [a.id, a]));
  const baselineDays = (baseline.data as unknown as { value: number } | null)?.value ?? null;
  const input: MetricsInput = {
    // An upload that was never confirmed has no channels yet, so it isn't a product anyone should see.
    products: ((products.data ?? []) as unknown as (MetricsInput["products"][number] & { source: string; channels: string[] })[]).filter((p) => p.source !== "upload" || p.channels.length > 0),
    assets: allAssets.filter((a) => a.is_current),
    publications: ((publications.data ?? []) as unknown as { asset_id: string; published_at: string }[]).flatMap((p) => {
      const asset = byId.get(p.asset_id);
      return asset ? [{ product_id: asset.product_id, published_at: p.published_at }] : [];
    }),
    spend: [
      ...((generations.data ?? []) as unknown as { product_id: string; scene_key: string; credits: number }[]).filter((g) => !isLabSpend(g.scene_key)),
      ...((cutouts.data ?? []) as unknown as { entity_id: string; credits: number }[]).map((c) => ({ product_id: c.entity_id, credits: c.credits })),
    ],
    reviews: ((reviews.data ?? []) as unknown as { asset_id: string; decision: "approve" | "reject"; created_at: string }[]).flatMap((r) => {
      const asset = byId.get(r.asset_id);
      return asset ? [{ product_id: asset.product_id, channel: asset.channel, shot_key: asset.shot_key, decision: r.decision, created_at: r.created_at }] : [];
    }),
    baselineDays,
  };
  return { ...computeMetrics(input), baselineDays };
}
