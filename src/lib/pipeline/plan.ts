import type { Channel, ChannelSpec, ShotKey, ShotTemplate } from "@/lib/domain/types";
import { firstWorkingState } from "@/lib/domain/state-machine";

const IMAGE_CREDITS = 11;
export const VIDEO_CREDITS = 60;

export type PlannedGeneration = { sceneKey: string; shot: ShotKey; ratio: string; model: string; credits: number };
export type PlannedAsset = { specId: string; shot: ShotKey; channel: Channel; state: "generating" | "compositing"; sceneKey: string | null };
export type Plan = { assets: PlannedAsset[]; generations: PlannedGeneration[]; credits: number };

/**
 * Shot × channel, from data alone. Channels with the same ratio share one scene, so "all channels" costs
 * far less than running each channel separately. Video waits for an approved still and copy for the agent.
 */
export function planShots(input: { runId: string; channels: Channel[]; specs: ChannelSpec[]; templates: ShotTemplate[]; existing?: Set<string> }): Plan {
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
      sceneKey = `${input.runId}:${spec.shot_key}:${spec.scene_ratio}`;
      if (!generations.has(sceneKey)) generations.set(sceneKey, { sceneKey, shot: spec.shot_key, ratio: spec.scene_ratio!, model: template.model!, credits: IMAGE_CREDITS });
    }
    assets.push({ specId: spec.id, shot: spec.shot_key, channel: spec.channel, state: firstWorkingState(template.mode) as PlannedAsset["state"], sceneKey });
  }
  const list = [...generations.values()];
  return { assets, generations: list, credits: list.reduce((sum, g) => sum + g.credits, 0) };
}
