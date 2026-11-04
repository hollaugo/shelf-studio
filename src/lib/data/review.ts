import "server-only";
import { db, publicUrl } from "@/lib/supabase/server";
import { summarizeChecks } from "@/lib/domain/status";
import type { Asset, CheckRow, Product } from "@/lib/domain/types";

export type BoardItem = { asset: Asset; url: string | null; product: Pick<Product, "name" | "sku">; checks: ReturnType<typeof summarizeChecks>; regenerating: boolean };

export async function getBoard(): Promise<BoardItem[]> {
  const [{ data: assets }, { data: products }] = await Promise.all([
    db().from("assets").select("*").eq("is_current", true).in("state", ["needs_review", "approved", "rejected", "published", "generating", "compositing", "checking", "failed"]).order("updated_at", { ascending: false }),
    db().from("products").select("id,name,sku,hidden"),
  ]);
  const hidden = new Set(((products ?? []) as unknown as { id: string; hidden: boolean }[]).filter((p) => p.hidden).map((p) => p.id));
  const rows = ((assets ?? []) as unknown as Asset[]).filter((a) => !hidden.has(a.product_id));
  const { data: checkRows } = rows.length ? await db().from("check_results").select("asset_id,result").in("asset_id", rows.map((a) => a.id)) : { data: [] };
  const checks = (checkRows ?? []) as unknown as CheckRow[];
  const byId = new Map(((products ?? []) as unknown as (Pick<Product, "name" | "sku"> & { id: string })[]).map((p) => [p.id, p]));
  return rows.map((asset) => ({
    asset,
    url: publicUrl("outputs", asset.storage_path),
    product: byId.get(asset.product_id) ?? { name: "", sku: "" },
    checks: summarizeChecks(checks.filter((c) => c.asset_id === asset.id).map((c) => c.result)),
    regenerating: !!asset.feedback && ["generating", "compositing", "checking", "draft"].includes(asset.state),
  }));
}
