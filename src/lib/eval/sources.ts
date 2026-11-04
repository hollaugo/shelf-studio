import "server-only";
import sharp from "sharp";
import { getSource } from "@/lib/data/products";
import { getFile } from "@/lib/storage";

export type SourceSpec = { source?: string; transform?: "low_res" | "crop" | "tilt" };

/** The image a case tests: the product's own, or a fixed fixture, optionally degraded to stress the model. */
export async function evalSource(productId: string, spec: SourceSpec) {
  const name = spec.source ?? "front";
  let file: Buffer;
  if (name.startsWith("fixture:")) file = await getFile("sources", `eval-fixtures/${name.slice(8)}.webp`);
  else {
    const row = await getSource(productId, name);
    if (!row) throw new Error(`This product has no ${name} image.`);
    file = await getFile("sources", row.storage_path);
  }
  const image = sharp(file);
  const { width, height } = await image.metadata();
  if (spec.transform === "low_res") image.resize({ width: 256 });
  if (spec.transform === "crop") image.extract({ left: 0, top: 0, width: width!, height: Math.round(height! * 0.62) });
  if (spec.transform === "tilt") image.rotate(12, { background: "#ffffff" });
  return image.flatten({ background: "#ffffff" }).png().toBuffer();
}
