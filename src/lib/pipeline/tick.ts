import "server-only";
import sharp, { type Sharp } from "sharp";
import { db } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events";
import { getFile, putFile } from "@/lib/storage";
import { publicUrl } from "@/lib/supabase/server";
import { getProduct, getSource } from "@/lib/data/products";
import { accountLimits, downloadOutput, runway } from "@/lib/runway/client";
import { EDIT_MODEL, generationCredits, imageModel, ratioFor, TEXT_MODEL, videoModel } from "@/lib/runway/model-registry";
import { assertTransition, afterGeneration } from "@/lib/domain/state-machine";
import { backoffMs, failurePolicy } from "@/lib/domain/failures";
import { SHOT_LABEL, type Asset, type AssetState, type ChannelSpec, type Generation, type Product, type ShotTemplate } from "@/lib/domain/types";
import { compositeProduct, cropAroundPack, DEFAULT_PLACEMENT, encodeForSpec, renderClaimCard, renderClaimOnScene, renderHero, videoFrame, type Placement } from "./compose";
import { claimCardPrompt, claimLines, claimTypeReference } from "./claim-card";
import { compareText } from "@/lib/eval/auto-checks";
import { readImageText } from "./read-text";
import { inspectPack, packTextFor } from "./inspect-pack";
import { findPlacement, writeScenePrompt } from "./prompts";
import { packCentre, shouldRetryLabel, type PackInspection } from "@/lib/domain/pack-check";
import { runChecks } from "./checks";
import { applyOverlay, type Overlay } from "./overlay";

const STALE_MS = 5 * 60_000;
const IMAGE_GROUP = "image", VIDEO_GROUP = "video";
const CLAIM_MS = 3 * 60_000;
const COPY_STALE_MS = 6 * 60_000;

/** Moves an asset, enforcing the state machine. The state guard makes concurrent ticks safe. */
export async function moveAsset(asset: Pick<Asset, "id" | "state">, to: AssetState, patch: Record<string, unknown> = {}, actor = "system", detail: Record<string, unknown> = {}) {
  assertTransition(asset.state, to);
  const { data, error } = await db().from("assets").update({ ...patch, state: to, claimed_at: null, updated_at: new Date().toISOString() } as never).eq("id", asset.id).eq("state", asset.state).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return false;
  await logEvent({ entity: "asset", entity_id: asset.id, type: "state_changed", from_state: asset.state, to_state: to, actor, detail });
  return true;
}

async function claim(assetId: string) {
  const cutoff = new Date(Date.now() - CLAIM_MS).toISOString();
  const { data } = await db().from("assets").update({ claimed_at: new Date().toISOString() } as never).eq("id", assetId).or(`claimed_at.is.null,claimed_at.lt.${cutoff}`).select("id");
  return Boolean(data?.length);
}

function classifyCreateError(error: unknown) {
  const status = (error as { status?: number }).status;
  if (status === 429) return { retryable: true, code: "HTTP_429" };
  if (status && status >= 500) return { retryable: true, code: "INTERNAL" };
  return { retryable: false, code: "ASSET.INVALID" };
}

/** Only one tick reads a drawn label, so overlapping ticks can't each pay for a retry. A claim lapses if that tick dies. */
async function claimInspection(generationId: string) {
  const cutoff = new Date(Date.now() - CLAIM_MS).toISOString();
  const { data } = await db().from("generations").update({ claimed_at: new Date().toISOString() } as never).eq("id", generationId).or(`claimed_at.is.null,claimed_at.lt.${cutoff}`).select("id");
  return Boolean(data?.length);
}

/** A wrong headline is worth another attempt too. If the text can't be read, the check on the finished card reports that. */
async function claimWordsWrong(image: Buffer, product: Product) {
  try {
    const { lines } = await readImageText(await sharp(image).resize(1500).jpeg({ quality: 92 }).toBuffer());
    return !compareText(claimLines(product), lines).passed;
  } catch (error) {
    console.error("Claim read-back failed", error);
    return false;
  }
}

