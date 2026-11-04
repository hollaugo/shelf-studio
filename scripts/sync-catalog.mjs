// Loads the catalog into the product database: each product's sheet, and its front and back images.
// This stands in for a Salsify sync. Safe to run repeatedly, and it leaves a product's existing images alone.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const dir = new URL("../supabase/seed-assets/", import.meta.url);
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

const sheet = JSON.parse(readFileSync(new URL("product-sheet.json", dir), "utf8"));
for (const { sku, name, size, primary_claim, channels, details } of sheet) {
  const slug = name.toLowerCase().replace(/^verda\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const data = { name, size, primary_claim, approved_claims: [primary_claim], channels, details, source: "sku_sheet" };
  const existing = must(await db.from("products").select("id").eq("sku", sku).maybeSingle());
  const { id } = existing
    ? must(await db.from("products").update(data).eq("id", existing.id).select("id").single())
    : must(await db.from("products").insert({ ...data, sku, slug }).select("id").single());
  const sources = must(await db.from("source_assets").select("kind").eq("product_id", id));
  for (const kind of ["front", "back"]) {
    if (sources.some((s) => s.kind === kind)) continue;
    const image = sharp(readFileSync(new URL(`catalog/${sku}-${kind}.webp`, dir)));
    const { width, height } = await image.metadata();
    const path = `${id}/${kind}-${randomUUID()}.png`;
    must(await db.storage.from("sources").upload(path, await image.png().toBuffer(), { contentType: "image/png", cacheControl: "31536000" }));
    must(await db.from("source_assets").upsert({ product_id: id, kind, storage_path: path, width, height }, { onConflict: "product_id,kind" }));
  }
}
console.log(`Synced ${sheet.length} products.`);
