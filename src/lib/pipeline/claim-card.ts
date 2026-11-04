import "server-only";
import sharp from "sharp";
import type { Product } from "@/lib/domain/types";
import { blockHeight, textSvg, wrapLines, type TextStyle } from "./typography";

const SIZE = 1536;
const CREAM = "#F1EDDF";
const SIENNA = "#A9502C";

/** The words on a claim card, from approved product data. */
export const claimLines = (product: Pick<Product, "name" | "primary_claim" | "size">) => [product.primary_claim ?? product.name, product.size].filter((l): l is string => !!l);

/**
 * The card's type, set by code in the brand's font. A model copies this far more faithfully than a description, which
 * is what keeps the font, weight and layout the same on every product.
 */
export async function claimTypeReference(product: Pick<Product, "name" | "primary_claim" | "size">) {
  const [claim, size] = claimLines(product);
  const headline: TextStyle = { font: "body", size: Math.round(SIZE * 0.112), color: CREAM, align: "left", lineHeight: 1.02, letterSpacing: -0.015, weight: 0.018 };
  const sub: TextStyle = { font: "body", size: Math.round(SIZE * 0.032), color: CREAM, align: "left", lineHeight: 1.2, weight: 0.012 };
  const x = SIZE * 0.07, y = SIZE * 0.06, width = SIZE * 0.86;
  const lines = wrapLines(claim, headline, width);
  const subLines = size ? wrapLines(size, sub, width) : [];
  const svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">${textSvg(lines, headline, x, y, width)}${textSvg(subLines, sub, x, y + blockHeight(lines, headline) + SIZE * 0.025, width)}</svg>`;
  return sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: SIENNA } }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 92 }).toBuffer();
}

/** Filled from the shot's template rather than written per product, so that every card has the same scene, layout and type. */
export function claimCardPrompt(template: string, product: Pick<Product, "analysis">, packLines: string[] | null, hasBack: boolean) {
  const pack = product.analysis?.packaging;
  return template
    .replace("{pack}", pack ? `: a ${pack.finish} ${pack.form} with a ${pack.closure}` : "")
    .replace("{back}", hasBack ? " @back shows its back, for reference only." : "")
    .replace("{packWords}", packLines?.length ? `, and these words on it spelled exactly, in the same typefaces and positions: ${packLines.map((l) => `"${l}"`).join(", ")}` : "");
}
