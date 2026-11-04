import "server-only";
import { generateText, Output } from "ai";
import sharp from "sharp";
import { z } from "zod";
import { visionModel } from "@/lib/ai/models";
import { getSource } from "@/lib/data/products";
import { colourDifference, shapeDifference, type PackBox, type PackInspection } from "@/lib/domain/pack-check";
import type { Product } from "@/lib/domain/types";
import { compareText } from "@/lib/eval/auto-checks";
import { getFile } from "@/lib/storage";
import { db } from "@/lib/supabase/server";

const READ_PROMPT = "Transcribe all text printed on the product packaging in this image, letter by letter and line by line, exactly as it appears. Copy misspellings, wrong numbers and malformed letters as they are, and don't correct or complete anything. If a character can't be read, write ? in its place rather than guessing. Leave out any text that isn't on the packaging.";

async function readPack(image: Buffer) {
  const { output } = await generateText({
    model: visionModel,
    output: Output.object({ schema: z.object({ lines: z.array(z.string()).describe("Each line of text on the packaging, exactly as printed") }) }),
    messages: [{ role: "user", content: [{ type: "text", text: READ_PROMPT }, { type: "file", data: image, mediaType: "image/jpeg" }] }],
  });
  return output.lines;
}

/** What's printed on the front of the approved pack. It's read once and kept, so every image is judged against the same text. */
export async function packTextFor(product: Pick<Product, "id" | "pack_text">) {
  if (product.pack_text?.length) return product.pack_text;
  const front = await getSource(product.id, "front");
  if (!front) return null;
  const image = await sharp(await getFile("sources", front.storage_path)).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 93 }).toBuffer();
  const lines = await readPack(image);
  if (lines.length) await db().from("products").update({ pack_text: lines } as never).eq("id", product.id);
  return lines;
}

async function locatePack(image: Buffer): Promise<PackBox | null> {
  const small = await sharp(image).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const { output } = await generateText({
    model: visionModel,
    output: Output.object({ schema: z.object({ found: z.boolean(), left: z.number(), top: z.number(), right: z.number(), bottom: z.number() }) }),
    messages: [{ role: "user", content: [{ type: "text", text: "Find the product packaging in this image: the bottle, jar or set of bottles, including any cap, lid or dropper. Give the tight box around all of it, as fractions of the image from 0 to 1, measured from the left and from the top." }, { type: "file", data: small, mediaType: "image/jpeg" }] }],
  });
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return output.found && output.right > output.left && output.bottom > output.top ? { left: clamp(output.left), top: clamp(output.top), right: clamp(output.right), bottom: clamp(output.bottom) } : null;
}

async function meanColour(image: Buffer, box: { left: number; top: number; width: number; height: number }) {
  const pixels = await sharp(image).extract(box).resize(16, 16, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const total = [0, 0, 0];
  for (let i = 0; i < pixels.length; i++) total[i % 3] += pixels[i];
  return total.map((v) => v / (pixels.length / 3));
}

/** The body of a pack, away from its cap, its edges and most of its lettering. */
const bodyArea = (left: number, top: number, width: number, height: number) => ({ left: left + Math.round(width * 0.25), top: top + Math.round(height * 0.72), width: Math.max(1, Math.round(width * 0.5)), height: Math.max(1, Math.round(height * 0.12)) });

/** Finds the pack a model drew, reads its label and compares it with the approved one. A read that fails is reported, not assumed to pass. */
export async function inspectPack(image: Buffer, product: Pick<Product, "id" | "pack_text">): Promise<PackInspection> {
  const { width, height } = await sharp(image).metadata();
  const W = width!, H = height!;
  const box = await locatePack(image).catch((e) => {
    console.error("Couldn't locate the pack", e);
    return null;
  });
  const pad = 0.04;
  const area = box
    ? { left: Math.floor(Math.max(0, box.left - pad) * W), top: Math.floor(Math.max(0, box.top - pad) * H), width: 0, height: 0 }
    : { left: 0, top: 0, width: W, height: H };
  if (box) {
    area.width = Math.min(W - area.left, Math.ceil((box.right - box.left + pad * 2) * W));
    area.height = Math.min(H - area.top, Math.ceil((box.bottom - box.top + pad * 2) * H));
  }
  // Close up and sharp, because small print is lost if the whole image is sent at a lower resolution.
  const crop = await sharp(image).extract(area).resize({ width: 1500, height: 1500, fit: "inside" }).removeAlpha().jpeg({ quality: 93 }).toBuffer();

  let lines: string[] | null = null, passed: boolean | null = null, summary = "The label read-back didn't run.";
  try {
    const expected = await packTextFor(product);
    lines = await readPack(crop);
    if (expected?.length) {
      const comparison = compareText(expected, lines);
      passed = comparison.passed;
      summary = comparison.summary;
    } else {
      summary = "There's no approved pack text to compare with.";
    }
  } catch (error) {
    console.error("Label read-back failed", error);
  }

  let shapeOff: number | null = null, colourOff: number | null = null;
  const source = await getSource(product.id, "cutout");
  if (box && source) {
    try {
      const cutout = await getFile("sources", source.storage_path);
      const meta = await sharp(cutout).metadata();
      shapeOff = shapeDifference(box, W / H, meta.width! / meta.height!);
      const flat = await sharp(cutout).flatten({ background: "#808080" }).png().toBuffer();
      colourOff = colourDifference(
        await meanColour(flat, bodyArea(0, 0, meta.width!, meta.height!)),
        await meanColour(image, bodyArea(Math.floor(box.left * W), Math.floor(box.top * H), Math.floor((box.right - box.left) * W), Math.floor((box.bottom - box.top) * H))),
      );
    } catch (error) {
      console.error("Pack measurement failed", error);
    }
  }
  return { box, lines, passed, summary, shapeOff, colourOff };
}
