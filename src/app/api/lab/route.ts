import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { getProduct, getSource } from "@/lib/data/products";
import { loadBrandSettings } from "@/lib/agent/copy-agent";
import { writeScenePrompt } from "@/lib/pipeline/prompts";
import { approvedStill, VIDEO_PROMPT } from "@/lib/pipeline/regenerate";
import { imageModel, videoModel } from "@/lib/runway/model-registry";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import type { Channel } from "@/lib/domain/types";

export const maxDuration = 120;

const body = z.object({
  productId: z.string().uuid(),
  kind: z.enum(["image", "video"]),
  shot: z.enum(["lifestyle", "in_use"]),
  ratio: z.enum(["square", "wide"]),
  models: z.array(z.string()).min(1, "Choose at least one model.").max(6),
  direction: z.string().trim().max(500).optional(),
});

/** Every model gets the same prompt, so differences come from the model. Nothing here touches real assets. */
export async function POST(req: Request) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can start a comparison." }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { productId, kind, shot, ratio, models, direction } = parsed.data;
  const product = await getProduct(productId);
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
  if (!(await getSource(productId, "cutout"))) return Response.json({ error: "Upload this product's image first." }, { status: 409 });
  if (models.some((m) => !(kind === "image" ? imageModel(m) : videoModel(m)))) return Response.json({ error: "Unknown model." }, { status: 400 });

  const batch = randomUUID();
  const baseRatio = ratio === "wide" ? "2752:1536" : "2048:2048";
  let prompt = direction && kind === "video" ? direction : VIDEO_PROMPT;
  let stillPath: string | null = null;
  let stillId: string | null = null;
  if (kind === "image") {
    const [{ styleGuide }, { data: template }] = await Promise.all([loadBrandSettings(), db().from("shot_templates").select("prompt_template").eq("key", shot).single()]);
    const written = await writeScenePrompt({ shotBrief: (template as unknown as { prompt_template: string }).prompt_template, analysis: product.analysis, styleGuide, ratio: ratio === "wide" ? "16:9" : "1:1", model: "photorealistic image model", direction });
    prompt = written.prompt;
  } else {
    let still = null;
    for (const channel of product.channels as Channel[]) {
      still = await approvedStill({ product_id: productId, channel });
      if (still) break;
    }
    if (!still?.storage_path) return Response.json({ error: "Video starts from an approved Lifestyle image. Approve one first." }, { status: 409 });
    stillPath = still.storage_path;
    stillId = still.id;
  }

  const { error } = await db().from("generations").insert(models.map((model) => ({
    product_id: productId, scene_key: `lab:${batch}:${model}`, kind, model, ratio: kind === "video" ? videoModel(model)!.ratio : baseRatio, prompt,
    inputs: kind === "video" ? { labBatch: batch, stillPath, stillId } : { labBatch: batch, labShot: shot },
  })) as never);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logEvent({ entity: "product", entity_id: productId, type: "lab_started", actor: role, detail: { batch, kind, models } });
  return Response.json({ batch });
}