async function pollRunning(running: Generation[]) {
  await Promise.allSettled(running.filter((g) => g.runway_task_id).map(async (g) => {
    const task = await runway().tasks.retrieve(g.runway_task_id!);
    if (task.status === "SUCCEEDED") {
      const drawn = !!g.inputs.modelPlaced && !g.inputs.textRender;
      if (drawn && !(await claimInspection(g.id))) return;
      const url = task.output[0];
      const body = await downloadOutput(url); // Runway's URLs expire, so outputs are stored straight away.
      const video = g.kind === "video";
      const path = await putFile("outputs", `${g.product_id}/scenes/${g.id}.${video ? "mp4" : "png"}`, body, video ? "video/mp4" : "image/png");
      const inputs = { ...g.inputs };
      // A pack the model drew has its label read straight away, because a wrong word is worth another attempt for every channel sharing the image.
      if (drawn) {
        const product = await getProduct(g.product_id);
        const pack = product ? await inspectPack(body, product) : null;
        const retries = Number(inputs.labelRetries ?? 0);
        const wordsWrong = inputs.drawnClaim && product ? await claimWordsWrong(body, product) : false;
        if (pack && shouldRetryLabel(wordsWrong ? { passed: false } : pack, retries)) {
          await db().from("generations").update({ status: "queued", runway_task_id: null, runway_status: "RETRYING", claimed_at: null, error_code: "LABEL", error: pack.summary, inputs: { ...inputs, labelRetries: retries + 1, lastPack: pack } } as never).eq("id", g.id);
          await logEvent({ entity: "generation", entity_id: g.id, type: "label_retry", detail: { summary: pack.summary, lines: pack.lines, attempt: retries + 1 } });
          return;
        }
        inputs.pack = pack;
      }
      // Text is placed by the prompt, and an edited scene keeps its parent's placement.
      if (!video && !inputs.modelPlaced && !inputs.textRender && !inputs.placement) inputs.placement = await findPlacement(await sharp(body).resize(1024).jpeg().toBuffer(), "image/jpeg", inputs.placementShot ?? inputs.shot);
      const credits = generationCredits(g) * (1 + Number(inputs.labelRetries ?? 0));
      await db().from("generations").update({ status: "done", runway_status: task.status, output_path: path, inputs, credits, finished_at: new Date().toISOString() } as never).eq("id", g.id);
      await logEvent({ entity: "generation", entity_id: g.id, type: "generation_done", credits, detail: { model: g.model, attempt: g.attempt } });
    } else if (task.status === "FAILED" || task.status === "CANCELLED") {
      const code = task.status === "FAILED" ? (task.failureCode ?? "INTERNAL") : "CANCELLED";
      const message = task.status === "FAILED" ? task.failure : "Cancelled";
      const policy = failurePolicy(code);
      if (g.attempt < policy.maxRetries) {
        await db().from("generations").update({ status: "queued", runway_task_id: null, runway_status: "RETRYING", attempt: g.attempt + 1, retry_at: new Date(Date.now() + backoffMs(g.attempt)).toISOString(), error_code: code, error: message } as never).eq("id", g.id);
      } else {
        await db().from("generations").update({ status: "failed", runway_status: task.status, error_code: code, error: message, finished_at: new Date().toISOString() } as never).eq("id", g.id);
      }
      await logEvent({ entity: "generation", entity_id: g.id, type: "generation_failed", detail: { code, attempt: g.attempt } });
    } else if (task.status !== g.runway_status) {
      // THROTTLED means Runway accepted it but it's waiting for capacity. The UI shows that as queued.
      await db().from("generations").update({ runway_status: task.status } as never).eq("id", g.id);
    }
  }));
}

async function shotBrief(g: Generation, templates: ShotTemplate[]) {
  const shot = String(g.inputs.shot ?? "");
  return templates.find((t) => t.key === shot)?.prompt_template ?? "";
}

