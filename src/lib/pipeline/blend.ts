import sharp from "sharp";

export type LightDirection = "left" | "right" | "top" | "front";
type Rgb = [number, number, number];
type Box = { left: number; top: number; width: number; height: number };

export type SceneLight = {
  /** Average colour around the product. */
  ambient: Rgb;
  /** Colour of the surface it stands on, which bounces up onto the pack. */
  surface: Rgb;
  /** Colours just beyond each side, which wrap around its edges. */
  leftEdge: Rgb;
  rightEdge: Rgb;
  /** 0 for flat, overcast light, up to 1 for strong sun and deep shadow. */
  contrast: number;
};

const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

async function averageOf(scene: Buffer, W: number, H: number, box: Box): Promise<{ colour: Rgb; spread: number }> {
  const left = clamp(Math.round(box.left), 0, W - 1), top = clamp(Math.round(box.top), 0, H - 1);
  const width = clamp(Math.round(box.width), 1, W - left), height = clamp(Math.round(box.height), 1, H - top);
  const { data, info } = await sharp(scene).extract({ left, top, width, height }).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum: Rgb = [0, 0, 0];
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
    lumas.push(luma([data[i], data[i + 1], data[i + 2]]));
  }
  const n = lumas.length;
  const mean = lumas.reduce((a, v) => a + v, 0) / n;
  const spread = Math.sqrt(lumas.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  return { colour: [sum[0] / n, sum[1] / n, sum[2] / n], spread };
}

/** Measures the light where the product will stand, so that it can be lit to match. */
export async function readSceneLight(scene: Buffer, W: number, H: number, rect: Box): Promise<SceneLight> {
  const side = rect.width * 0.5;
  const [around, surface, left, right] = await Promise.all([
    averageOf(scene, W, H, { left: rect.left - side, top: rect.top, width: rect.width + side * 2, height: rect.height }),
    averageOf(scene, W, H, { left: rect.left - side * 0.3, top: rect.top + rect.height, width: rect.width + side * 0.6, height: Math.max(4, rect.height * 0.1) }),
    averageOf(scene, W, H, { left: rect.left - side, top: rect.top, width: side, height: rect.height }),
    averageOf(scene, W, H, { left: rect.left + rect.width, top: rect.top, width: side, height: rect.height }),
  ]);
  const mean = Math.max(1, luma(around.colour));
  return { ambient: around.colour, surface: surface.colour, leftEdge: left.colour, rightEdge: right.colour, contrast: clamp((around.spread / mean) * 2.4, 0, 1) };
}

/** Where the product's opaque pixels start and end on each row. */
function rowExtents(pixels: Uint8Array | Buffer, width: number, height: number) {
  const rows: ({ from: number; to: number } | null)[] = [];
  for (let y = 0; y < height; y++) {
    let from = -1, to = -1;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 128) {
        if (from < 0) from = x;
        to = x;
      }
    }
    rows.push(from < 0 ? null : { from, to });
  }
  return rows;
}

/**
 * Lights the real product the way the scene would. Only smooth changes of brightness and colour are applied, as if a
 * photographer had shot it there, so its shape and every letter stay as they are in the approved pack.
 */
export async function relightProduct(image: Buffer, light: SceneLight, from: LightDirection) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.from(data);
  const rows = rowExtents(data, width, height);
  const firstRow = rows.findIndex(Boolean);
  const lastRow = height - 1 - [...rows].reverse().findIndex(Boolean);
  const side = from === "left" ? -1 : from === "right" ? 1 : 0;

  // Packshots are bright studio shots, so a darker scene brings the whole pack down with it.
  const exposure = clamp(luma(light.ambient) / 150, 0.74, 1.04);
  const grey = Math.max(1, luma(light.ambient));
  const tint = light.ambient.map((c) => 1 + (c / grey - 1) * 0.42) as Rgb;
  const shadowDepth = 0.2 + 0.24 * light.contrast;
  const glow = 0.05 + 0.05 * light.contrast;

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (!row) continue;
    const centre = (row.from + row.to) / 2, half = Math.max(1, (row.to - row.from) / 2);
    const fromBottom = (lastRow - y) / Math.max(1, lastRow - firstRow);
    const bounce = 0.17 * clamp(1 - fromBottom / 0.16, 0, 1);
    for (let x = row.from; x <= row.to; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;
      const u = clamp((x - centre) / half, -1, 1);
      // A rounded pack turns away from the light across its width.
      const facing = side ? (1 + side * u) / 2 : 1 - u * u * 0.5;
      const shade = 1 - shadowDepth * (1 - facing) ** 1.5 - 0.08 * u ** 4;
      const lit = side ? glow * Math.exp(-(((u - side * 0.52) / 0.36) ** 2)) : 0;
      const gain = exposure * (shade + lit);
      // The edges pick up a little of whatever is right behind them.
      const edge = u < 0 ? light.leftEdge : light.rightEdge;
      const wrap = 0.26 * clamp((Math.abs(u) - 0.9) / 0.1, 0, 1);
      for (let c = 0; c < 3; c++) {
        let value = data[i + c] * gain * tint[c];
        value = mix(value, light.surface[c] * 0.92, bounce);
        value = mix(value, edge[c], wrap);
        out[i + c] = clamp(Math.round(value), 0, 255);
      }
    }
  }

  // Softens the cut edge so that it isn't sharper than the photograph around it.
  const alpha = await sharp(data, { raw: { width, height, channels: 4 } }).extractChannel(3).blur(0.8).raw().toBuffer();
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = Math.min(data[i * 4 + 3], alpha[i]);
  return { image: await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer(), rows, firstRow, lastRow };
}

