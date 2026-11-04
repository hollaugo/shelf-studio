import sharp from "sharp";
import { sceneRect, type Placement, type Rect } from "./placement";

/**
 * The second pass. A model gets the finished composite as a reference and makes the pack physically belong: water,
 * reflections, shadow, steam. It can't be trusted with lettering, so the real lettering goes back on afterwards.
 */
export function integrationPrompt(shot: unknown) {
  const conditions = shot === "in_use"
    ? "This is a wet shower. Add fine water droplets and a few thin runs of water on the bottle and its cap, a wet reflection of the bottle in the surface beneath it, and a little steam drifting across it."
    : "Match the scene's conditions. If the surface or walls are wet, add fine water droplets on the bottle and cap and a wet reflection beneath it. If the scene is dry, add no water at all, only a soft reflection the surface would really show.";
  return `Edit the reference image @scene. It's a finished commercial photograph with a sage green bottle standing in it. Make the bottle look as if it was photographed there.

${conditions} Make its shadow on the surface match the direction and hardness of the light in the scene, and let the same light fall across the bottle.

Keep everything else exactly as it is: the framing, composition, background, surface and any person. Keep the bottle in exactly the same position and at exactly the same size, with exactly the same shape, cap and sage colour. Keep every letter on the bottle exactly as it is. Don't add, remove, move or restyle anything else, and add no text.`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Limits on how far a model may have moved the pack before its result is thrown away. */
const MAX_SHIFT = 0.03;
const MAX_SCALE = 0.04;
const MIN_MATCH = 0.3;
const MIN_EDGES = 0.3;
const MAX_COLOUR_SHIFT = 0.22;
const MAX_OUTSIDE_CHANGE = 0.3;

/** Slightly soft, because a one-pixel edge wouldn't line up with itself at the fractions of a pixel the search lands on. */
const grey = async (image: Buffer, box: Rect, width: number, height: number) =>
  sharp(image).extract(box).resize({ width, height, fit: "fill" }).removeAlpha().greyscale().blur(1.6).extractChannel(0).raw().toBuffer();

/** Compares two images only at the given points, so that nothing but the pack's outline counts. */
function correlate(a: ArrayLike<number>, aw: number, b: ArrayLike<number>, bw: number, bx: number, by: number, points: Int32Array) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let p = 0; p < points.length; p += 2) {
    const x = points[p], y = points[p + 1];
    const va = a[y * aw + x], vb = b[(y + by) * bw + x + bx];
    sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
  }
  const n = points.length / 2;
  const denominator = Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
  return denominator > 1 ? (sab - (sa * sb) / n) / denominator : 0;
}

/** The thin band around the pack's silhouette. A model may change what's on the pack, but this has to stay put. */
async function outlineOf(cutout: Buffer, width: number, height: number) {
  const alpha = await sharp(cutout).resize({ width, height, fit: "fill" }).ensureAlpha().extractChannel(3).blur(Math.max(1, height * 0.006)).extractChannel(0).raw().toBuffer();
  const points: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const value = alpha[y * width + x];
      if (value > 20 && value < 235) points.push(x, y);
    }
  }
  return Int32Array.from(points);
}

function edgesOf(pixels: ArrayLike<number>, w: number, h: number) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = Math.abs(pixels[i + 1] - pixels[i - 1]) + Math.abs(pixels[i + w] - pixels[i - w]);
    }
  }
  return out;
}

const windowAround = (rect: Rect, margin: number, W: number, H: number): Rect => {
  const left = clamp(rect.left - margin, 0, W - 1), top = clamp(rect.top - margin, 0, H - 1);
  return { left, top, width: Math.min(W - left, rect.width + margin * 2), height: Math.min(H - top, rect.height + margin * 2) };
};

