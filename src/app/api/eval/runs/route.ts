import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { getProduct, getSource } from "@/lib/data/products";
import { loadBrandSettings } from "@/lib/agent/copy-agent";
import { writeScenePrompt } from "@/lib/pipeline/prompts";
import { readyStill } from "@/lib/pipeline/regenerate";
import { TEXT_MODEL, videoModel } from "@/lib/runway/model-registry";
import { MASK_PROMPT } from "@/lib/pipeline/cutout";
import { putFile } from "@/lib/storage";
import { isClaudeKind, kindLabel } from "@/lib/eval/criteria";
import { evalModels, OVERLAY_MODEL, OVERLAY_SCENE_MODEL } from "@/lib/eval/models";
import { evalSource, type SourceSpec } from "@/lib/eval/sources";
import { CONFIRM_OVER_CREDITS, estimateRun, MAX_TASKS_PER_RUN } from "@/lib/eval/summary";
import { scenePrompt, textPrompt, type TextSpec } from "@/lib/eval/text-in-image";
import type { EvalCase } from "@/lib/eval/data";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import type { Channel } from "@/lib/domain/types";

export const maxDuration = 300;

const body = z.object({
  productId: z.string().uuid(),
  kind: z.enum(["image", "text_image", "video", "copy", "analysis", "cutout"]),
  caseIds: z.array(z.string().uuid()).min(1, "Choose at least one prompt."),
  models: z.array(z.string()).min(1, "Choose at least one model."),
  name: z.string().trim().max(80).optional(),
  confirmedCredits: z.number().optional(),
});

const BASE_RATIO = { square: "2048:2048", wide: "2752:1536" };

