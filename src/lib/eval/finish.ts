import "server-only";
import sharp from "sharp";
import { db } from "@/lib/supabase/server";
import { getProduct, getSource } from "@/lib/data/products";
import { getFile, putFile } from "@/lib/storage";
import { compositeProduct, DEFAULT_PLACEMENT, type Placement } from "@/lib/pipeline/compose";
import { applyMask } from "@/lib/pipeline/cutout";
import { applyOverlay } from "@/lib/pipeline/overlay";
import { readImageText } from "@/lib/pipeline/read-text";
import type { Generation, Product } from "@/lib/domain/types";
import { compareText, cutoutCheck, maskMetrics, type AutoCheck } from "./auto-checks";
import type { EvalKind } from "./criteria";
import { OVERLAY_MODEL, usageCost } from "./models";
import { expectedLines, fillText, type TextSpec } from "./text-in-image";

const FINISHED_PER_TICK = 4;
const WIDE_RATIO = "2752:1536";
/** Lower than the usual placement, so the top third stays free for text. */
const TEXT_PLACEMENT: Placement = { centerX: 0.5, baselineY: 0.96, heightFrac: 0.6, lightFrom: "left" };
const VISION_MODEL_ID = "claude-opus-5-5";

type Row = { id: string; model: string; generation_id: string; run_id: string; case_id: string };
type Finished = { path: string; checks?: AutoCheck | null; inputTokens?: number; outputTokens?: number };

const toJpeg = (image: Buffer) => sharp(image).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
const frameSize = (g: Generation) => ({ W: 1600, H: g.ratio === WIDE_RATIO ? 893 : 1600 });

async function packCutout(g: Generation) {
  const source = await getSource(g.product_id, "cutout");
  if (!source) throw new Error("This product has no cutout.");
  return getFile("sources", source.storage_path);
}

async function finishImage(task: Row, g: Generation): Promise<Finished> {
  const { W, H } = frameSize(g);
  const [scene, cutout] = await Promise.all([getFile("outputs", g.output_path!), packCutout(g)]);
  const pipeline = await compositeProduct(scene, cutout, W, H, (g.inputs.placement as Placement) ?? DEFAULT_PLACEMENT);
  return { path: await putFile("outputs", `${g.product_id}/eval/${task.id}.jpg`, await toJpeg(await pipeline.png().toBuffer()), "image/jpeg") };
}

async function finishTextImage(task: Row, g: Generation, spec: TextSpec, product: Product): Promise<Finished> {
  const { W, H } = frameSize(g);
  const scene = await getFile("outputs", g.output_path!);
  let image = spec.with_pack === false
    ? await sharp(scene).resize(W, H, { fit: "cover" }).png().toBuffer()
    : await (await compositeProduct(scene, await packCutout(g), W, H, TEXT_PLACEMENT)).png().toBuffer();
  if (task.model === OVERLAY_MODEL) {
    image = await applyOverlay(image, { headline: fillText(spec.headline, product), subline: spec.subline ? fillText(spec.subline, product) : null, position: spec.position ?? "top", tone: spec.tone ?? "dark" });
  }
  const jpeg = await toJpeg(image);
  const path = await putFile("outputs", `${g.product_id}/eval/${task.id}.jpg`, jpeg, "image/jpeg");
  try {
    const read = await readImageText(jpeg);
    return { path, checks: compareText(expectedLines(spec, product), read.lines), inputTokens: read.inputTokens, outputTokens: read.outputTokens };
  } catch (error) {
    console.error("Wording check failed", task.id, error);
    return { path, checks: null };
  }
}

const greyMask = (image: Buffer) => sharp(image).resize(1024, 1024).flatten({ background: "#000000" }).toColourspace("b-w").raw().toBuffer();

async function finishCutout(task: Row, g: Generation, spec: { reference?: boolean }): Promise<Finished> {
  const [mask, source] = await Promise.all([getFile("outputs", g.output_path!), getFile("outputs", g.inputs.referencePath as string)]);
  const current = spec.reference ? await getSource(g.product_id, "mask") : null;
  const reference = current ? await greyMask(await getFile("sources", current.storage_path)) : undefined;
  const checks = cutoutCheck(maskMetrics(await greyMask(mask), reference));
  // Magenta makes any fringe or leftover background obvious.
  let preview: Buffer;
  try {
    const { cutout } = await applyMask(source, mask);
    preview = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#ff00d4" } }).composite([{ input: cutout }]).jpeg({ quality: 92 }).toBuffer();
  } catch {
    preview = await toJpeg(mask);
  }
  return { path: await putFile("outputs", `${g.product_id}/eval/${task.id}.jpg`, preview, "image/jpeg"), checks };
}

/** Turns finished Runway outputs into what gets scored, and runs their automatic checks. */
export async function finishEvalImages() {
  const { data } = await db().from("eval_tasks").select("id,model,generation_id,run_id,case_id").is("processed_at", null).not("generation_id", "is", null).order("created_at").limit(300);
  const tasks = (data ?? []) as unknown as Row[];
  if (!tasks.length) return;
  const { data: gens } = await db().from("generations").select("*").in("id", tasks.map((t) => t.generation_id)).eq("kind", "image").eq("status", "done").limit(FINISHED_PER_TICK);
  const ready = (gens ?? []) as unknown as Generation[];
  if (!ready.length) return;
  const chosen = ready.map((g) => ({ g, task: tasks.find((t) => t.generation_id === g.id)! }));
  const [{ data: runs }, { data: cases }] = await Promise.all([
    db().from("eval_runs").select("id,kind").in("id", chosen.map((c) => c.task.run_id)),
    db().from("eval_cases").select("id,spec").in("id", chosen.map((c) => c.task.case_id)),
  ]);
  const kindOf = new Map(((runs ?? []) as unknown as { id: string; kind: EvalKind }[]).map((r) => [r.id, r.kind]));
  const specOf = new Map(((cases ?? []) as unknown as { id: string; spec: Record<string, unknown> }[]).map((c) => [c.id, c.spec]));

  await Promise.all(chosen.map(async ({ g, task }) => {
    const processed_at = new Date().toISOString();
    try {
      const kind = kindOf.get(task.run_id);
      const spec = specOf.get(task.case_id) ?? {};
      let result: Finished;
      if (kind === "cutout") result = await finishCutout(task, g, spec);
      else if (kind === "text_image") {
        const product = await getProduct(g.product_id);
        if (!product) throw new Error("Product not found.");
        result = await finishTextImage(task, g, spec as unknown as TextSpec, product);
      } else result = await finishImage(task, g);
      await db().from("eval_tasks").update({
        composite_path: result.path, checks: result.checks ?? null, processed_at,
        input_tokens: result.inputTokens ?? 0, output_tokens: result.outputTokens ?? 0, cost_usd: usageCost(VISION_MODEL_ID, result.inputTokens ?? 0, result.outputTokens ?? 0),
      } as never).eq("id", task.id);
    } catch (error) {
      console.error("Eval finishing failed", task.id, error);
      await db().from("eval_tasks").update({ processed_at, error: error instanceof Error ? error.message : String(error) } as never).eq("id", task.id);
    }
  }));
}
