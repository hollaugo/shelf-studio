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

/** Pure-white main image. No generation: the product fills at least 85% of the frame's longest side. */
export async function renderHero(cutout: Buffer, W: number, H: number) {
  const meta = await sharp(cutout).metadata();
  const scale = (0.88 * Math.min(W, H)) / Math.max(meta.width!, meta.height!);
  const { image, width, height } = await fit(cutout, meta.height! * scale);
  return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite([{ input: image, left: Math.round((W - width) / 2), top: Math.round((H - height) / 2) }]);
}

/** Real product on a generated scene, with a contact shadow and a soft cast shadow away from the light. */
export async function compositeProduct(scene: Buffer, cutout: Buffer, W: number, H: number, p: Placement) {
  const base = await sharp(scene).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  const { image, width, height } = await fit(cutout, H * p.heightFrac);
  const left = Math.round(p.centerX * W - width / 2);
  const top = Math.round(p.baselineY * H - height);
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

export async function renderClaimCard(cutout: Buffer, claim: string, subline: string | null, W: number, H: number) {
  const { image, width, height } = await fit(cutout, H * 0.74);
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
    .composite([{ input: image, left: Math.round(pad), top: Math.round((H - height) / 2) }, { input: Buffer.from(svg) }]);
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
