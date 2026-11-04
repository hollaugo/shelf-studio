import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type Font, type Path } from "opentype.js";

const dir = join(process.cwd(), "src/lib/pipeline/fonts");
const load = (file: string) => {
  const b = readFileSync(join(dir, file));
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const fonts = { get body() { return (cache.body ??= load("Jost-Regular.woff")); }, get display() { return (cache.display ??= load("CormorantGaramond-Medium.woff")); } };
const cache: { body?: Font; display?: Font } = {};

export type TextStyle = { font: "body" | "display"; size: number; color: string; align: "left" | "center"; letterSpacing?: number; lineHeight?: number };

/** Text becomes vector paths, so the brand's fonts render identically on any server. */
export function wrapLines(text: string, style: TextStyle, maxWidth: number) {
  const font = fonts[style.font];
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.getAdvanceWidth(next, style.size, { letterSpacing: style.letterSpacing }) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Written by hand because opentype.js 2.0's toPathData sometimes emits "NaN", which silently cuts off the rest of the text. */
export function pathData(path: Path) {
  const n = (v: number | undefined) => v!.toFixed(2);
  return path.commands.map((c) => {
    if (c.type === "M" || c.type === "L") return `${c.type}${n(c.x)} ${n(c.y)}`;
    if (c.type === "C") return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    if (c.type === "Q") return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    return "Z";
  }).join("");
}

export function textSvg(lines: string[], style: TextStyle, x: number, y: number, boxWidth: number) {
  const font = fonts[style.font];
  const lh = style.size * (style.lineHeight ?? 1.2);
  return lines.map((line, i) => {
    const w = font.getAdvanceWidth(line, style.size, { letterSpacing: style.letterSpacing });
    const lx = Math.round(style.align === "center" ? x + (boxWidth - w) / 2 : x);
    const ly = Math.round(y + style.size + i * lh);
    return `<path d="${pathData(font.getPath(line, lx, ly, style.size, { letterSpacing: style.letterSpacing }))}" fill="${style.color}"/>`;
  }).join("");
}

export const blockHeight = (lines: string[], style: TextStyle) => lines.length * style.size * (style.lineHeight ?? 1.2);
