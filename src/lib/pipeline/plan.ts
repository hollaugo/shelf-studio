import type { Channel, ChannelSpec, ShotKey, ShotTemplate } from "@/lib/domain/types";
import { firstWorkingState } from "@/lib/domain/state-machine";
import { generationCredits, MODEL_PLACED_SHOTS, PLACEMENT_MODEL } from "@/lib/runway/model-registry";


export type PlannedGeneration = { sceneKey: string; shot: ShotKey; ratio: string; model: string; credits: number; modelPlaced: boolean };
export type PlannedAsset = { specId: string; shot: ShotKey; channel: Channel; state: "generating" | "compositing"; sceneKey: string | null };
export type Plan = { assets: PlannedAsset[]; generations: PlannedGeneration[]; credits: number };

/** Only a scene with its label confirmed can be shared with another channel, and scenes of a placed shot must be placed ones. */
export function reusableScene(g: { status: string; kind: string; ratio: string; scene_key: string; inputs: Record<string, unknown> }) {
  if (g.kind !== "image" || g.status !== "done" || g.inputs.baseGeneration) return false;
  if (!MODEL_PLACED_SHOTS.includes(String(g.inputs.shot))) return true;
  return !!g.inputs.modelPlaced && (g.inputs.pack as { passed?: boolean | null } | undefined)?.passed === true;
}

/**
 * Shot × channel, from data alone. Channels with the same ratio share one scene, so "all channels" costs
 * far less than running each channel separately. Video and copy are started separately.
 */
export function planShots(input: { runId: string; channels: Channel[]; specs: ChannelSpec[]; templates: ShotTemplate[]; existing?: Set<string>; reusableScenes?: Map<string, string> }): Plan {
  const templates = new Map(input.templates.map((t) => [t.key, t]));
  const generations = new Map<string, PlannedGeneration>();
  const assets: PlannedAsset[] = [];
  for (const spec of input.specs) {
    if (!input.channels.includes(spec.channel)) continue;
    const template = templates.get(spec.shot_key);
    if (!template || template.mode === "image_to_video" || template.mode === "agent_copy") continue;
    if (input.existing?.has(`${spec.channel}:${spec.shot_key}`)) continue;
    let sceneKey: string | null = null;
    if (template.mode === "generated") {
      // A finished scene at this ratio is reused, so the channels match and nothing is paid for twice.
      const reusable = input.reusableScenes?.get(`${spec.shot_key}:${spec.scene_ratio}`);
      sceneKey = reusable ?? `${input.runId}:${spec.shot_key}:${spec.scene_ratio}`;
      if (!reusable && !generations.has(sceneKey)) {
        const modelPlaced = MODEL_PLACED_SHOTS.includes(spec.shot_key);
        const model = modelPlaced ? PLACEMENT_MODEL.id : template.model!;
        generations.set(sceneKey, { sceneKey, shot: spec.shot_key, ratio: spec.scene_ratio!, model, modelPlaced, credits: generationCredits({ model, inputs: modelPlaced ? { modelPlaced, drawnClaim: spec.shot_key === "claim_card" } : null }) });
      }
    }
    assets.push({ specId: spec.id, shot: spec.shot_key, channel: spec.channel, state: firstWorkingState(template.mode) as PlannedAsset["state"], sceneKey });
  }
  const list = [...generations.values()];
  return { assets, generations: list, credits: list.reduce((sum, g) => sum + g.credits, 0) };
}
