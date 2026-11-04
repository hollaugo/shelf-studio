import "server-only";
import sharp from "sharp";
import { blockHeight, textSvg, wrapLines, type TextStyle } from "./typography";

export type Overlay = { headline: string; subline?: string | null; position: "top" | "center" | "bottom"; tone: "dark" | "light" };

/** From the style guide: Jost headline, cream on dark areas, deep sage on light ones, 6% margins, no boxes or effects. */
export async function applyOverlay(image: Buffer, overlay: Overlay) {
  const meta = await sharp(image).metadata();
  const W = meta.width!, H = meta.height!;
  const color = overlay.tone === "dark" ? "#4f6147" : "#f1eddf";
  const margin = W * 0.06;
  const boxW = W - margin * 2;
  const headline: TextStyle = { font: "body", size: Math.round(W * 0.05), color, align: "center", lineHeight: 1.15 };
  const sub: TextStyle = { font: "body", size: Math.round(W * 0.022), color, align: "center", lineHeight: 1.3 };
  const lines = wrapLines(overlay.headline, headline, boxW);
  const subLines = overlay.subline ? wrapLines(overlay.subline, sub, boxW) : [];
  const gap = subLines.length ? W * 0.015 : 0;
  const total = blockHeight(lines, headline) + gap + blockHeight(subLines, sub);
  const y = overlay.position === "top" ? H * 0.07 : overlay.position === "center" ? (H - total) / 2 : H - H * 0.07 - total;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${textSvg(lines, headline, margin, y, boxW)}${textSvg(subLines, sub, margin, y + blockHeight(lines, headline) + gap, boxW)}</svg>`;
  return sharp(image).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}
