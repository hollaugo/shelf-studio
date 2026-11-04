import "server-only";
import sharp, { type Sharp } from "sharp";
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

/** Real product on a generated scene, with a contact shadow and a soft cast shadow away from the light. */
export async function compositeProduct(scene: Buffer, cutout: Buffer, W: number, H: number, p: Placement) {
  const base = await sharp(scene).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  const meta = await sharp(cutout).metadata();
  const { left, top, width, height } = sceneRect(meta.width!, meta.height!, W, H, p);
  const { image } = await fit(cutout, height);
  const dir = p.lightFrom === "left" ? 1 : p.lightFrom === "right" ? -1 : 0;
  const cx = p.centerX * W, cy = p.baselineY * H;
  const shadow = (rx: number, ry: number, dx: number, opacity: number, blur: number) =>
    sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${cx + dx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#2a2118" fill-opacity="${opacity}"/></svg>`)).blur(blur).png().toBuffer();
  const [cast, contact] = await Promise.all([
    shadow(width * 0.72, height * 0.05, dir * width * 0.34, 0.34, Math.max(6, H * 0.016)),
    shadow(width * 0.47, height * 0.016, 0, 0.62, Math.max(2, H * 0.0035)),
  ]);
  return sharp(base).composite([{ input: cast }, { input: contact }, { input: image, left, top }]);
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
