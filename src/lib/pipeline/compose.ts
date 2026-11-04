import "server-only";
import sharp, { type Sharp } from "sharp";
import { castShadow, contactShadow, readSceneLight, relightProduct, surfaceReflection } from "./blend";
import { blockHeight, textSvg, wrapLines, type TextStyle } from "./typography";

export type Placement = { centerX: number; baselineY: number; heightFrac: number; lightFrom: "left" | "right" | "top" | "front" };
export const DEFAULT_PLACEMENT: Placement = { centerX: 0.5, baselineY: 0.8, heightFrac: 0.58, lightFrom: "left" };

async function fit(cutout: Buffer, targetHeight: number) {
  const meta = await sharp(cutout).metadata();
  const height = Math.round(targetHeight);
  const width = Math.round((meta.width! / meta.height!) * height);
  return { image: await sharp(cutout).resize(width, height, { kernel: "lanczos3" }).png().toBuffer(), width, height };
}

export type Rect = { left: number; top: number; width: number; height: number };

/** Where the real product sits in each layout, shared by rendering and the pixel check. */
export function heroRect(cw: number, ch: number, W: number, H: number): Rect {
  const scale = (0.88 * Math.min(W, H)) / Math.max(cw, ch);
  const height = Math.round(ch * scale), width = Math.round((cw / ch) * height);
  return { left: Math.round((W - width) / 2), top: Math.round((H - height) / 2), width, height };
}
export function sceneRect(cw: number, ch: number, W: number, H: number, p: Placement): Rect {
  const height = Math.round(H * p.heightFrac), width = Math.round((cw / ch) * height);
  return { left: Math.round(p.centerX * W - width / 2), top: Math.round(p.baselineY * H - height), width, height };
}
export function claimRect(cw: number, ch: number, W: number, H: number): Rect {
  const height = Math.round(H * 0.74), width = Math.round((cw / ch) * height);
  return { left: Math.round(W * 0.07), top: Math.round((H - height) / 2), width, height };
}

/** Pure-white main image. No generation: the product fills at least 85% of the frame's longest side. */
export async function renderHero(cutout: Buffer, W: number, H: number) {
  const meta = await sharp(cutout).metadata();
  const rect = heroRect(meta.width!, meta.height!, W, H);
  const { image } = await fit(cutout, rect.height);
  return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite([{ input: image, left: rect.left, top: rect.top }]);
}

/** The real product photographed into a generated scene: lit by its light, grounded by its own shadow, and softened at the edges. */
export async function compositeProduct(scene: Buffer, cutout: Buffer, W: number, H: number, p: Placement) {
  const base = await sharp(scene).resize(W, H, { fit: "cover", position: "centre" }).removeAlpha().png().toBuffer();
  const meta = await sharp(cutout).metadata();
  const rect = sceneRect(meta.width!, meta.height!, W, H, p);
  const { image } = await fit(cutout, rect.height);
  const light = await readSceneLight(base, W, H, rect);
  const lit = await relightProduct(image, light, p.lightFrom);
  const [cast, contact, reflection] = await Promise.all([
    castShadow(lit.rows, lit.firstRow, lit.lastRow, rect, W, H, light, p.lightFrom),
    contactShadow(lit.rows, lit.lastRow, rect, W, H, light),
    surfaceReflection(lit.image, rect, lit.lastRow, H),
  ]);
  return sharp(base).composite([
    { input: cast.far },
    { input: cast.near },
    ...(reflection ? [reflection] : []),
    { input: contact.pool },
    { input: contact.tight },
    { input: lit.image, left: rect.left, top: rect.top },
  ]);
}

/** A claim card whose text a model already drew into the scene. Only the real pack is added here. */
export async function renderClaimOnScene(scene: Buffer, cutout: Buffer, W: number, H: number) {
  const meta = await sharp(cutout).metadata();
  const rect = claimRect(meta.width!, meta.height!, W, H);
  const { image } = await fit(cutout, rect.height);
  const base = await sharp(scene).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  return sharp(base).composite([{ input: image, left: rect.left, top: rect.top }]);
}

