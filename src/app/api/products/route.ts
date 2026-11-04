import { randomUUID } from "node:crypto";
import { db, publicUrl } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { checkUpload, savePackshot } from "@/lib/data/uploads";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import type { Product } from "@/lib/domain/types";

export async function POST(req: Request) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can upload." }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image to upload." }, { status: 400 });
  const front = await checkUpload(file, "front image");
  if ("error" in front) return Response.json({ error: front.error }, { status: 400 });
  const backFile = form.get("back");
  const back = backFile instanceof File ? await checkUpload(backFile, "back image") : null;
  if (back && "error" in back) return Response.json({ error: back.error }, { status: 400 });

  const existingId = String(form.get("productId") ?? "");
  let product: Product | null = existingId ? await getProduct(existingId) : null;
  if (!product) {
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    const { data, error } = await db().from("products").insert({ sku: `NEW-${suffix}`, slug: `new-${suffix.toLowerCase()}`, name: "New product", source: "upload" } as never).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    product = data as Product;
  }

  const path = await savePackshot(product.id, "front", front);
  if (back) await savePackshot(product.id, "back", back);
  await db().from("products").update({ analysis_status: "none", analysis: null, analysis_error: null } as never).eq("id", product.id);
  await logEvent({ entity: "product", entity_id: product.id, type: "source_uploaded", actor: await getRole() });
  return Response.json({ product, frontUrl: publicUrl("sources", path) });
}
