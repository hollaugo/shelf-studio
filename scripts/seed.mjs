// Loads the shot list, channel specs, brand settings and SKU sheet. Safe to run repeatedly.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const dir = new URL("../supabase/seed-assets/", import.meta.url);
const must = ({ error }) => { if (error) throw new Error(error.message); };

const shots = [
  { key: "hero", label: "Main image", mode: "deterministic", sort: 1, model: null, prompt_template: null },
  { key: "lifestyle", label: "Lifestyle", mode: "generated", sort: 2, model: "gemini_image3.1_flash", prompt_template: "An everyday bathroom moment: a clear, empty stone shelf or ledge in natural window light, where the product will be placed later." },
  { key: "in_use", label: "In-use", mode: "generated", sort: 3, model: "gemini_image3.1_flash", prompt_template: "A close-up that suggests use: a soft swirl of product texture and lather on a clear stone surface, with an empty area where the product will be placed later." },
  { key: "claim_card", label: "Claim card", mode: "deterministic", sort: 4, model: null, prompt_template: null },
  { key: "video", label: "Video", mode: "image_to_video", sort: 5, model: "gen4.5", source_shot: "lifestyle", prompt_template: "A slow, steady push-in as morning light shifts gently across the scene. The product stays still and sharp." },
  { key: "copy", label: "Product copy", mode: "agent_copy", sort: 6, model: "claude-opus-5-5", prompt_template: null },
];
must(await db.from("shot_templates").upsert(shots.map((s) => ({ source_shot: null, ...s })), { onConflict: "key" }));

const SQUARE = "2048:2048", WIDE = "2752:1536", TALL = "720:1280";
const still = (channel, size, format, max_mb) => ["lifestyle", "in_use", "claim_card"].map((shot_key) => ({ channel, shot_key, width: size, height: size, scene_ratio: SQUARE, format, max_mb, white_bg: false, min_fill: null, text_allowed: true }));
const channel = (channel, size, format, max_mb) => [
  { channel, shot_key: "hero", width: size, height: size, scene_ratio: null, format, max_mb, white_bg: true, min_fill: 0.85, text_allowed: false },
  ...still(channel, size, format, max_mb),
  { channel, shot_key: "video", width: 720, height: 1280, scene_ratio: TALL, format: "mp4", max_mb: null, white_bg: false, min_fill: null, text_allowed: true },
  { channel, shot_key: "copy", width: null, height: null, scene_ratio: null, format: "text", max_mb: null, white_bg: false, min_fill: null, text_allowed: true },
];
const specs = [...channel("amazon", 2000, "jpg", 10), ...channel("walmart", 2200, "jpg", 5), ...channel("target", 2400, "jpg", null), ...channel("verda", 2000, "jpg", 5)]
  .map((s) => (s.channel === "verda" && s.shot_key === "lifestyle" ? { ...s, width: 2400, height: 1340, scene_ratio: WIDE } : s));
must(await db.from("channel_specs").upsert(specs, { onConflict: "channel,shot_key" }));

const json = (name) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const { data: existing } = await db.from("settings").select("key");
const have = new Set((existing ?? []).map((r) => r.key));
// Settings are edited in the app, so a re-seed must not overwrite them.
for (const [key, value] of [["style_guide", json("style-guide.json")], ["legal_rules", json("legal-rules.json")]])
  if (!have.has(key)) must(await db.from("settings").insert({ key, value }));

const rows = readFileSync(new URL("skus.csv", dir), "utf8").trim().split("\n").slice(1).map((line) => {
  const cols = line.match(/("([^"]*)"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
  return { sku: cols[0], name: cols[1], size: cols[2], primary_claim: cols[3], channels: cols[4].split(",") };
});
for (const r of rows) {
  const slug = r.name.toLowerCase().replace(/^verda\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  must(await db.from("products").upsert({ ...r, slug, approved_claims: [r.primary_claim], source: "sku_sheet" }, { onConflict: "sku" }));
}
// Fixed test images for the suite's analysis and cutout prompts.
for (const [name, file] of [["back", "verda_shampoo_back_packshot.webp"], ["lifestyle", "good_lifestyle_still.webp"]]) {
  must(await db.storage.from("sources").upload(`eval-fixtures/${name}.webp`, readFileSync(new URL(file, dir)), { contentType: "image/webp", upsert: true }));
}
// The prompt library. Edits in the app are kept, so only new prompts are added.
const cases = json("eval-cases.json").map((c, sort) => ({ shape: "square", agent_prompt: false, shot: null, look_for: "", spec: {}, ...c, sort }));
must(await db.from("eval_cases").upsert(cases, { onConflict: "key", ignoreDuplicates: true }));

// Brings comparisons from the first version of the lab into the suite, so nothing is lost.
const { data: earlier } = await db.from("generations").select("*").like("scene_key", "lab:%").order("created_at");
const batches = new Map();
for (const g of earlier ?? []) batches.set(g.inputs.labBatch, [...(batches.get(g.inputs.labBatch) ?? []), g]);
for (const [batch, gens] of batches) {
  const first = gens[0];
  const key = `earlier-${batch.slice(0, 8)}`;
  must(await db.from("eval_cases").upsert({ key, kind: first.kind, category: "earlier", title: `Earlier ${first.kind} comparison`, prompt: first.prompt ?? "", shape: first.ratio === "2752:1536" ? "wide" : "square", is_active: false, sort: 1000 }, { onConflict: "key", ignoreDuplicates: true }));
  const { data: row } = await db.from("eval_cases").select("id").eq("key", key).single();
  const { data: existing } = await db.from("eval_tasks").select("id").eq("case_id", row.id).limit(1);
  if (existing?.length) continue;
  const { data: run, error } = await db.from("eval_runs").insert({ product_id: first.product_id, kind: first.kind, name: "Earlier Model lab comparison", created_by: "producer", est_credits: gens.reduce((n, g) => n + g.credits, 0), created_at: first.created_at }).select("id").single();
  if (error) throw new Error(error.message);
  must(await db.from("eval_tasks").insert(gens.map((g) => ({ run_id: run.id, case_id: row.id, model: g.model, generation_id: g.id, prompt: g.prompt ?? "", composite_path: g.inputs.compositePath ?? null, processed_at: g.inputs.compositePath || g.kind === "video" ? g.created_at : null, created_at: g.created_at }))));
}

for (const bucket of ["sources", "outputs"]) await db.storage.updateBucket(bucket, { public: true });
console.log(`Seeded ${shots.length} shots, ${specs.length} specs, ${rows.length} products, ${cases.length} eval prompts, imported ${batches.size} earlier comparisons.`);
