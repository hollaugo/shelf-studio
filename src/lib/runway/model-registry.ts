/** Each model's own ratio strings, options and credit cost, from Runway's API reference and pricing page. */
export type ImageModel = { id: string; label: string; note: string; credits: number; square: string; wide: string; params?: Record<string, unknown> };
/** `frame` is the input image size, for models whose ratio option isn't a size. */
export type VideoModel = { id: string; label: string; note: string; credits: number; ratio: string; frame?: string; params: Record<string, unknown>; references?: boolean };

export const IMAGE_MODELS: ImageModel[] = [
  { id: "gemini_image3.1_flash", label: "Nano Banana 2", note: "The previous default", credits: 11, square: "2048:2048", wide: "2752:1536" },
  { id: "nano_banana_2.1", label: "Nano Banana 2.1", note: "The latest Nano Banana, with high thinking. What the app uses", credits: 6, square: "2048:2048", wide: "2752:1536", params: { thinkingLevel: "high" } },
  { id: "gemini_image3_pro", label: "Nano Banana Pro", note: "Google's top tier", credits: 20, square: "2048:2048", wide: "2752:1536" },
  { id: "gpt_image_2_5_sunburst", label: "GPT Image 2.5 Sunburst", note: "OpenAI's highest quality, at high", credits: 16, square: "2560:2560", wide: "2560:1440", params: { quality: "high" } },
  { id: "gpt_image_2", label: "GPT Image 2", note: "At high quality", credits: 20, square: "1920:1920", wide: "2560:1440", params: { quality: "high" } },
  { id: "seedream5_pro", label: "Seedream 5.0 Pro", note: "ByteDance's top tier", credits: 9, square: "2048:2048", wide: "2720:1530" },
];

export const VIDEO_MODELS: VideoModel[] = [
  { id: "gen4.5", label: "Runway Gen-4.5", note: "720p · 5 s. The previous default", credits: 60, ratio: "720:1280", params: { duration: 5 } },
  { id: "seedance2_5", label: "Seedance 2.5", note: "1080p · 5 s. The latest Seedance, and what the app uses", credits: 340, ratio: "1080:1920", params: { duration: 5, audio: false }, references: true },
  { id: "seedance2", label: "Seedance 2.0", note: "1080p · 5 s", credits: 200, ratio: "1080:1920", params: { duration: 5, audio: false } },
  { id: "seedance2_fast", label: "Seedance 2.0 Fast", note: "720p · 5 s", credits: 120, ratio: "720:1280", params: { duration: 5, audio: false } },
  { id: "kling_4", label: "Kling 4.0", note: "1080p · 5 s, includes audio", credits: 94, ratio: "auto_1080p", frame: "1080:1920", params: { duration: 5 } },
  { id: "klingO3_pro", label: "Kling O3 Pro", note: "1080p · 5 s", credits: 85, ratio: "1080:1920", params: { duration: 5, audio: false } },
  { id: "veo3.1", label: "Veo 3.1", note: "1080p · 8 s, the only length Veo allows at 1080p", credits: 160, ratio: "1080:1920", params: { duration: 8, audio: false } },
  { id: "veo3.1_fast", label: "Veo 3.1 Fast", note: "720p · 6 s", credits: 60, ratio: "720:1280", params: { duration: 6, audio: false } },
];

/** Draws text inside images. Runway's top quality setting, at the 2K square price. */
export const TEXT_MODEL = { id: "gpt_image_2_5_sunburst", label: "GPT Image 2.5 Sunburst", params: { quality: "max" }, credits: 63 };
/** Edits an existing video, at 28 credits a second for the 5 s videos made here. It can't edit still images. */
export const EDIT_MODEL = { id: "aleph2", label: "Aleph 2.0", credits: 140 };

export const imageModel = (id: string) => IMAGE_MODELS.find((m) => m.id === id);
export const videoModel = (id: string) => VIDEO_MODELS.find((m) => m.id === id);
export const modelLabel = (id: string) => (id === EDIT_MODEL.id ? EDIT_MODEL.label : imageModel(id)?.label ?? videoModel(id)?.label ?? id);
export const sceneCredits = (id: string | null | undefined) => imageModel(id ?? "")?.credits ?? 11;

/** What one generation costs, including the quality setting for text and the fee for a reference image. */
export function generationCredits(g: { model: string; inputs?: Record<string, unknown> | null }) {
  if (g.model === EDIT_MODEL.id) return EDIT_MODEL.credits;
  if (g.inputs?.textRender) return TEXT_MODEL.credits + (g.inputs.referencePath ? 1 : 0);
  return videoModel(g.model)?.credits ?? sceneCredits(g.model);
}

/** Specs store one ratio per shot. Each model spells that shape its own way. */
export function ratioFor(model: ImageModel, ratio: string) {
  const [w, h] = ratio.split(":").map(Number);
  return w > h ? model.wide : model.square;
}