/** Finds where the pack ended up in the model's image, relative to where it was. */
async function locate(plain: Buffer, integrated: Buffer, cutout: Buffer, rect: Rect, W: number, H: number) {
  const f = 240 / rect.height; // Works on a small copy, because the search is the slow part.
  const tw = Math.max(8, Math.round(rect.width * f)), th = Math.max(8, Math.round(rect.height * f));
  const template = edgesOf(await grey(plain, rect, tw, th), tw, th);
  const outline = await outlineOf(cutout, tw, th);
  let best = { score: -1, dx: 0, dy: 0, scale: 1 };
  const margin = Math.round(W * MAX_SHIFT * 1.3);
  const box = windowAround(rect, margin, W, H);
  for (const scale of [0.96, 0.98, 1, 1.02, 1.04]) {
    const k = f / scale;
    const sw = Math.round(box.width * k), sh = Math.round(box.height * k);
    const target = edgesOf(await grey(integrated, box, sw, sh), sw, sh);
    // The outline scales with the image, so it's compared as if the pack had stayed the template's size.
    const ox = (rect.left - box.left) * k + (rect.width * k - tw) / 2;
    const oy = (rect.top - box.top) * k + (rect.height * k - th) / 2;
    for (let by = 0; by + th <= sh; by++) {
      for (let bx = 0; bx + tw <= sw; bx++) {
        const score = correlate(template, tw, target, sw, bx, by, outline);
        if (score > best.score) best = { score, dx: ((bx - ox) * scale) / f, dy: ((by - oy) * scale) / f, scale };
      }
    }
  }
  // A second, closer look around the best match, because the first search only sees every few pixels.
  const fine = f * 2;
  const k = fine / best.scale;
  const fw = Math.round(rect.width * fine), fh = Math.round(rect.height * fine);
  const fineTemplate = edgesOf(await grey(plain, rect, fw, fh), fw, fh);
  const fineOutline = await outlineOf(cutout, fw, fh);
  const sw = Math.round(box.width * k), sh = Math.round(box.height * k);
  const target = edgesOf(await grey(integrated, box, sw, sh), sw, sh);
  const ox = (rect.left - box.left) * k + (rect.width * k - fw) / 2, oy = (rect.top - box.top) * k + (rect.height * k - fh) / 2;
  const cx = Math.round(ox + (best.dx * fine) / best.scale), cy = Math.round(oy + (best.dy * fine) / best.scale);
  let closest = { fit: -1, dx: best.dx, dy: best.dy };
  for (let by = Math.max(0, cy - 6); by <= cy + 6 && by + fh <= sh; by++) {
    for (let bx = Math.max(0, cx - 6); bx <= cx + 6 && bx + fw <= sw; bx++) {
      const fit = correlate(fineTemplate, fw, target, sw, bx, by, fineOutline);
      if (fit > closest.fit) closest = { fit, dx: ((bx - ox) * best.scale) / fine, dy: ((by - oy) * best.scale) / fine };
    }
  }
  return { ...best, dx: closest.dx, dy: closest.dy };
}

/** Undoes a small shift or rescale, so that the pack is back exactly where the approved placement put it. */
async function realign(integrated: Buffer, W: number, H: number, rect: Rect, at: { dx: number; dy: number; scale: number }) {
  if (at.scale === 1 && Math.round(at.dx) === 0 && Math.round(at.dy) === 0) return integrated;
  const rw = Math.round(W / at.scale), rh = Math.round(H / at.scale);
  const pad = Math.round(Math.max(W, H) * 0.1);
  const grown = await sharp(integrated).resize({ width: rw, height: rh, fit: "fill" }).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: "copy" }).png().toBuffer();
  // Where the pack's centre lands in the resized image, and where it has to go.
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const left = Math.round(((cx + at.dx) / at.scale) + pad - cx), top = Math.round(((cy + at.dy) / at.scale) + pad - cy);
  return sharp(grown).extract({ left: clamp(left, 0, rw + pad * 2 - W), top: clamp(top, 0, rh + pad * 2 - H), width: W, height: H }).png().toBuffer();
}

type LetterMask = { mask: Float32Array; zone: Float32Array; body: [number, number, number]; pixels: Buffer; width: number; height: number };

