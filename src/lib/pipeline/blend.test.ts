import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { castShadow, readSceneLight, relightProduct } from "./blend";
import { compositeProduct, detailVerdict, productDetailDiff, sceneRect, type Placement } from "./compose";

const W = 1000;
const placement: Placement = { centerX: 0.4, baselineY: 0.8, heightFrac: 0.5, lightFrom: "left" };
const svg = (body: string, w = W, h = W) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

const cutout = () => sharp(svg(`<rect x="10" y="10" width="280" height="880" rx="60" fill="#93a48a"/><text x="150" y="420" font-family="Helvetica" font-size="56" fill="#efe9d8" text-anchor="middle">VERDA</text><text x="150" y="520" font-family="Helvetica" font-size="26" fill="#efe9d8" text-anchor="middle">Conditioner</text>`, 300, 900)).png().toBuffer();
const scene = () => sharp(svg(`<defs><linearGradient id="g"><stop offset="0" stop-color="#d9b48a"/><stop offset="1" stop-color="#6d5038"/></linearGradient></defs><rect width="${W}" height="${W}" fill="url(#g)"/>`)).png().toBuffer();
const rendered = async () => (await compositeProduct(await scene(), await cutout(), W, W, placement)).jpeg({ quality: 92 }).toBuffer();
const rectOf = () => sceneRect(300, 900, W, W, placement);

async function brightnessAt(image: Buffer, x: number, y: number) {
  const { data } = await sharp(image).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return (data[0] + data[1] + data[2]) / 3;
}

describe("relightProduct", () => {
  const light = { ambient: [190, 150, 110], surface: [180, 150, 120], leftEdge: [200, 170, 130], rightEdge: [110, 80, 60], contrast: 0.6 } as Parameters<typeof relightProduct>[1];

  it("is brighter on the side facing the light", async () => {
    const { image } = await relightProduct(await cutout(), light, "left");
    expect(await brightnessAt(image, 80, 300)).toBeGreaterThan(await brightnessAt(image, 240, 300));
    const flipped = await relightProduct(await cutout(), light, "right");
    expect(await brightnessAt(flipped.image, 240, 300)).toBeGreaterThan(await brightnessAt(flipped.image, 80, 300));
  });

  it("takes on the scene's colour", async () => {
    const { image } = await relightProduct(await cutout(), light, "left");
    const { data } = await sharp(image).extract({ left: 150, top: 200, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[0] / data[2]).toBeGreaterThan(0x93 / 0x8a);
  });

  it("darkens a pack in a dark scene, but only so far", async () => {
    const dark = { ...light, ambient: [40, 30, 25] as [number, number, number], surface: [50, 40, 30] as [number, number, number] };
    const [bright, dim] = await Promise.all([relightProduct(await cutout(), light, "front"), relightProduct(await cutout(), dark, "front")]);
    const dimmed = await brightnessAt(dim.image, 150, 200);
    expect(dimmed).toBeLessThan(await brightnessAt(bright.image, 150, 200));
    expect(dimmed).toBeGreaterThan(await brightnessAt(await cutout(), 150, 200) * 0.82);
  });

  it("keeps the brand's sage in a strongly coloured scene", async () => {
    const orange = { ...light, ambient: [190, 90, 40] as [number, number, number], surface: [200, 110, 50] as [number, number, number] };
    const { image } = await relightProduct(await cutout(), orange, "left");
    const { data } = await sharp(image).extract({ left: 150, top: 200, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // However orange the scene, the pack still reads as sage.
    expect(data[1]).toBeGreaterThan(data[0] * 0.95);
  });

  it("keeps the pack's shape", async () => {
    const source = await cutout();
    const { image } = await relightProduct(source, light, "left");
    const before = await sharp(source).ensureAlpha().extractChannel(3).raw().toBuffer();
    const after = await sharp(image).ensureAlpha().extractChannel(3).raw().toBuffer();
    expect(before[(300 * 300 + 150)]).toBe(255);
    expect(after[(300 * 300 + 150)]).toBe(255);
    expect(after[(300 * 300 + 2)]).toBe(0);
  });
});

describe("castShadow", () => {
  const rows = Array.from({ length: 100 }, () => ({ from: 40, to: 60 }));
  const light = { ambient: [150, 150, 150], surface: [150, 150, 150], leftEdge: [150, 150, 150], rightEdge: [150, 150, 150], contrast: 0.5 } as Parameters<typeof castShadow>[6];
  const sideOf = async (from: "left" | "right") => {
    const { near } = await castShadow(rows, 0, 99, { left: 200, top: 100, width: 100, height: 100 }, 500, 500, light, from);
    const alpha = await sharp(near).extractChannel(3).raw().toBuffer();
    let leftOfPack = 0, rightOfPack = 0;
    for (let y = 199; y < 215; y++) for (let x = 0; x < 500; x++) {
      if (x < 240) leftOfPack += alpha[y * 500 + x];
      if (x > 260) rightOfPack += alpha[y * 500 + x];
    }
    return { leftOfPack, rightOfPack };
  };

  it("falls away from the light", async () => {
    const fromLeft = await sideOf("left");
    expect(fromLeft.rightOfPack).toBeGreaterThan(fromLeft.leftOfPack);
    const fromRight = await sideOf("right");
    expect(fromRight.leftOfPack).toBeGreaterThan(fromRight.rightOfPack);
  });
});

describe("the scene's own light", () => {
  it("reads a bright side and a dark side", async () => {
    const light = await readSceneLight(await scene(), W, W, rectOf());
    expect(light.leftEdge[0]).toBeGreaterThan(light.rightEdge[0]);
    expect(light.contrast).toBeGreaterThan(0);
  });
});

describe("productDetailDiff", () => {
  it("passes a pack that's only been lit by its scene", async () => {
    const { worst } = await productDetailDiff(await rendered(), await cutout(), rectOf());
    expect(detailVerdict(worst)).toBe("pass");
  });

  it("catches a label that was changed", async () => {
    const rect = rectOf();
    const covered = await sharp(await rendered()).composite([{ input: svg(`<rect x="${rect.left + 30}" y="${rect.top + rect.height * 0.4}" width="${rect.width - 60}" height="${rect.height * 0.2}" fill="#8f9f86"/>`) }]).jpeg({ quality: 92 }).toBuffer();
    const { worst } = await productDetailDiff(covered, await cutout(), rect);
    expect(detailVerdict(worst)).toBe("fail");
  });

  it("catches a small added word", async () => {
    const rect = rectOf();
    const added = await sharp(await rendered()).composite([{ input: svg(`<text x="${rect.left + rect.width / 2}" y="${rect.top + rect.height * 0.8}" font-family="Helvetica" font-size="16" fill="#efe9d8" text-anchor="middle">2 oz</text>`) }]).jpeg({ quality: 92 }).toBuffer();
    const { worst } = await productDetailDiff(added, await cutout(), rect);
    expect(detailVerdict(worst)).not.toBe("pass");
  });
});
