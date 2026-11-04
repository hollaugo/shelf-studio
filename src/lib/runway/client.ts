import "server-only";
import RunwayML from "@runwayml/sdk";

let client: RunwayML | undefined;

export function runway() {
  client ??= new RunwayML();
  return client;
}

export const MODELS = { scene: "gemini_image3.1_flash", mask: "gemini_image3.1_flash", video: "gen4.5" } as const;

/** Credits from Runway's pricing page. Used for estimates and to enforce the run cap. */
export function estimateCredits(model: string, ratio: string, seconds = 5) {
  if (model === "gen4.5") return 12 * seconds;
  if (model === "gen4_turbo") return 5 * seconds;
  if (model === "gemini_image3.1_flash") return Math.max(...ratio.split(":").map(Number)) > 1408 ? 11 : 7;
  return 10;
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
