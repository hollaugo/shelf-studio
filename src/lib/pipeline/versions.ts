import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events";
import { canCreateChild } from "@/lib/domain/state-machine";
import type { Asset, AssetState, Generation } from "@/lib/domain/types";
import { tick } from "./tick";

export async function getAsset(id: string) {
  const { data } = await db().from("assets").select("*").eq("id", id).maybeSingle();
  return data as unknown as Asset | null;
}

/**
 * Every edit is a new version. The parent stays exactly as it was, keeping its files and any approval on record,
 * and just stops being the current one.
 */
export async function createChild(parent: Asset, input: { state: AssetState; generationId?: string | null; overlay?: unknown; refine?: unknown; feedback?: string | null; actor: string; reason: string }) {
  if (!canCreateChild(parent.state)) throw new Error(`A ${parent.state} asset can't be changed.`);
  const { error: clearError } = await db().from("assets").update({ is_current: false } as never).eq("id", parent.id).eq("is_current", true);
  if (clearError) throw new Error(clearError.message);
  const { data, error } = await db().from("assets").insert({
    product_id: parent.product_id, run_id: parent.run_id, spec_id: parent.spec_id, shot_key: parent.shot_key, channel: parent.channel,
    parent_id: parent.id, version: parent.version + 1, state: input.state,
    generation_id: input.generationId === undefined ? parent.generation_id : input.generationId,
    overlay: input.overlay === undefined ? parent.overlay : input.overlay,
    refine: input.refine ?? null, feedback: input.feedback ?? null,
  } as never).select("*").single();
  if (error) {
    await db().from("assets").update({ is_current: true } as never).eq("id", parent.id);
    throw new Error(error.message);
  }
  const child = data as unknown as Asset;
  await logEvent({ entity: "asset", entity_id: child.id, type: "version_created", actor: input.actor, to_state: input.state, detail: { parent: parent.id, reason: input.reason } });
  after(() => tick().catch((e) => console.error("Tick after new version failed", e)));
  return child;
}

export async function newSceneGeneration(asset: Asset, opts: { direction?: string | null; feedback?: string | null }) {
  const { data: spec } = await db().from("channel_specs").select("scene_ratio").eq("id", asset.spec_id!).single();
  const { data: template } = await db().from("shot_templates").select("model").eq("key", asset.shot_key).single();
  const { data, error } = await db().from("generations").insert({
    product_id: asset.product_id, run_id: null, scene_key: `refine:${randomUUID()}`, kind: "image",
    model: (template as unknown as { model: string }).model, ratio: (spec as unknown as { scene_ratio: string }).scene_ratio,
    inputs: { shot: asset.shot_key, direction: opts.direction ?? null, feedback: opts.feedback ?? null },
  } as never).select("*").single();
  if (error) throw new Error(error.message);
  return data as unknown as Generation;
}

export async function newVideoGeneration(asset: Asset, still: Asset, prompt: string, feedback?: string | null) {
  const { data, error } = await db().from("generations").insert({
    product_id: asset.product_id, run_id: null, scene_key: `video:${randomUUID()}`, kind: "video", model: "gen4.5", ratio: "720:1280", prompt,
    inputs: { shot: "video", stillPath: still.storage_path, stillId: still.id, feedback: feedback ?? null },
  } as never).select("*").single();
  if (error) throw new Error(error.message);
  return data as unknown as Generation;
}