export async function renderClaimCard(cutout: Buffer, claim: string, subline: string | null, W: number, H: number) {
  const meta = await sharp(cutout).metadata();
  const rect = claimRect(meta.width!, meta.height!, W, H);
  const { image, width } = await fit(cutout, rect.height);
  const pad = W * 0.07;
  const textX = pad + width + W * 0.06;
  const textW = W - textX - pad;
  const headline: TextStyle = { font: "body", size: Math.round(W * 0.066), color: "#4f6147", align: "left", lineHeight: 1.16 };
  const sub: TextStyle = { font: "body", size: Math.round(W * 0.024), color: "#4f6147", align: "left", lineHeight: 1.3 };
  const lines = wrapLines(claim, headline, textW);
  const subLines = subline ? wrapLines(subline, sub, textW) : [];
  const total = blockHeight(lines, headline) + (subLines.length ? W * 0.03 + blockHeight(subLines, sub) : 0);
  const y = (H - total) / 2;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${textSvg(lines, headline, textX, y, textW)}${textSvg(subLines, sub, textX, y + blockHeight(lines, headline) + W * 0.03, textW)}</svg>`;
  return sharp({ create: { width: W, height: H, channels: 3, background: "#f1eddf" } })
    .composite([{ input: image, left: rect.left, top: rect.top }, { input: Buffer.from(svg) }]);
}

/**
 * Compares the output's product area with the approved cutout, pixel by pixel on the opaque parts.
 * Proves the product wasn't altered. A small difference is expected from JPEG compression.
 */
export async function productPixelDiff(output: Buffer, cutout: Buffer, rect: Rect) {
  const size = { width: 256, height: Math.round((256 * rect.height) / rect.width) };
  const a = await sharp(output).extract({ left: Math.max(0, rect.left), top: Math.max(0, rect.top), width: rect.width, height: rect.height }).resize(size).removeAlpha().raw().toBuffer();
  const c = await sharp(cutout).resize(size).ensureAlpha().raw().toBuffer();
  let sum = 0, n = 0;
  for (let i = 0, j = 0; i < a.length; i += 3, j += 4) {
    if (c[j + 3] < 250) continue;
    sum += Math.abs(a[i] - c[j]) + Math.abs(a[i + 1] - c[j + 1]) + Math.abs(a[i + 2] - c[j + 2]);
    n += 3;
  }
  return n ? sum / n : 255;
}

/**
 * For a product lit by its scene. Light changes brightness smoothly, so it's removed from both images before comparing
 * only the fine detail, which is what would change if a label, logo or shape were altered.
 */
export async function productDetailDiff(output: Buffer, cutout: Buffer, rect: Rect) {
  const size = { width: 512, height: Math.round((512 * rect.height) / rect.width) };
  const detail = async (image: Sharp) => {
    const grey = await image.clone().resize({ ...size, fit: "fill" }).removeAlpha().greyscale().extractChannel(0).raw().toBuffer();
    const smooth = await sharp(grey, { raw: { ...size, channels: 1 } }).blur(9).extractChannel(0).raw().toBuffer();
    return { grey, smooth };
  };
  const crop = sharp(output).extract({ left: Math.max(0, rect.left), top: Math.max(0, rect.top), width: rect.width, height: rect.height });
  const [a, c, pixels] = await Promise.all([
    detail(crop),
    detail(sharp(await sharp(cutout).flatten({ background: "#808080" }).png().toBuffer())),
    sharp(cutout).resize({ ...size, fit: "fill" }).ensureAlpha().raw().toBuffer(),
  ]);
  let sum = 0, n = 0;
  // A small change to a label is lost in an average over the whole pack, so the worst small area is measured too.
  const BLOCK = 32;
  const blocks = new Map<number, { sum: number; n: number }>();
  for (let y = 0; y < size.height; y++) {
    let from = -1, to = -1;
    for (let x = 0; x < size.width; x++) {
      if (pixels[(y * size.width + x) * 4 + 3] > 250) {
        if (from < 0) from = x;
        to = x;
      }
    }
    if (from < 0) continue;
    // The edges are meant to pick up the scene, so only the inside of the pack is compared.
    const margin = (to - from) * 0.07 + 2;
    for (let x = Math.ceil(from + margin); x <= to - margin; x++) {
      const i = y * size.width + x;
      // Brightness is matched locally first, because shading also scales the detail on that part of the pack.
      const gain = c.smooth[i] / Math.max(1, a.smooth[i]);
      const delta = Math.abs((a.grey[i] - a.smooth[i]) * gain - (c.grey[i] - c.smooth[i]));
      sum += delta;
      n++;
      const key = Math.floor(y / BLOCK) * size.width + Math.floor(x / BLOCK);
      const block = blocks.get(key) ?? { sum: 0, n: 0 };
      block.sum += delta;
      block.n++;
      blocks.set(key, block);
    }
  }
  const worst = Math.max(0, ...[...blocks.values()].filter((b) => b.n > BLOCK * BLOCK * 0.5).map((b) => b.sum / b.n));
  return n ? { average: sum / n, worst } : { average: 255, worst: 255 };
}

/** Measured on real scenes: untouched packs score 11 to 14, and even a small added word scores 18 or more. */
export const detailVerdict = (worst: number) => (worst < 15 ? "pass" : worst < 18 ? "warn" : "fail");

/** A tall video frame from the clean scene and real pack: no text overlay, cropped around the product so it stays in shot. */
export async function videoFrame(scene: Buffer, cutout: Buffer, placement: Placement, w: number, h: number) {
  const size = 2048;
  const square = await (await compositeProduct(scene, cutout, size, size, placement)).png().toBuffer();
  const cropW = Math.round((size * w) / h);
  const left = Math.min(size - cropW, Math.max(0, Math.round(placement.centerX * size - cropW / 2)));
  return sharp(square).extract({ left, top: 0, width: cropW, height: size }).resize(w, h).jpeg({ quality: 92 }).toBuffer();
}

/** Exact pixels and format for the channel, stepping quality down until the file fits its limit. */
export async function encodeForSpec(pipeline: Sharp, spec: { width: number; height: number; format: string; max_mb: number | null }) {
  const raw = await pipeline.flatten({ background: "#ffffff" }).resize(spec.width, spec.height, { fit: "cover" }).toBuffer();
  const limit = spec.max_mb ? spec.max_mb * 1024 * 1024 : Infinity;
  for (const quality of [94, 90, 85, 80, 72, 64]) {
    const out = await sharp(raw).jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
    if (out.length <= limit) return out;
  }
  throw new Error("Couldn't fit the image inside the channel's file size limit.");
}