/** The approved lettering: what's clearly brighter than the pack's body colour, below its cap. */
export async function letterMask(cutout: Buffer, width: number, height: number): Promise<LetterMask> {
  const pixels = await sharp(cutout).resize({ width, height, fit: "fill" }).ensureAlpha().raw().toBuffer();
  const bodyTop = Math.round(height * 0.3); // Below any cap or lid.
  const reds: number[] = [], greens: number[] = [], blues: number[] = [];
  const flat = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) flat[i] = clamp(Math.round(luma(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2])), 0, 255);
  // Lettering stands out from what's right around it. The bottle's own highlights change too gradually to count.
  const around = await sharp(flat, { raw: { width, height, channels: 1 } }).blur(Math.max(3, width * 0.07)).extractChannel(0).raw().toBuffer();
  const mask = new Float32Array(width * height);
  const seed = Buffer.alloc(width * height);
  for (let y = bodyTop; y < height; y++) {
    // Skip the pack's edges, where nothing is printed and the outline would count as contrast.
    let from = -1, to = -1;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 250) {
        if (from < 0) from = x;
        to = x;
      }
    }
    if (from < 0) continue;
    const inset = (to - from) * 0.06 + 2;
    for (let x = from; x <= to; x++) {
      const i = y * width + x, j = i * 4;
      if (x < from + inset || x > to - inset) {
        reds.push(pixels[j]); greens.push(pixels[j + 1]); blues.push(pixels[j + 2]);
        continue;
      }
      const value = clamp((flat[i] - around[i] - 7) / 20, 0, 1);
      mask[i] = value;
      if (value > 0.2) seed[i] = 255;
      else if (value === 0) { reds.push(pixels[j]); greens.push(pixels[j + 1]); blues.push(pixels[j + 2]); }
    }
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const body: [number, number, number] = [median(reds), median(greens), median(blues)];
  // A soft area around the letters, wide enough to cover whatever the model drew there instead.
  const blurred = await sharp(seed, { raw: { width, height, channels: 1 } }).blur(Math.max(1.5, width * 0.03)).extractChannel(0).raw().toBuffer();
  const zone = new Float32Array(width * height);
  for (let i = 0; i < zone.length; i++) zone[i] = clamp((blurred[i] - 4) / 22, 0, 1);
  return { mask, zone, body, pixels, width, height };
}

/** Puts the real lettering back on the model's pack, in the model's light, so that droplets and shading stay. */
async function restoreLettering(image: Buffer, cutout: Buffer, rect: Rect) {
  const { width, height } = rect;
  const letters = await letterMask(cutout, width, height);
  const region = await sharp(image).extract(rect).removeAlpha().raw().toBuffer();
  const smooth = await sharp(region, { raw: { width, height, channels: 3 } }).blur(Math.max(3, width * 0.05)).removeAlpha().raw().toBuffer();
  const out = Buffer.from(region);
  for (let i = 0; i < width * height; i++) {
    const zone = letters.zone[i];
    if (zone === 0) continue;
    const mask = letters.mask[i];
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      // Under the letters, keep only the model's light and colour, which removes whatever it drew there.
      const base = region[j] + (smooth[j] - region[j]) * zone;
      const gain = clamp(smooth[j] / Math.max(1, letters.body[c]), 0.7, 1.25);
      const letter = letters.pixels[i * 4 + c] * gain;
      out[j] = clamp(Math.round(base + (letter - base) * mask), 0, 255);
    }
  }
  const patch = await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return sharp(image).composite([{ input: patch, left: rect.left, top: rect.top }]).png().toBuffer();
}

/**
 * How much of the area just outside the pack's sides and top now looks different. A pack that grew or changed shape
 * shows up here. The surface below it is left out, because shadows and reflections are meant to change.
 */
async function outsideChange(plain: Buffer, aligned: Buffer, cutout: Buffer, rect: Rect, W: number, H: number) {
  const reach = Math.round(rect.width * 0.05);
  const box = { left: clamp(rect.left - reach, 0, W - 1), top: clamp(rect.top - reach, 0, H - 1), width: 0, height: 0 };
  box.width = Math.min(W - box.left, rect.width + reach * 2);
  box.height = Math.min(H - box.top, Math.round(rect.height * 0.9) + reach);
  const f = 300 / rect.height;
  const w = Math.max(8, Math.round(box.width * f)), h = Math.max(8, Math.round(box.height * f));
  const read = (image: Buffer) => sharp(image).extract(box).resize({ width: w, height: h, fit: "fill" }).removeAlpha().blur(1).raw().toBuffer();
  const [before, after] = await Promise.all([read(plain), read(aligned)]);
  const canvas = await sharp(cutout).resize({ width: rect.width, height: rect.height, fit: "fill" }).ensureAlpha().extractChannel(3).extend({ top: reach, left: reach, right: reach, bottom: reach, background: "#000" }).png().toBuffer();
  const hard = await sharp(canvas).extract({ left: box.left - (rect.left - reach), top: box.top - (rect.top - reach), width: box.width, height: box.height }).resize({ width: w, height: h, fit: "fill" }).png().toBuffer();
  const [inside, near] = await Promise.all([
    sharp(hard).extractChannel(0).raw().toBuffer(),
    sharp(hard).blur(Math.max(1.5, w * 0.03)).extractChannel(0).raw().toBuffer(),
  ]);
  let changed = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    if (inside[i] > 8 || near[i] < 4) continue;
    n++;
    const distance = Math.abs(before[i * 3] - after[i * 3]) + Math.abs(before[i * 3 + 1] - after[i * 3 + 1]) + Math.abs(before[i * 3 + 2] - after[i * 3 + 2]);
    if (distance > 70) changed++;
  }
  return n ? changed / n : 1;
}

