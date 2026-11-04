import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compositeProduct, labelDiff, labelVerdict } from "./compose";
import { applyIntegration, integrationPrompt, letterMask } from "./integrate";
import { sceneRect, type Placement } from "./placement";

const W = 1000;
const placement: Placement = { centerX: 0.35, baselineY: 0.85, heightFrac: 0.6, lightFrom: "left" };
const svg = (body: string, w = W, h = W) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

const cutout = () => sharp(svg(`<rect x="60" y="10" width="180" height="120" rx="12" fill="#f4f4f2"/><rect x="10" y="130" width="280" height="760" rx="70" fill="#93a48a"/><text x="150" y="420" font-family="Helvetica" font-size="56" fill="#efe9d8" text-anchor="middle">VERDA</text><text x="150" y="520" font-family="Helvetica" font-size="26" fill="#efe9d8" text-anchor="middle">Conditioner</text>`, 300, 900)).png().toBuffer();
const scene = () => sharp(svg(`<rect width="${W}" height="${W}" fill="#b5673a"/><rect y="${W * 0.85}" width="${W}" height="${W * 0.15}" fill="#c49a6c"/><rect x="600" width="120" height="${W}" fill="#8c4b28"/>`)).png().toBuffer();
const rect = () => sceneRect(300, 900, W, W, placement);
const plain = async () => (await compositeProduct(await scene(), await cutout(), W, W, placement)).png().toBuffer();

/** A stand-in for the model: droplets on the pack, and its lettering smudged the way models smudge it. */
async function modelOutput(base: Buffer, over: string = "") {
  const r = rect();
  const droplets = Array.from({ length: 70 }, (_, i) => `<circle cx="${r.left + 20 + ((i * 37) % (r.width - 40))}" cy="${r.top + 120 + ((i * 71) % (r.height - 150))}" r="${2 + (i % 3)}" fill="#dfe8da" fill-opacity="0.75"/>`).join("");
  const garbled = `<rect x="${r.left + 30}" y="${r.top + r.height * 0.4}" width="${r.width - 60}" height="${r.height * 0.22}" fill="#8e9f85"/><text x="${r.left + r.width / 2}" y="${r.top + r.height * 0.5}" font-family="Georgia" font-size="30" fill="#e6e0cf" text-anchor="middle">VERBA</text>`;
  return sharp(base).composite([{ input: svg(garbled + droplets + over) }]).png().toBuffer();
}

describe("applyIntegration", () => {
  it("keeps the model's version when the pack hasn't moved", async () => {
    const base = await plain();
    const result = await applyIntegration(base, await modelOutput(base), await cutout(), W, W, placement);
    expect(result.used).toBe(true);
  });

  it("puts the approved lettering back over what the model drew", async () => {
    const base = await plain();
    const garbled = await modelOutput(base);
    const before = await labelDiff(garbled, await cutout(), rect());
    const result = await applyIntegration(base, garbled, await cutout(), W, W, placement);
    if (!result.used) throw new Error(result.reason);
    const after = await labelDiff(result.image, await cutout(), rect());
    expect(labelVerdict(before)).not.toBe("pass");
    expect(labelVerdict(after)).toBe("pass");
    expect(after).toBeLessThan(before);
  });

  it("realigns a pack that drifted slightly", async () => {
    const base = await plain();
    const model = await modelOutput(base);
    const shifted = await sharp(model).extend({ left: 12, top: 8, extendWith: "copy" }).extract({ left: 0, top: 0, width: W, height: W }).png().toBuffer();
    const result = await applyIntegration(base, shifted, await cutout(), W, W, placement);
    if (!result.used) throw new Error(result.reason);
    expect(result.shift).toBeGreaterThan(0.008);
    expect(result.shift).toBeLessThan(0.02);
    expect(labelVerdict(await labelDiff(result.image, await cutout(), rect()))).toBe("pass");
  });

  it("rejects a pack that moved a long way", async () => {
    const base = await plain();
    const moved = await sharp(await modelOutput(base)).extend({ left: 180, extendWith: "copy" }).extract({ left: 0, top: 0, width: W, height: W }).png().toBuffer();
    expect(await applyIntegration(base, moved, await cutout(), W, W, placement)).toMatchObject({ used: false });
  });

  it("rejects a pack that's gone or redrawn", async () => {
    const base = await plain();
    const gone = await sharp(await scene()).png().toBuffer();
    expect(await applyIntegration(base, gone, await cutout(), W, W, placement)).toMatchObject({ used: false });
  });

  it("rejects a pack that grew", async () => {
    const base = await plain();
    const r = rect();
    const fatter = await sharp(base).composite([{ input: svg(`<rect x="${r.left - 40}" y="${r.top + r.height * 0.15}" width="${r.width + 80}" height="${r.height * 0.85}" rx="90" fill="#93a48a"/>`) }]).png().toBuffer();
    expect(await applyIntegration(base, fatter, await cutout(), W, W, placement)).toMatchObject({ used: false });
  });

  it("rejects a pack whose colour changed", async () => {
    const base = await plain();
    const r = rect();
    const recoloured = await sharp(base).composite([{ input: svg(`<rect x="${r.left + 10}" y="${r.top + r.height * 0.16}" width="${r.width - 20}" height="${r.height * 0.82}" rx="40" fill="#3f6fb0" fill-opacity="0.85"/>`) }]).png().toBuffer();
    const result = await applyIntegration(base, recoloured, await cutout(), W, W, placement);
    expect(result.used).toBe(false);
  });
});

describe("letterMask", () => {
  it("finds the printed lettering, and not the cap", async () => {
    const { mask, zone } = await letterMask(await cutout(), 300, 900);
    const sum = (from: number, to: number) => { let s = 0; for (let y = from; y < to; y++) for (let x = 0; x < 300; x++) s += mask[y * 300 + x]; return s; };
    expect(sum(380, 425)).toBeGreaterThan(200); // The wordmark.
    expect(sum(20, 120)).toBe(0); // The white cap.
    expect(zone[400 * 300 + 150]).toBeGreaterThan(0.5);
    expect(zone[800 * 300 + 150]).toBe(0);
  });
});

describe("integrationPrompt", () => {
  it("adds water in the shower, and only if the scene is wet otherwise", () => {
    expect(integrationPrompt("in_use")).toMatch(/water droplets/);
    expect(integrationPrompt("lifestyle")).toMatch(/If the scene is dry, add no water/);
  });
  it("always protects the pack and names its reference", () => {
    for (const shot of ["in_use", "lifestyle"]) {
      const prompt = integrationPrompt(shot);
      expect(prompt).toContain("@scene");
      expect(prompt).toMatch(/same position/);
      expect(prompt).toMatch(/every letter/);
    }
  });
});
