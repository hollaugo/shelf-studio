import "server-only";
import { db } from "@/lib/supabase/server";
import { computeMetrics, type MetricsInput } from "@/lib/domain/metrics";

/** The Model lab's spend is research, not the cost of making a product's assets. */
const isLabSpend = (sceneKey: string) => sceneKey.startsWith("eval:") || sceneKey.startsWith("lab:");

export async function getMetrics() {
  const [products, pdpRows, generations, cutouts, reviews, baseline] = await Promise.all([
    db().from("products").select("id,sku,name,source,channels,created_at").eq("hidden", false).order("sku"),
    db().from("pdps").select("id,product_id,channel,status,live_at"),
    db().from("generations").select("product_id,scene_key,credits"),
    db().from("events").select("entity_id,credits").eq("type", "cutout_created"),
    // Decisions made per asset, before PDPs, measure something different, so they stay out of these figures.
    db().from("reviews").select("pdp_id,decision,created_at").not("pdp_id", "is", null),
    db().from("settings").select("value").eq("key", "baseline_turnaround_days").maybeSingle(),
  ]);
  const pdps = (pdpRows.data ?? []) as unknown as (MetricsInput["pdps"][number] & { id: string })[];
  const baselineDays = (baseline.data as unknown as { value: number } | null)?.value ?? null;
  const input: MetricsInput = {
    // An upload that was never confirmed has no channels yet, so it isn't a product anyone should see.
    products: ((products.data ?? []) as unknown as (MetricsInput["products"][number] & { source: string; channels: string[] })[]).filter((p) => p.source !== "upload" || p.channels.length > 0),
    pdps,
    spend: [
      ...((generations.data ?? []) as unknown as { product_id: string; scene_key: string; credits: number }[]).filter((g) => !isLabSpend(g.scene_key)),
      ...((cutouts.data ?? []) as unknown as { entity_id: string; credits: number }[]).map((c) => ({ product_id: c.entity_id, credits: c.credits })),
    ],
    reviews: ((reviews.data ?? []) as unknown as { pdp_id: string; decision: "approve" | "reject"; created_at: string }[]).flatMap((r) => {
      const pdp = pdps.find((p) => p.id === r.pdp_id);
      return pdp ? [{ product_id: pdp.product_id, channel: pdp.channel, decision: r.decision, created_at: r.created_at }] : [];
    }),
    baselineDays,
  };
  return { ...computeMetrics(input), baselineDays };
}
