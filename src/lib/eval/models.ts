import { IMAGE_MODELS, VIDEO_MODELS, modelLabel } from "@/lib/runway/model-registry";
import type { EvalKind } from "./criteria";

/** Published per-million-token prices, in dollars. */
export const CLAUDE_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Fastest and cheapest", input: 0.1, output: 0.5 },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "Everyday balance", input: 2, output: 10 },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "What the app uses today", input: 4, output: 20 },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", note: "Most capable, and the slowest", input: 10, output: 50 },
];

/** Shelf Studio's own lettering, drawn over a text-free scene. It's the baseline models have to beat. */
export const OVERLAY_MODEL = "vector_overlay";
export const OVERLAY_SCENE_MODEL = "gemini_image3.1_flash";

export type EvalModel = { id: string; label: string; note: string; credits: number };

// Rough tokens per task, on the high side so that estimates don't undersell the spend.
const TYPICAL_TOKENS = { copy: { input: 25_000, output: 5_000 }, analysis: { input: 3_000, output: 2_000 } };
export const WORDING_CHECK_CREDITS = 2;

export function usageCost(model: string, inputTokens: number, outputTokens: number) {
  const m = CLAUDE_MODELS.find((c) => c.id === model) ?? CLAUDE_MODELS[2];
  return (inputTokens * m.input + outputTokens * m.output) / 1_000_000;
}

/** The models a kind can compare. Credits are $0.01 each, so Claude's estimate is in the same unit. */
export function evalModels(kind: EvalKind): EvalModel[] {
  if (kind === "video") return VIDEO_MODELS;
  if (kind === "copy" || kind === "analysis") {
    const tokens = TYPICAL_TOKENS[kind];
    return CLAUDE_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note, credits: usageCost(m.id, tokens.input, tokens.output) * 100 }));
  }
  if (kind === "text_image") {
    const scene = IMAGE_MODELS.find((m) => m.id === OVERLAY_SCENE_MODEL)!;
    return [
      { id: OVERLAY_MODEL, label: "Shelf Studio lettering", note: `Exact text drawn over a ${scene.label} scene. What the app does today`, credits: scene.credits + WORDING_CHECK_CREDITS },
      ...IMAGE_MODELS.map((m) => ({ ...m, credits: m.credits + WORDING_CHECK_CREDITS })),
    ];
  }
  return IMAGE_MODELS;
}

export const evalModelLabel = (id: string) => (id === OVERLAY_MODEL ? "Shelf Studio lettering" : CLAUDE_MODELS.find((m) => m.id === id)?.label ?? modelLabel(id));

export const DEFAULT_PICKS: Record<EvalKind, string[]> = {
  image: ["gemini_image3.1_flash", "gemini_image3_pro", "gpt_image_2_5_sunburst"],
  text_image: [OVERLAY_MODEL, "gemini_image3_pro", "gpt_image_2_5_sunburst"],
  video: ["gen4.5", "seedance2", "veo3.1"],
  copy: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
  analysis: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
  cutout: ["gemini_image3.1_flash", "gemini_image3_pro", "gpt_image_2_5_sunburst"],
};
