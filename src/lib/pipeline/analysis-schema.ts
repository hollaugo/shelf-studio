import { z } from "zod";

/** Everything prompt writing needs to know about the uploaded image. Shared with the browser for streaming. */
export const analysisSchema = z.object({
  productType: z.string().describe("What the product is, e.g. 'hydrating shampoo'"),
  brand: z.string().nullable(),
  productName: z.string().nullable().describe("Name exactly as printed on the pack"),
  size: z.string().nullable().describe("Size exactly as printed, e.g. '400 mL / 13.5 fl oz'"),
  visibleText: z.array(z.string()).describe("Every line of text legible on the pack, verbatim"),
  claimsOnPack: z.array(z.string()).describe("Marketing or performance claims printed on the pack. Empty if none"),
  packaging: z.object({
    form: z.string().describe("e.g. 'bottle', 'jar', 'dropper'"),
    material: z.string(),
    finish: z.string().describe("e.g. 'matte, soft-touch'"),
    closure: z.string(),
  }),
  palette: z.array(z.object({ name: z.string(), hex: z.string() })).describe("3 to 5 dominant product colours, sampled by eye"),
  imageType: z.enum(["white_background_packshot", "lifestyle", "other"]),
  background: z.string(),
  lighting: z.string().describe("Direction, softness and colour temperature of the light on the product"),
  brandMood: z.array(z.string()).describe("3 to 5 words for how the pack feels"),
  scenePrompting: z.object({
    suggestedSettings: z.array(z.string()).describe("3 specific settings that suit this product and its materials"),
    compatibleProps: z.array(z.string()).describe("Props that fit the product, only using ingredients visible on the pack"),
    avoid: z.array(z.string()).describe("Visual choices that would clash with this product"),
  }),
  usableForCutout: z.boolean().describe("True if the whole product is visible, unobstructed and in focus"),
  issues: z.array(z.string()).describe("Problems with this image as a source, such as cropping, glare or low resolution. Empty if none"),
});

export type AnalysisOutput = z.infer<typeof analysisSchema>;

export const ANALYSIS_PROMPT = `You are preparing a product image for an AI content pipeline. The pipeline never regenerates the product: it generates scenes and composites the real packshot on top, so your description guides scene prompts, not the product itself.

Report only what you can see. Copy on-pack text verbatim. Don't infer benefits, ingredients or claims that aren't printed. Note any problems with this image as a source.`;
