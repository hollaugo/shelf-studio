/** Each model's own ratio strings, options and credit cost, from Runway's API reference and pricing page. */
export type ImageModel = { id: string; label: string; note: string; credits: number; square: string; wide: string; params?: Record<string, unknown> };
export type VideoModel = { id: string; label: string; note: string; credits: number; ratio: string; params: Record<string, unknown> };

export const IMAGE_MODELS: ImageModel[] = [
  { id: "gemini_image3.1_flash", label: "Nano Banana 2", note: "What the app uses today", credits: 11, square: "2048:2048", wide: "2752:1536" },
  { id: "nano_banana_2.1", label: "Nano Banana 2.1", note: "Newer, with high thinking", credits: 6, square: "2048:2048", wide: "2752:1536", params: { thinkingLevel: "high" } },
  { id: "gemini_image3_pro", label: "Nano Banana Pro", note: "Google's top tier", credits: 20, square: "2048:2048", wide: "2752:1536" },
  { id: "gpt_image_2_5_sunburst", label: "GPT Image 2.5 Sunburst", note: "OpenAI's highest quality, at high", credits: 16, square: "2560:2560", wide: "2560:1440", params: { quality: "high" } },
  { id: "gpt_image_2", label: "GPT Image 2", note: "At high quality", credits: 20, square: "1920:1920", wide: "2560:1440", params: { quality: "high" } },
  { id: "seedream5_pro", label: "Seedream 5.0 Pro", note: "ByteDance's top tier", credits: 9, square: "2048:2048", wide: "2720:1530" },
];

export const VIDEO_MODELS: VideoModel[] = [
  { id: "gen4.5", label: "Runway Gen-4.5", note: "What the app uses today · 5 s", credits: 60, ratio: "720:1280", params: { duration: 5 } },
  { id: "klingO3_pro", label: "Kling O3 Pro", note: "1080p · 5 s, no audio", credits: 85, ratio: "1080:1920", params: { duration: 5, audio: false } },
  { id: "veo3.1", label: "Veo 3.1", note: "1080p · 6 s, no audio", credits: 120, ratio: "1080:1920", params: { duration: 6, audio: false } },
];

export const imageModel = (id: string) => IMAGE_MODELS.find((m) => m.id === id);
export const videoModel = (id: string) => VIDEO_MODELS.find((m) => m.id === id);
export const sceneCredits = (id: string | null | undefined) => imageModel(id ?? "")?.credits ?? 11;

/** Specs store one ratio per shot. Each model spells that shape its own way. */
export function ratioFor(model: ImageModel, ratio: string) {
  const [w, h] = ratio.split(":").map(Number);
  return w > h ? model.wide : model.square;
}
