// Writes every product's current assets to outputs/<SKU>/<channel>/, as they are, with a manifest of how each was made.
// Run with: npm run export
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
const root = new URL("../outputs/", import.meta.url);
rmSync(root, { recursive: true, force: true });

const products = must(await db.from("products").select("id,sku,name").eq("hidden", false).order("sku"));
const summary = [];
for (const product of products) {
  const assets = must(await db.from("assets").select("id,channel,shot_key,version,state,width,height,storage_path,content,generation_id").eq("product_id", product.id).eq("is_current", true).order("channel"));
  const made = assets.filter((a) => a.storage_path || a.content);
  if (!made.length) continue;
  const gens = must(await db.from("generations").select("id,model,prompt,credits,inputs").eq("product_id", product.id));
  const checks = must(await db.from("check_results").select("asset_id,check_key,result").in("asset_id", made.map((a) => a.id)));
  const pdps = must(await db.from("pdps").select("channel,version,status").eq("product_id", product.id).order("version"));
  for (const channel of [...new Set(made.map((a) => a.channel))]) {
    const dir = new URL(`${product.sku}/${channel}/`, root);
    mkdirSync(dir, { recursive: true });
    const manifest = [];
    for (const asset of made.filter((a) => a.channel === channel)) {
      const g = gens.find((x) => x.id === asset.generation_id);
      const file = asset.storage_path ? `${asset.shot_key}.${asset.storage_path.split(".").pop()}` : "listing.json";
      if (asset.storage_path) writeFileSync(new URL(file, dir), Buffer.from(await must(await db.storage.from("outputs").download(asset.storage_path)).arrayBuffer()));
      else writeFileSync(new URL(file, dir), `${JSON.stringify(asset.content, null, 2)}\n`);
      manifest.push({
        shot: asset.shot_key, file, assetVersion: asset.version, size: asset.width ? `${asset.width}x${asset.height}` : null,
        model: g?.model ?? null, modelDrewPack: !!g?.inputs?.modelPlaced, labelReadBack: g?.inputs?.pack?.passed ?? null, labelRedraws: g?.inputs?.labelRetries ?? 0, generationCredits: g?.credits ?? 0,
        checks: Object.fromEntries(["pass", "warn", "fail"].map((r) => [r, checks.filter((c) => c.asset_id === asset.id && c.result === r).length])),
        prompt: g?.prompt ?? null,
      });
    }
    const versions = pdps.filter((p) => p.channel === channel).map((p) => `v${p.version} ${p.status}`);
    writeFileSync(new URL("manifest.json", dir), `${JSON.stringify({ sku: product.sku, product: product.name, channel, pdpVersions: versions, assets: manifest }, null, 2)}\n`);
    summary.push(`${product.sku} ${channel}: ${manifest.map((m) => m.shot).join(", ")} (${versions.join(", ")})`);
  }
}
console.log(summary.join("\n"));
