import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { db, publicUrl } from "@/lib/supabase/server";
import { getProduct, saveSource } from "@/lib/data/products";
import { putFile } from "@/lib/storage";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import type { Product } from "@/lib/domain/types";

const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can upload." }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image to upload." }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Images can be up to 20 MB." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return Response.json({ error: "That file couldn't be read as an image." }, { status: 400 });
  }
  if ((meta.width ?? 0) < 512 || (meta.height ?? 0) < 512) return Response.json({ error: "Use an image at least 512 × 512 pixels." }, { status: 400 });

  const existingId = String(form.get("productId") ?? "");
  let product: Product | null = existingId ? await getProduct(existingId) : null;
  if (!product) {
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    const { data, error } = await db().from("products").insert({ sku: `NEW-${suffix}`, slug: `new-${suffix.toLowerCase()}`, name: "New product", source: "upload" } as never).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    product = data as Product;
  }

  const png = await sharp(buffer).rotate().png().toBuffer();
  const path = await putFile("sources", `${product.id}/front-${randomUUID()}.png`, png, "image/png");
  await saveSource(product.id, "front", path, meta.width, meta.height);
  await db().from("products").update({ analysis_status: "none", analysis: null, analysis_error: null } as never).eq("id", product.id);
  await logEvent({ entity: "product", entity_id: product.id, type: "source_uploaded", actor: await getRole() });
  return Response.json({ product, frontUrl: publicUrl("sources", path) });
}
