import "server-only";
import RunwayML from "@runwayml/sdk";
import { sceneCredits, videoModel } from "./model-registry";

let client: RunwayML | undefined;

export function runway() {
  client ??= new RunwayML();
  return client;
}

// The mask stays on the proven model: a bad mask stops a product at upload, so it changes only after a cutout comparison.
// Every other shot's model is in the shot list.
export const MODELS = { mask: "gemini_image3.1_flash" } as const;

/** Credits from Runway's pricing page. Used for estimates and to enforce the run cap. */
export function estimateCredits(model: string) {
  return videoModel(model)?.credits ?? sceneCredits(model);
}

type Limits = { maxConcurrent: number; maxDaily: number; usedToday: number };
let cached: { at: number; models: Record<string, Limits>; creditBalance: number } | undefined;

/** Read live so the app follows the account's tier instead of a hard-coded number. */
export async function accountLimits() {
  if (cached && Date.now() - cached.at < 60_000) return cached;
  const org = await runway().organization.retrieve();
  const models: Record<string, Limits> = {};
  for (const [name, limits] of Object.entries(org.tier.models ?? {}))
    models[name] = {
      maxConcurrent: limits.maxConcurrentGenerations ?? 1,
      maxDaily: limits.maxDailyGenerations ?? 50,
      usedToday: (org.usage.models as Record<string, { dailyGenerations: number }>)?.[name]?.dailyGenerations ?? 0,
    };
  cached = { at: Date.now(), models, creditBalance: org.creditBalance };
  return cached;
}

export async function downloadOutput(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download Runway output: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
