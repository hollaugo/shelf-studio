import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { pdpsOf } from "@/lib/data/pdps";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import { CHANNEL_LABEL, CHANNELS, type Asset, type Channel, type ChannelSpec, type ShotTemplate } from "@/lib/domain/types";
import { canGenerate } from "@/lib/domain/pdp";
import { ensureDraft } from "@/lib/pipeline/pdp";
import { planShots } from "@/lib/pipeline/plan";
import { prepareProduct } from "@/lib/pipeline/prepare";
import { tick } from "@/lib/pipeline/tick";
import { after } from "next/server";
import { writeCopy } from "@/lib/agent/write-copy";

export const maxDuration = 300;

const body = z.object({ channels: z.array(z.enum(CHANNELS as [Channel, ...Channel[]])).min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can run a shot list." }, { status: 403 });
  const { id } = await params;
  const found = await getProduct(id);
  if (!found) return Response.json({ error: "Product not found." }, { status: 404 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Choose a channel." }, { status: 400 });
  const sold = parsed.data.channels.filter((c) => found.channels.includes(c));
  if (!sold.length) return Response.json({ error: "This product isn't sold on that channel." }, { status: 400 });
  // Assets are made in a draft. A channel with a version already out of draft has to start a new one first.
  const versions = await pdpsOf(id);
  const channels = sold.filter((c) => canGenerate(versions.filter((p) => p.channel === c)));
  if (!channels.length) return Response.json({ error: "This PDP is frozen. Start a new version to generate more." }, { status: 409 });
  try {
    await prepareProduct(id);
  } catch (error) {
    console.error("Preparing a product failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't prepare this product." }, { status: 502 });
  }
  const product = (await getProduct(id)) ?? found;

  const [{ data: specs }, { data: templates }, { data: current }, { data: scenes }] = await Promise.all([
    db().from("channel_specs").select("*"), db().from("shot_templates").select("*"),
    db().from("assets").select("channel,shot_key").eq("product_id", id).eq("is_current", true),
    db().from("generations").select("id,scene_key,ratio,inputs").eq("product_id", id).eq("kind", "image").eq("status", "done").order("created_at"),
  ]);
  const sceneRows = (scenes ?? []) as { id: string; scene_key: string; ratio: string; inputs: { shot?: string; baseGeneration?: string } }[];
  // A scene with text drawn into it belongs to that one version, so it can't be reused.
  const reusableScenes = new Map(sceneRows.filter((g) => !g.inputs.baseGeneration).map((g) => [`${g.inputs.shot}:${g.ratio}`, g.scene_key]));
  const existing = new Set(((current ?? []) as { channel: string; shot_key: string }[]).map((a) => `${a.channel}:${a.shot_key}`));

  const { data: run, error } = await db().from("runs").insert({ product_id: id, channels, created_by: role } as never).select("id").single();
  if (error || !run) return Response.json({ error: error?.message }, { status: 500 });
  const runId = (run as { id: string }).id;
  const plan = planShots({ runId, channels, specs: (specs ?? []) as ChannelSpec[], templates: (templates ?? []) as ShotTemplate[], existing, reusableScenes });
  if (!plan.assets.length) {
    await db().from("runs").update({ status: "done", finished_at: new Date().toISOString() } as never).eq("id", runId);
    return Response.json({ runId, assets: 0, credits: 0 });
  }

  await Promise.all([...new Set(plan.assets.map((a) => a.channel))].map((c) => ensureDraft(id, c, role)));
  const genIds = new Map(sceneRows.map((g) => [g.scene_key, g.id]));
  if (plan.generations.length) {
    const { data: gens, error: genError } = await db().from("generations").insert(plan.generations.map((g) => ({ product_id: id, run_id: runId, scene_key: g.sceneKey, kind: "image", model: g.model, ratio: g.ratio, inputs: { shot: g.shot, ...(g.shot === "claim_card" && { textRender: true }) } })) as never).select("id,scene_key");
    if (genError) return Response.json({ error: genError.message }, { status: 500 });
    for (const g of (gens ?? []) as { id: string; scene_key: string }[]) genIds.set(g.scene_key, g.id);
  }
  const { error: assetError } = await db().from("assets").insert(plan.assets.map((a) => ({ product_id: id, run_id: runId, spec_id: a.specId, generation_id: a.sceneKey ? genIds.get(a.sceneKey) : null, shot_key: a.shot, channel: a.channel, state: a.state })) as never);
  if (assetError) return Response.json({ error: assetError.message }, { status: 500 });

  // Video stays locked until its still passes its checks, and copy waits for the agent, but both show in the grid.
  const waiting = ((specs ?? []) as ChannelSpec[]).filter((s) => channels.includes(s.channel) && (s.shot_key === "video" || s.shot_key === "copy") && !existing.has(`${s.channel}:${s.shot_key}`));
  const { data: drafts } = waiting.length ? await db().from("assets").insert(waiting.map((s) => ({ product_id: id, run_id: runId, spec_id: s.id, shot_key: s.shot_key, channel: s.channel, state: "draft" })) as never).select("*") : { data: [] };
  const copyDrafts = ((drafts ?? []) as unknown as Asset[]).filter((a) => a.shot_key === "copy");

  await db().from("runs").update({ est_credits: plan.credits } as never).eq("id", runId);
  await logEvent({ entity: "run", entity_id: runId, type: "run_started", actor: role, detail: { channels, assets: plan.assets.length, credits: plan.credits } });
  after(async () => {
    // Copy needs only tokens, so it's written with the images. Video is optional and costs more, so a person starts it.
    await Promise.allSettled([tick(), ...copyDrafts.map((a) => writeCopy(a, product, `Write the ${CHANNEL_LABEL[a.channel]} listing.`))]);
  });
  return Response.json({ runId, assets: plan.assets.length, credits: plan.credits });
}
