import { db, publicUrl } from "@/lib/supabase/server";
import { getAsset } from "@/lib/pipeline/versions";
import { getProduct, getSources } from "@/lib/data/products";
import type { Asset, Generation } from "@/lib/domain/types";

/** Everything the drawer shows: packet, inputs, log and version history. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
  const history: Asset[] = [asset];
  let cursor = asset.parent_id;
  while (cursor) {
    const parent = await getAsset(cursor);
    if (!parent) break;
    history.push(parent);
    cursor = parent.parent_id;
  }
  const ids = history.map((a) => a.id);
  const genIds = history.map((a) => a.generation_id).filter(Boolean) as string[];
  const [checks, generations, events, reviews, publications, product, sources] = await Promise.all([
    db().from("check_results").select("*").eq("asset_id", id).order("ran_at"),
    genIds.length ? db().from("generations").select("*").in("id", genIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    db().from("events").select("*").eq("entity", "asset").eq("entity_id", id).order("at", { ascending: false }).limit(30),
    db().from("reviews").select("*").in("asset_id", ids).order("created_at", { ascending: false }),
    db().from("publications").select("*").in("asset_id", ids).order("published_at", { ascending: false }),
    getProduct(asset.product_id),
    getSources(asset.product_id),
  ]);
  return Response.json({
    asset: { ...asset, url: publicUrl("outputs", asset.storage_path) },
    checks: checks.data ?? [],
    generations: ((generations.data ?? []) as Generation[]).map((g) => ({ id: g.id, model: g.model, ratio: g.ratio, prompt: g.prompt, status: g.status, credits: g.credits, attempt: g.attempt, error_code: g.error_code, created_at: g.created_at, finished_at: g.finished_at, inputs: { direction: g.inputs.direction, feedback: g.inputs.feedback } })),
    events: events.data ?? [],
    reviews: reviews.data ?? [],
    publications: publications.data ?? [],
    history: history.map((a) => ({ id: a.id, version: a.version, state: a.state, feedback: a.feedback, refine: a.refine, credits: a.credits, url: publicUrl("outputs", a.storage_path), created_at: a.created_at })),
    sources: sources.filter((s) => s.kind === "front" || s.kind === "cutout").map((s) => ({ kind: s.kind, url: publicUrl("sources", s.storage_path) })),
    product: product && { name: product.name, sku: product.sku, approved_claims: product.approved_claims },
  });
}