/** Rebuilds the still without any text overlay, since models smear text as it moves. */
async function stillFrame(g: Generation, w: number, h: number) {
  const fallback = async () => sharp(await getFile("outputs", String(g.inputs.stillPath))).resize(w, h, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
  if (!g.inputs.stillId) return fallback();
  const { data } = await db().from("assets").select("generation_id").eq("id", String(g.inputs.stillId)).single();
  const sceneId = (data as unknown as { generation_id: string | null } | null)?.generation_id;
  const source = await getSource(g.product_id, "cutout");
  if (!sceneId || !source) return fallback();
  const { data: row } = await db().from("generations").select("*").eq("id", sceneId).single();
  let scene = row as unknown as Generation;
  // A model drew text into this scene, so go back to the scene it was made from: text smears in motion.
  if (scene.inputs.baseGeneration) {
    const { data: base } = await db().from("generations").select("*").eq("id", String(scene.inputs.baseGeneration)).single();
    scene = base as unknown as Generation;
  }
  if (!scene.output_path) return fallback();
  if (scene.inputs.modelPlaced) return cropAroundPack(await getFile("outputs", scene.output_path), packCentre((scene.inputs.pack as PackInspection | null | undefined)?.box ?? null), w, h);
  const [image, cutout] = await Promise.all([getFile("outputs", scene.output_path), getFile("sources", source.storage_path)]);
  return videoFrame(image, cutout, (scene.inputs.placement as Placement) ?? DEFAULT_PLACEMENT, w, h);
}

/** The real front and back of the pack, sized to stay under Runway's 5 MB limit for an inline image. */
async function packReferences(productId: string) {
  const sources = (await Promise.all((["front", "back"] as const).map((kind) => getSource(productId, kind)))).filter((s) => !!s);
  return Promise.all(sources.map(async (s) => {
    const image = await sharp(await getFile("sources", s.storage_path)).resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
    return `data:image/jpeg;base64,${image.toString("base64")}`;
  }));
}

async function createTask(g: Generation) {
  if (g.model === EDIT_MODEL.id) {
    const videoUri = publicUrl("outputs", String(g.inputs.sourceVideoPath));
    if (!videoUri) throw new Error("The video to edit has no file.");
    return runway().videoToVideo.create({ model: "aleph2", videoUri, promptText: g.prompt! });
  }
  if (g.kind === "video") {
    const model = videoModel(g.model);
    const ratio = g.ratio;
    const [w, h] = (model?.frame ?? ratio).split(":").map(Number);
    const frame = await stillFrame(g, w, h);
    const still = `data:image/jpeg;base64,${frame.toString("base64")}`;
    return runway().imageToVideo.create({
      model: g.model, ratio, promptText: g.prompt!, promptImage: still, ...(model?.params ?? { duration: 5 }),
    } as never);
  }
  const model = imageModel(g.model);
  if (g.inputs.modelPlaced && !g.inputs.textRender) {
    const [front, back] = await packReferences(g.product_id);
    if (!front) throw new Error("This product needs a front image.");
    const product = g.inputs.drawnClaim ? await getProduct(g.product_id) : null;
    const type = product ? [{ uri: `data:image/jpeg;base64,${(await claimTypeReference(product)).toString("base64")}`, tag: "type" }] : [];
    return runway().textToImage.create({ model: g.model, ratio: model ? ratioFor(model, g.ratio) : g.ratio, promptText: g.prompt!, ...model?.params, referenceImages: [{ uri: front, tag: "front" }, ...(back ? [{ uri: back, tag: "back" }] : []), ...type] } as never);
  }
  const referencePath = g.inputs.referencePath as string | undefined;
  const referenceImages = referencePath ? [{ uri: `data:image/webp;base64,${(await getFile("outputs", referencePath)).toString("base64")}`, tag: String(g.inputs.referenceTag ?? "product") }] : undefined;
  return runway().textToImage.create({ model: g.model, ratio: model ? ratioFor(model, g.ratio) : g.ratio, promptText: g.prompt!, ...model?.params, ...(g.inputs.textRender ? TEXT_MODEL.params : {}), ...(referenceImages && { referenceImages }) } as never);
}

async function dispatchQueued(queued: Generation[], running: Generation[], templates: ShotTemplate[]) {
  if (!queued.length) return;
  const limits = await accountLimits();
  const counts: Record<string, number> = { [IMAGE_GROUP]: 0, [VIDEO_GROUP]: 0 };
  for (const g of running) counts[g.kind === "video" ? VIDEO_GROUP : IMAGE_GROUP]++;
  const dailyUsed = new Map<string, number>();
  const now = Date.now();
  const cap = Number(process.env.RUNWAY_CREDIT_CAP_PER_RUN ?? 500);

  const picks: Generation[] = [];
  for (const g of queued) {
    if (g.retry_at && new Date(g.retry_at).getTime() > now) continue;
    const group = g.kind === "video" ? VIDEO_GROUP : IMAGE_GROUP;
    const limit = limits.models[g.model];
    const max = limit?.maxConcurrent ?? 1;
    if (counts[group] >= max) continue;
    const used = dailyUsed.get(g.model) ?? limit?.usedToday ?? 0;
    if (limit && used >= limit.maxDaily) continue; // Over the rolling daily limit: wait rather than get a 429.
    counts[group]++;
    dailyUsed.set(g.model, used + 1);
    picks.push(g);
  }

  await Promise.allSettled(picks.map(async (g) => {
    const { data: claimed } = await db().from("generations").update({ status: "running", runway_status: "PREPARING", started_at: new Date().toISOString() } as never).eq("id", g.id).eq("status", "queued").select("id");
    if (!claimed?.length) return;
    try {
      if (g.run_id) {
        const { data } = await db().from("generations").select("credits,status,model,ratio,inputs").eq("run_id", g.run_id);
        const rows = (data ?? []) as Pick<Generation, "credits" | "status" | "model" | "ratio" | "inputs">[];
        const committed = rows.reduce((sum, r) => sum + (r.status === "done" ? r.credits : r.status === "running" ? generationCredits(r) : 0), 0);
        if (committed > cap) {
          await db().from("generations").update({ status: "failed", runway_status: "FAILED", error_code: "CREDIT_CAP", error: `Run reached its ${cap} credit cap.`, finished_at: new Date().toISOString() } as never).eq("id", g.id);
          return;
        }
      }
      const product = await getProduct(g.product_id);
      if (!product) throw new Error("Product not found");
      let prompt = g.prompt;
      if (!prompt && g.inputs.drawnClaim) {
        prompt = claimCardPrompt(await shotBrief(g, templates), product, await packTextFor(product).catch(() => null), !!(await getSource(product.id, "back")));
        await db().from("generations").update({ prompt } as never).eq("id", g.id);
      }
      if (!prompt) {
        const { data: setting } = await db().from("settings").select("value").eq("key", "style_guide").maybeSingle();
        const placed = !!g.inputs.modelPlaced;
        const packLines = placed ? await packTextFor(product).catch(() => null) : null;
        const written = await writeScenePrompt({
          placement: placed ? { packLines, hasBack: !!(await getSource(product.id, "back")) } : null,
          shot: String(g.inputs.shot ?? ""), shotBrief: await shotBrief(g, templates), product, analysis: product.analysis, styleGuide: ((setting as { value?: object } | null)?.value ?? {}) as never,
          ratio: g.ratio, model: g.model, direction: g.inputs.direction as string | undefined, feedback: g.inputs.feedback as string | undefined,
        });
        prompt = written.prompt;
        await logEvent({ entity: "generation", entity_id: g.id, type: "prompt_written", tokens: written.tokens });
        await db().from("generations").update({ prompt } as never).eq("id", g.id);
      }
      const task = await createTask({ ...g, prompt });
      await db().from("generations").update({ runway_task_id: task.id, runway_status: "PENDING", attempt: g.attempt } as never).eq("id", g.id);
    } catch (error) {
      const { retryable, code } = classifyCreateError(error);
      const message = error instanceof Error ? error.message : String(error);
      if (retryable && g.attempt < 6) {
        await db().from("generations").update({ status: "queued", runway_status: code === "HTTP_429" ? "RATE_LIMITED" : "RETRYING", attempt: g.attempt + 1, retry_at: new Date(Date.now() + backoffMs(g.attempt)).toISOString(), error_code: code, error: message } as never).eq("id", g.id);
      } else {
        await db().from("generations").update({ status: "failed", runway_status: "FAILED", error_code: code, error: message, finished_at: new Date().toISOString() } as never).eq("id", g.id);
      }
    }
  }));
}

function altText(asset: Asset, product: Product) {
  const what = { hero: "on a pure white background", lifestyle: "in a lifestyle setting", in_use: "with product texture nearby", claim_card: `with the claim ${product.primary_claim ?? ""}`, video: "in a short product video", copy: "" }[asset.shot_key];
  return `${product.name} ${what}`.trim();
}

async function renderAsset(asset: Asset, spec: ChannelSpec, product: Product) {
  const cutoutSource = await getSource(product.id, "cutout");
  if (!cutoutSource) throw new Error("This product has no cutout yet. Upload its image first.");
  const cutout = await getFile("sources", cutoutSource.storage_path);
  const W = spec.width!, H = spec.height!;
  let pipeline: Sharp;
  if (asset.shot_key === "hero") pipeline = await renderHero(cutout, W, H);
  else if (asset.shot_key === "claim_card" && asset.generation_id) {
    const { data } = await db().from("generations").select("output_path,inputs").eq("id", asset.generation_id).single();
    const g = data as unknown as Pick<Generation, "output_path" | "inputs">;
    const card = await getFile("outputs", g.output_path!);
    // A card from before the model drew the whole thing still needs the real pack added.
    pipeline = g.inputs.modelPlaced ? sharp(card).resize(W, H, { fit: "cover", position: "centre" }) : await renderClaimOnScene(card, cutout, W, H);
  } else if (asset.shot_key === "claim_card") pipeline = await renderClaimCard(cutout, product.primary_claim ?? product.name, product.size, W, H);
  else {
    const { data } = await db().from("generations").select("*").eq("id", asset.generation_id!).single();
    const g = data as unknown as Generation;
    const scene = await getFile("outputs", g.output_path!);
    // A pack the model drew is already in the image. Otherwise the real one goes in now.
    pipeline = g.inputs.modelPlaced ? sharp(scene).resize(W, H, { fit: "cover", position: "centre" }) : await compositeProduct(scene, cutout, W, H, (g.inputs.placement as Placement) ?? DEFAULT_PLACEMENT);
    await db().from("assets").update({ scene_path: g.output_path } as never).eq("id", asset.id);
  }
  let image = await pipeline.png().toBuffer();
  if (asset.overlay) image = await applyOverlay(image, asset.overlay as Overlay);
  const encoded = await encodeForSpec(sharp(image), { width: W, height: H, format: spec.format, max_mb: spec.max_mb });
  const fileName = `${product.slug}-${asset.channel}-${asset.shot_key.replace("_", "-")}-v${asset.version}.jpg`;
  const path = await putFile("outputs", `${product.id}/${asset.id}/${fileName}`, encoded, "image/jpeg");
  return { storage_path: path, width: W, height: H, alt_text: altText(asset, product) };
}

async function advanceAssets(gens: Map<string, Generation>, templates: ShotTemplate[]) {
  const { data } = await db().from("assets").select("*").eq("is_current", true).or("state.in.(generating,compositing),and(state.eq.checking,checks_done_at.is.null)");
  const assets = (data ?? []) as Asset[];
  if (!assets.length) return;
  const specIds = [...new Set(assets.map((a) => a.spec_id).filter(Boolean))] as string[];
  const { data: specData } = await db().from("channel_specs").select("*").in("id", specIds);
  const specs = new Map(((specData ?? []) as ChannelSpec[]).map((s) => [s.id, s]));
  const mode = (a: Asset) => templates.find((t) => t.key === a.shot_key)?.mode ?? "generated";

  await Promise.allSettled(assets.map(async (asset) => {
    try {
      if (asset.state === "generating") {
        if (!asset.generation_id) {
          // Copy is driven by the agent, not a generation. If the agent died, offer a retry rather than spinning forever.
          if (asset.shot_key === "copy" && Date.now() - new Date(asset.updated_at).getTime() > COPY_STALE_MS) await moveAsset(asset, "failed", { failure_code: "AGENT", failure_message: "The agent stopped responding. Try again." });
          return;
        }
        let g = gens.get(asset.generation_id);
        if (!g) {
          const { data: row } = await db().from("generations").select("*").eq("id", asset.generation_id).single();
          g = row as unknown as Generation;
        }
        if (g.status === "failed") {
          const policy = failurePolicy(g.error_code);
          await moveAsset(asset, "failed", { failure_code: g.error_code, failure_message: policy.message });
          return;
        }
        if (g.status !== "done") return;
        if (mode(asset) === "image_to_video") {
          await moveAsset(asset, "checking", { storage_path: g.output_path, credits: g.credits, width: Number((videoModel(g.model)?.frame ?? g.ratio).split(":")[0]) || null, height: Number((videoModel(g.model)?.frame ?? g.ratio).split(":")[1]) || null, alt_text: `${asset.channel} product video` });
        } else {
          await moveAsset(asset, afterGeneration(mode(asset)), { credits: g.credits });
        }
        return;
      }
      if (!(await claim(asset.id))) return;
      const product = await getProduct(asset.product_id);
      const spec = asset.spec_id ? specs.get(asset.spec_id) : undefined;
      if (!product || !spec) throw new Error("Missing product or channel spec");
      if (asset.state === "compositing") {
        const rendered = await renderAsset(asset, spec, product);
        await moveAsset(asset, "checking", { ...rendered, checks_done_at: null });
        return;
      }
      if (asset.state === "checking") {
        await runChecks(asset, spec, product);
        await db().from("assets").update({ checks_done_at: new Date().toISOString(), claimed_at: null } as never).eq("id", asset.id);
      }
    } catch (error) {
      console.error(`Asset ${asset.id} (${SHOT_LABEL[asset.shot_key]}) failed in ${asset.state}`, error);
      if (asset.state === "compositing") await moveAsset(asset, "failed", { failure_code: "RENDER", failure_message: error instanceof Error ? error.message : "Rendering failed." });
      else await db().from("assets").update({ claimed_at: null } as never).eq("id", asset.id);
    }
  }));
}

async function finishRuns() {
  const { data } = await db().from("runs").select("id").eq("status", "running");
  await Promise.all(((data ?? []) as { id: string }[]).map(async (run) => {
    const { count } = await db().from("assets").select("id", { count: "exact", head: true }).eq("run_id", run.id).in("state", ["generating", "compositing"]);
    if (!count) await db().from("runs").update({ status: "done", finished_at: new Date().toISOString() } as never).eq("id", run.id);
  }));
}

/**
 * One step of the pipeline. It's idempotent and safe to call concurrently, so a browser poll and a cron job can
 * both drive it. Nothing depends on a long-lived process, which is what lets this run on serverless.
 */
export async function tick() {
  const [{ data: active }, { data: templates }] = await Promise.all([
    db().from("generations").select("*").in("status", ["queued", "running"]).order("created_at"),
    db().from("shot_templates").select("*"),
  ]);
  const rows = (active ?? []) as Generation[];
  const tpl = (templates ?? []) as ShotTemplate[];
  const staleBefore = Date.now() - STALE_MS;
  // A crash between claiming and creating the task would otherwise strand it.
  for (const g of rows.filter((r) => r.status === "running" && !r.runway_task_id && r.started_at && new Date(r.started_at).getTime() < staleBefore))
    await db().from("generations").update({ status: "queued", runway_status: null } as never).eq("id", g.id);

  const running = rows.filter((g) => g.status === "running");
  await pollRunning(running);
  await dispatchQueued(rows.filter((g) => g.status === "queued"), running, tpl);

  const { data: fresh } = await db().from("generations").select("*").in("id", rows.map((g) => g.id));
  await advanceAssets(new Map(((fresh ?? []) as Generation[]).map((g) => [g.id, g])), tpl);
  await finishRuns();
}