function paintLayer(W: number, H: number, colour: Rgb, paint: (alpha: Float32Array) => void) {
  const alpha = new Float32Array(W * H);
  paint(alpha);
  const pixels = Buffer.alloc(W * H * 4);
  for (let i = 0; i < alpha.length; i++) {
    pixels[i * 4] = colour[0]; pixels[i * 4 + 1] = colour[1]; pixels[i * 4 + 2] = colour[2];
    pixels[i * 4 + 3] = clamp(Math.round(alpha[i] * 255), 0, 255);
  }
  return sharp(pixels, { raw: { width: W, height: H, channels: 4 } });
}

/** The pack's real silhouette laid along the surface, away from the light. It softens and fades with distance, as a shadow does. */
export async function castShadow(rows: ({ from: number; to: number } | null)[], firstRow: number, lastRow: number, rect: Box, W: number, H: number, light: SceneLight, from: LightDirection) {
  const dir = from === "left" ? 1 : from === "right" ? -1 : 0;
  const packHeight = lastRow - firstRow;
  const reach = packHeight * (dir ? 0.85 : 0.05);
  const drop = packHeight * (dir ? 0.1 : 0.05);
  const strength = 0.42 + 0.3 * light.contrast;
  const baseY = rect.top + lastRow;
  const colour = light.surface.map((c) => c * 0.2) as Rgb;
  const paint = (limit: number, opacity: number) => paintLayer(W, H, colour, (alpha) => {
    for (let sy = 0; sy <= drop; sy++) {
      const t = sy / Math.max(1, drop);
      if (t > limit) break;
      const row = rows[Math.round(lastRow - t * packHeight)] ?? rows[lastRow];
      if (!row) continue;
      const y = baseY + sy;
      if (y < 0 || y >= H) continue;
      // Each row of the pack lands further along the surface than the one below it.
      const offset = dir * t * reach;
      for (let x = row.from; x <= row.to; x++) {
        const px = Math.round(rect.left + x + offset);
        if (px >= 0 && px < W) alpha[y * W + px] = Math.max(alpha[y * W + px], opacity * (1 - t) ** 0.9);
      }
      // Fills the gaps between rows as the shadow slants.
      const next = dir * ((sy + 1) / Math.max(1, drop)) * reach;
      for (let f = Math.min(offset, next); f <= Math.max(offset, next); f += 1) {
        for (const x of [row.from, row.to]) {
          const px = Math.round(rect.left + x + f);
          if (px >= 0 && px < W) alpha[y * W + px] = Math.max(alpha[y * W + px], opacity * (1 - t) ** 0.9);
        }
      }
    }
  });
  const softness = Math.max(2, H * mix(0.009, 0.0035, light.contrast));
  const [near, far] = await Promise.all([
    paint(0.45, strength).blur(softness).png().toBuffer(),
    paint(1, strength * 0.7).blur(softness * 3).png().toBuffer(),
  ]);
  return { near, far };
}

/** The dark line right where the pack meets the surface. Without it, things look like they're floating. */
export async function contactShadow(rows: ({ from: number; to: number } | null)[], lastRow: number, rect: Box, W: number, H: number, light: SceneLight) {
  const base = rows[lastRow] ?? rows[Math.max(0, lastRow - 2)];
  const widest = rows[Math.max(0, lastRow - Math.round(rect.height * 0.04))] ?? base;
  const cx = rect.left + (((widest?.from ?? 0) + (widest?.to ?? rect.width)) / 2);
  const rx = (((widest?.to ?? rect.width) - (widest?.from ?? 0)) / 2) * 0.92;
  const cy = rect.top + lastRow - rect.height * 0.002;
  const [r, g, b] = light.surface.map((c) => Math.round(c * 0.14));
  const svg = (ry: number, opacity: number) => Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgb(${r},${g},${b})" fill-opacity="${opacity}"/></svg>`);
  const [tight, pool] = await Promise.all([
    sharp(svg(rect.height * 0.005, 0.7)).blur(Math.max(1, H * 0.0018)).png().toBuffer(),
    sharp(svg(rect.height * 0.022, 0.34)).blur(Math.max(2, H * 0.008)).png().toBuffer(),
  ]);
  return { tight, pool };
}

/** A faint, blurred reflection on the surface, which most stone and wet surfaces show when you look along them. */
export async function surfaceReflection(image: Buffer, rect: Box, lastRow: number, H: number) {
  const depth = Math.round(rect.height * 0.1);
  const available = Math.min(depth, H - (rect.top + lastRow) - 1);
  if (available < 4) return null;
  const { data, info } = await sharp(image).flip().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const skip = info.height - 1 - lastRow;
  const out = Buffer.alloc(info.width * available * 4);
  for (let y = 0; y < available; y++) {
    const fade = 0.14 * (1 - y / available) ** 1.6;
    for (let x = 0; x < info.width; x++) {
      const i = ((y + skip) * info.width + x) * 4, o = (y * info.width + x) * 4;
      out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2];
      out[o + 3] = Math.round(data[i + 3] * fade);
    }
  }
  const input = await sharp(out, { raw: { width: info.width, height: available, channels: 4 } }).blur(Math.max(1, H * 0.0012)).png().toBuffer();
  return { input, left: rect.left, top: rect.top + lastRow };
}
