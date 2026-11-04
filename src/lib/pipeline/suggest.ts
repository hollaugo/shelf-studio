import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/models";
import { getFile } from "@/lib/storage";
import { CHANNEL_LABEL, type Asset, type Product } from "@/lib/domain/types";

export const backgroundSuggestions = z.object({
  options: z.array(z.object({
    label: z.string().describe("A short name for a chip, 2 to 4 words, e.g. 'Sunlit bathroom shelf'"),
    direction: z.string().describe("One sentence describing the setting, surface and light"),
    why: z.string().describe("Under 12 words on why it suits this product"),
  })).describe("Exactly 3 clearly different settings"),
});

export const textSuggestions = z.object({
  options: z.array(z.object({
    headline: z.string().describe("Under 6 words. It must use an approved claim word for word, or the product's name, or a non-claim phrase from the pack"),
    subline: z.string().nullable().describe("Optional short line, such as the size. No new claims"),
    position: z.enum(["top", "center", "bottom"]).describe("Where the image has a calm area, away from the product's label"),
    tone: z.enum(["dark", "light"]).describe("'dark' means dark text for a light area. 'light' means cream text for a dark area"),
  })).describe("Exactly 3 options"),
});

const imagePart = async (asset: Asset) => ({ type: "file" as const, data: await getFile("outputs", asset.storage_path!), mediaType: "image/jpeg" });

export async function suggestBackgrounds(asset: Asset, product: Product, styleGuide: unknown) {
  const { output } = await generateText({
    model: agentModel,
    output: Output.object({ schema: backgroundSuggestions }),
    messages: [{ role: "user", content: [
      { type: "text", text: `Suggest 3 new settings for this ${CHANNEL_LABEL[asset.channel]} image of ${product.name}. They should clearly differ from the current one, suit the product's matte finish and follow the style guide. Only the scene changes: the real product is composited back on.\n\nStyle guide: ${JSON.stringify((styleGuide as { photography?: unknown }).photography)}\nProps that fit: ${JSON.stringify(product.analysis?.scenePrompting?.compatibleProps)}\nAvoid: ${JSON.stringify(product.analysis?.scenePrompting?.avoid)}` },
      await imagePart(asset),
    ] }],
  });
  return output.options.slice(0, 3);
}

export async function suggestText(asset: Asset, product: Product, styleGuide: unknown) {
  const { output } = await generateText({
    model: agentModel,
    output: Output.object({ schema: textSuggestions }),
    messages: [{ role: "user", content: [
      { type: "text", text: `Suggest 3 text overlays for this image of ${product.name}, following the brand's rules. Look at where the image is calm so the text never covers the product's label.\n\nApproved claims: ${JSON.stringify(product.approved_claims)}\nSize: ${product.size}\nPack text: ${JSON.stringify(product.analysis?.visibleText)}\nRules for text on images: ${JSON.stringify((styleGuide as { textOnImage?: unknown }).textOnImage)}` },
      await imagePart(asset),
    ] }],
  });
  return output.options.slice(0, 3);
}
