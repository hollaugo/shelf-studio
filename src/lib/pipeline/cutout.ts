import "server-only";
import sharp from "sharp";
import { MODELS, downloadOutput, runway } from "@/lib/runway/client";

const MASK_PROMPT = "Create a precise binary segmentation mask of @product, keeping its exact position, size and silhouette in the frame. The whole product including its cap is solid pure white (#FFFFFF). Everything else, including the background and any cast shadow, is solid pure black (#000000). No grey, no gradients, no text, no shading, no details.";

/** A model only ever draws the mask. The cutout's pixels are always the original image's. */
export async function generateMask(source: Buffer) {
  const reference = await sharp(source).resize(1024, 1024, { fit: "contain", background: "#ffffff" }).webp({ quality: 92 }).toBuffer();
  const task = await runway().textToImage.create({
    model: MODELS.mask,
    ratio: "1024:1024",
    promptText: MASK_PROMPT,
    referenceImages: [{ uri: `data:image/webp;base64,${reference.toString("base64")}`, tag: "product", subject: "object" }],
  }).waitForTaskOutput();
  return downloadOutput(task.output[0]);
}

export type Cutout = { mask: Buffer; cutout: Buffer; width: number; height: number; coverage: number };

export async function applyMask(source: Buffer, maskImage: Buffer): Promise<Cutout> {
  const square = await sharp(source).resize(1024, 1024, { fit: "contain", background: "#ffffff" }).removeAlpha().png().toBuffer();
  const alpha = await sharp(maskImage).resize(1024, 1024).toColourspace("b-w").threshold(128).blur(0.8).raw().toBuffer();
  const white = alpha.reduce((n, v) => n + (v > 127 ? 1 : 0), 0);
  const coverage = white / alpha.length;
  if (coverage < 0.02 || coverage > 0.9) throw new Error(`The product mask looks wrong (covers ${Math.round(coverage * 100)}% of the image).`);

  const cut = await sharp(square).joinChannel(alpha, { raw: { width: 1024, height: 1024, channels: 1 } }).png().toBuffer();
  const trimmed = await sharp(cut).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  const mask = await sharp(alpha, { raw: { width: 1024, height: 1024, channels: 1 } }).png().toBuffer();
  return { mask, cutout: trimmed.data, width: trimmed.info.width, height: trimmed.info.height, coverage };
}