async function bodyColour(image: Buffer, rect: Rect) {
  const box = { left: rect.left + Math.round(rect.width * 0.3), top: rect.top + Math.round(rect.height * 0.35), width: Math.max(1, Math.round(rect.width * 0.4)), height: Math.max(1, Math.round(rect.height * 0.5)) };
  const pixels = await sharp(image).extract(box).resize(16, 16, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const total = [0, 0, 0];
  for (let i = 0; i < pixels.length; i++) total[i % 3] += pixels[i];
  return total.map((v) => v / (pixels.length / 3));
}

export type IntegrationResult = { used: true; image: Buffer; match: number; edges: number; shift: number; outside: number } | { used: false; reason: string; match?: number; edges?: number; shift?: number; outside?: number };

/**
 * Takes the model's version only if the pack is still recognisably the same object in the same place. Anything else
 * returns a reason instead, and the plain composite is used.
 */
export async function applyIntegration(plain: Buffer, integratedFile: Buffer, cutout: Buffer, W: number, H: number, p: Placement): Promise<IntegrationResult> {
  const meta = await sharp(cutout).metadata();
  const rect = sceneRect(meta.width!, meta.height!, W, H, p);
  const inFrame = rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= W && rect.top + rect.height <= H;
  if (!inFrame) return { used: false, reason: "The pack runs off the edge of the frame." };
  const integrated = await sharp(integratedFile).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
  const found = await locate(plain, integrated, cutout, rect, W, H);
  const shift = Math.hypot(found.dx, found.dy) / W;
  const facts = { match: found.score, shift };
  if (found.score < MIN_MATCH) return { used: false, reason: "The model changed the pack too much to match it.", ...facts };
  if (shift > MAX_SHIFT || Math.abs(found.scale - 1) > MAX_SCALE) return { used: false, reason: "The model moved or resized the pack.", ...facts };
  const aligned = await realign(integrated, W, H, rect, found);
  const f = 400 / rect.height;
  const w = Math.max(8, Math.round(rect.width * f)), h = Math.max(8, Math.round(rect.height * f));
  const edges = correlate(edgesOf(await grey(plain, rect, w, h), w, h), w, edgesOf(await grey(aligned, rect, w, h), w, h), w, 0, 0, await outlineOf(cutout, w, h));
  if (edges < MIN_EDGES) return { used: false, reason: "The model changed the pack's shape.", ...facts, edges };
  const outside = await outsideChange(plain, aligned, cutout, rect, W, H);
  if (outside > MAX_OUTSIDE_CHANGE) return { used: false, reason: "The model changed the pack's shape.", ...facts, edges, outside };
  const [before, after] = await Promise.all([bodyColour(plain, rect), bodyColour(aligned, rect)]);
  const beforeTotal = before[0] + before[1] + before[2], afterTotal = after[0] + after[1] + after[2];
  const colourShift = Math.max(...before.map((c, i) => Math.abs(c / beforeTotal - after[i] / afterTotal) * 3));
  if (colourShift > MAX_COLOUR_SHIFT || afterTotal / beforeTotal < 0.72 || afterTotal / beforeTotal > 1.3) return { used: false, reason: "The model changed the pack's colour.", ...facts, edges };
  return { used: true, image: await restoreLettering(aligned, cutout, rect), match: found.score, edges, shift, outside };
}