/** Creates a saved run: one task per prompt and model. Nothing here touches real assets. */
export async function POST(req: Request) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can start a run." }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { productId, kind, caseIds, models, name, confirmedCredits } = parsed.data;
  const available = evalModels(kind);
  const registry = models.map((m) => available.find((a) => a.id === m));
  if (registry.some((m) => !m)) return Response.json({ error: "Unknown model." }, { status: 400 });

  const est = estimateRun(caseIds.length, registry.map((m) => m!.credits));
  if (est.tasks > MAX_TASKS_PER_RUN) return Response.json({ error: `A run can have up to ${MAX_TASKS_PER_RUN} tasks. This one has ${est.tasks}.` }, { status: 400 });
  if (est.credits > CONFIRM_OVER_CREDITS && confirmedCredits !== est.credits) return Response.json({ error: `Confirm the $${(est.credits / 100).toFixed(2)} estimate to start this run.` }, { status: 400 });

  const product = await getProduct(productId);
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
  if (!(await getSource(productId, "cutout"))) return Response.json({ error: "Upload this product's image first." }, { status: 409 });
  const { data: caseRows } = await db().from("eval_cases").select("*").in("id", caseIds).eq("kind", kind);
  const cases = (caseRows ?? []) as unknown as EvalCase[];
  if (cases.length !== caseIds.length) return Response.json({ error: "One of those prompts doesn't match this type." }, { status: 400 });

  let stillPath: string | null = null, stillId: string | null = null;
  if (kind === "video") {
    for (const channel of product.channels as Channel[]) {
      const still = await readyStill({ product_id: productId, channel });
      if (still?.storage_path) { stillPath = still.storage_path; stillId = still.id; break; }
    }
    if (!stillPath) return Response.json({ error: "Video starts from a Lifestyle image that has passed its checks. Generate one first." }, { status: 409 });
  }

  // Agent-written cases test the real pipeline. Each gets one prompt, shared by every model so the comparison stays fair.
  const prompts = new Map(cases.map((c) => [c.id, c.prompt]));
  const agentCases = cases.filter((c) => c.agent_prompt);
  if (agentCases.length) {
    const { styleGuide } = await loadBrandSettings();
    const { data: templates } = await db().from("shot_templates").select("key,prompt_template").in("key", agentCases.map((c) => c.shot!));
    const briefs = new Map(((templates ?? []) as unknown as { key: string; prompt_template: string }[]).map((t) => [t.key, t.prompt_template]));
    try {
      await Promise.all(agentCases.map(async (c) => {
        const written = await writeScenePrompt({ shotBrief: briefs.get(c.shot!) ?? "", analysis: product.analysis, styleGuide, ratio: c.shape === "wide" ? "16:9" : "1:1", model: "photorealistic image model" });
        prompts.set(c.id, written.prompt);
      }));
    } catch (error) {
      console.error("Eval prompt writing failed", error);
      return Response.json({ error: "The agent couldn't write its prompts. Nothing was started, so try again." }, { status: 502 });
    }
  }

  const planned = cases.flatMap((c) => models.map((model) => ({ c, model, taskId: randomUUID(), generationId: randomUUID() })));

  // Each model gets the prompt its approach needs. Lettering added afterwards starts from a scene with no text.
  const promptFor = (c: EvalCase, model: string) => {
    if (kind === "text_image") return model === OVERLAY_MODEL ? scenePrompt(c.prompt, c.spec as unknown as TextSpec) : textPrompt(c.prompt, c.spec as unknown as TextSpec, product);
    if (kind === "cutout") return MASK_PROMPT;
    return prompts.get(c.id)!;
  };
  let taskPrompts: Map<string, string>;
  try {
    taskPrompts = new Map(planned.map((p) => [p.taskId, promptFor(p.c, p.model)]));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't write a prompt." }, { status: 409 });
  }

  // A cutout needs its test image up front. Sized as the real pipeline sizes it, and shared across models per case.
  const references = new Map<string, string>();
  if (kind === "cutout") {
    try {
      await Promise.all(cases.map(async (c) => {
        const image = await evalSource(productId, c.spec as SourceSpec);
        const square = await sharp(image).resize(1024, 1024, { fit: "contain", background: "#ffffff" }).webp({ quality: 92 }).toBuffer();
        references.set(c.id, await putFile("outputs", `${productId}/eval/refs/${randomUUID()}.webp`, square, "image/webp"));
      }));
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Couldn't load a test image." }, { status: 409 });
    }
  }

  const { data: run, error: runError } = await db().from("eval_runs").insert({ product_id: productId, kind, name: name || `${product.sku} · ${kindLabel(kind)} · ${cases.length} prompts × ${models.length} models`, created_by: role, est_credits: est.credits } as never).select("id").single();
  if (runError || !run) return Response.json({ error: runError?.message }, { status: 500 });
  const runId = (run as unknown as { id: string }).id;

  if (isClaudeKind(kind)) {
    const { error: taskError } = await db().from("eval_tasks").insert(planned.map((p) => ({ id: p.taskId, run_id: runId, case_id: p.c.id, model: p.model, status: "queued", prompt: p.c.spec.feedback ? `${p.c.prompt} Feedback: ${p.c.spec.feedback}` : p.c.prompt })) as never);
    if (taskError) return Response.json({ error: taskError.message }, { status: 500 });
    await logEvent({ entity: "product", entity_id: productId, type: "eval_started", actor: role, detail: { runId, kind, ...est } });
    return Response.json({ runId, ...est });
  }

  const { error: genError } = await db().from("generations").insert(planned.map((p) => ({
    id: p.generationId, product_id: productId, scene_key: `eval:${p.taskId}`, kind: kind === "video" ? "video" : "image", model: p.model === OVERLAY_MODEL ? OVERLAY_SCENE_MODEL : p.model,
    ratio: kind === "video" ? videoModel(p.model)!.ratio : BASE_RATIO[p.c.shape], prompt: taskPrompts.get(p.taskId),
    inputs: kind === "video" ? { evalRun: runId, stillPath, stillId } : kind === "cutout" ? { evalRun: runId, referencePath: references.get(p.c.id) } : kind === "text_image" && p.model === TEXT_MODEL.id ? { evalRun: runId, textRender: true } : { evalRun: runId },
  })) as never);
  if (genError) return Response.json({ error: genError.message }, { status: 500 });
  const { error: taskError } = await db().from("eval_tasks").insert(planned.map((p) => ({ id: p.taskId, run_id: runId, case_id: p.c.id, model: p.model, generation_id: p.generationId, prompt: taskPrompts.get(p.taskId), processed_at: kind === "video" ? new Date().toISOString() : null })) as never);
  if (taskError) return Response.json({ error: taskError.message }, { status: 500 });

  await logEvent({ entity: "product", entity_id: productId, type: "eval_started", actor: role, detail: { runId, kind, ...est } });
  return Response.json({ runId, ...est });
}
