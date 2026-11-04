import "server-only";
import { randomUUID } from "node:crypto";
import { generateText, Output, type ModelMessage } from "ai";
import { visionModel } from "@/lib/ai/models";
import { db, publicUrl } from "@/lib/supabase/server";
import { getSource, saveSource } from "@/lib/data/products";
import { logEvent } from "@/lib/events";
import { getFile, putFile } from "@/lib/storage";
import { CUTOUT_CREDITS } from "@/lib/runway/model-registry";
import { ANALYSIS_PROMPT, analysisSchema } from "./analysis-schema";
import { applyMask, generateMask } from "./cutout";

export function analysisMessages(image: Buffer, back: Buffer | null): ModelMessage[] {
  return [{ role: "user", content: [
    { type: "text", text: back ? `${ANALYSIS_PROMPT}\n\nThe first image is the front of the pack and the second is the back. Include text and claims from both. Judge source quality, image type and background from the front.` : ANALYSIS_PROMPT },
    { type: "file", data: image, mediaType: "image/png" },
    ...(back ? [{ type: "file" as const, data: back, mediaType: "image/png" }] : []),
  ] }];
}

/** Masks the real pack, so that its own pixels can be placed in every scene. */
export async function createCutout(id: string, source: Buffer) {
  const result = await applyMask(source, await generateMask(source));
  const suffix = randomUUID();
  const [maskPath, cutoutPath] = await Promise.all([
    putFile("sources", `${id}/mask-${suffix}.png`, result.mask, "image/png"),
    putFile("sources", `${id}/cutout-${suffix}.png`, result.cutout, "image/png"),
  ]);
  await Promise.all([saveSource(id, "mask", maskPath, 1024, 1024), saveSource(id, "cutout", cutoutPath, result.width, result.height)]);
  await logEvent({ entity: "product", entity_id: id, type: "cutout_created", credits: CUTOUT_CREDITS, detail: { coverage: result.coverage } });
  return publicUrl("sources", cutoutPath);
}

async function analyze(id: string, image: Buffer, back: Buffer | null) {
  await db().from("products").update({ analysis_status: "running", analysis_error: null } as never).eq("id", id);
  try {
    const { output, usage } = await generateText({ model: visionModel, output: Output.object({ schema: analysisSchema }), messages: analysisMessages(image, back) });
    await db().from("products").update({ analysis: output, analysis_status: "done" } as never).eq("id", id);
    await logEvent({ entity: "product", entity_id: id, type: "analyzed", tokens: usage.totalTokens ?? 0 });
  } catch (error) {
    await db().from("products").update({ analysis_status: "failed", analysis_error: String(error) } as never).eq("id", id);
    throw error;
  }
}

/**
 * Products from the catalog arrive with images and a sheet, so the first Generate reads the pack and cuts it out.
 * Generating can't go ahead without the cutout. Prompts can do without an analysis, so its failure doesn't stop a run.
 */
export async function prepareProduct(id: string) {
  const [front, backSource, cutout] = await Promise.all([getSource(id, "front"), getSource(id, "back"), getSource(id, "cutout")]);
  if (cutout) return;
  if (!front) throw new Error("This product needs an image first.");
  const [image, back] = await Promise.all([getFile("sources", front.storage_path), backSource ? getFile("sources", backSource.storage_path) : null]);
  const [analysis, mask] = await Promise.allSettled([analyze(id, image, back), createCutout(id, image)]);
  if (mask.status === "rejected") throw mask.reason;
  if (analysis.status === "rejected") console.error("Analysis failed while preparing a product", analysis.reason);
}
