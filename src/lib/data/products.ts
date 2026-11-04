import "server-only";
import { db, publicUrl } from "@/lib/supabase/server";
import { coverageStatus, type CoverageStatus } from "@/lib/domain/status";
import type { PdpStatus } from "@/lib/domain/pdp";
import type { Asset, Channel, CheckRow, Generation, Product } from "@/lib/domain/types";

export type SourceAsset = { id: string; product_id: string; kind: string; storage_path: string; width: number | null; height: number | null };

export type ProductRow = Product & {
  frontUrl: string | null;
  assets: Asset[];
  coverage: { channel: Channel; status: CoverageStatus }[];
  live: number;
  lastActivity: string;
};

const asset = () => db().from("assets").select("*").eq("is_current", true);

export async function listProducts(): Promise<ProductRow[]> {
  const [products, sources, assets, gens, checks, pdpRows] = await Promise.all([
    db().from("products").select("*").order("sku"),
    db().from("source_assets").select("*").eq("kind", "front"),
    asset(),
    db().from("generations").select("id,status,runway_status").in("status", ["queued", "running"]),
    db().from("check_results").select("asset_id,result").eq("result", "fail"),
    db().from("pdps").select("product_id,channel,status").in("status", ["draft", "in_review", "approved", "live"]),
  ]);
  const pdps = (pdpRows.data ?? []) as unknown as { product_id: string; channel: Channel; status: PdpStatus }[];
  const running = new Map(((gens.data ?? []) as Generation[]).map((g) => [g.id, g]));
  const blocked = new Set(((checks.data ?? []) as CheckRow[]).map((c) => c.asset_id));
  const allAssets = (assets.data ?? []) as Asset[];
  // An upload that was never confirmed has no channels yet, so it isn't a product anyone should see.
  return ((products.data ?? []) as Product[]).filter((p) => !p.hidden && (p.source !== "upload" || p.channels.length > 0)).map((p) => {
    const mine = allAssets.filter((a) => a.product_id === p.id);
    const front = ((sources.data ?? []) as SourceAsset[]).find((s) => s.product_id === p.id);
    const coverage = p.channels.map((channel) => ({
      channel,
      status: coverageStatus(mine.filter((a) => a.channel === channel).map((a) => ({
        state: a.state,
        queued: a.state === "generating" && a.generation_id != null && running.get(a.generation_id)?.status === "queued",
        blocked: a.state === "checking" && blocked.has(a.id),
      })), pdps.filter((d) => d.product_id === p.id && d.channel === channel)),
    }));
    const latest = mine.reduce<string | null>((max, a) => (!max || a.updated_at > max ? a.updated_at : max), null);
    return {
      ...p,
      frontUrl: publicUrl("sources", front?.storage_path),
      assets: mine,
      coverage,
      live: coverage.filter((c) => c.status === "live" || c.status === "live_draft").length,
      lastActivity: latest ?? p.created_at,
    };
  });
}

export async function getProduct(id: string) {
  const { data } = await db().from("products").select("*").eq("id", id).maybeSingle();
  return data as Product | null;
}

export async function getProductBySku(sku: string) {
  const { data } = await db().from("products").select("*").eq("sku", sku).maybeSingle();
  return data as Product | null;
}

export async function getSources(productId: string) {
  const { data } = await db().from("source_assets").select("*").eq("product_id", productId);
  return (data ?? []) as SourceAsset[];
}

export async function getSource(productId: string, kind: string) {
  const { data } = await db().from("source_assets").select("*").eq("product_id", productId).eq("kind", kind).maybeSingle();
  return data as SourceAsset | null;
}

export async function saveSource(productId: string, kind: string, storage_path: string, width?: number, height?: number) {
  const { error } = await db().from("source_assets").upsert({ product_id: productId, kind, storage_path, width, height } as never, { onConflict: "product_id,kind" });
  if (error) throw new Error(error.message);
}
