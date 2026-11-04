import { describe, expect, it } from "vitest";
import { compareAnalysis, compareText, cutoutCheck, maskMetrics } from "./auto-checks";
import { evalModels, OVERLAY_MODEL, usageCost } from "./models";
import { expectedLines, fillText, scenePrompt, textPrompt } from "./text-in-image";

describe("compareText", () => {
  it("passes exact wording, ignoring case and line breaks", () => {
    const r = compareText(["72-hour hydration", "VERDA Hydrating Shampoo"], ["72-HOUR", "HYDRATION", "Verda Hydrating Shampoo"]);
    expect(r.passed).toBe(true);
  });
  it("treats curly quotes and long dashes as their plain forms", () => {
    expect(compareText(["72-hour hydration"], ["72–hour hydration"]).passed).toBe(true);
  });
  it("fails a misspelling and says how close it was", () => {
    const r = compareText(["72-hour hydration"], ["72-hour hydraton"]);
    expect(r.passed).toBe(false);
    expect(r.items[0].detail).toMatch(/9\d% similar/);
    expect(r.summary).toBe("0 of 1 lines exact, with extra text");
  });
  it("fails a changed number", () => {
    expect(compareText(["400 ml"], ["40 ml"]).passed).toBe(false);
  });
  it("fails text nobody asked for", () => {
    const r = compareText(["72-hour hydration"], ["72-hour hydration", "Buy now"]);
    expect(r.passed).toBe(false);
    expect(r.items.at(-1)).toMatchObject({ label: "No extra text", ok: false, detail: "buy, now" });
  });
  it("fails when nothing was read", () => {
    expect(compareText(["72-hour hydration"], []).passed).toBe(false);
  });
});

describe("compareAnalysis", () => {
  const facts = { name: "VERDA Hydrating Shampoo", size: "400 ml", claim: "72-hour hydration" };
  const output = { productName: "Hydrating Shampoo", size: "400 mL / 13.5 fl oz", visibleText: ["VERDA", "Hydrating Shampoo", "72-hour hydration"], claimsOnPack: ["72-hour hydration"], imageType: "white_background_packshot", issues: [] };
  it("accepts facts read from the pack", () => {
    expect(compareAnalysis(output, facts, { name: true, size: true, claim: true, imageType: "white_background_packshot" }).passed).toBe(true);
  });
  it("catches a wrong size", () => {
    expect(compareAnalysis({ ...output, size: "250 ml" }, facts, { size: true }).passed).toBe(false);
  });
  it("expects stress images to be flagged", () => {
    expect(compareAnalysis(output, facts, { flagsIssue: true }).passed).toBe(false);
    expect(compareAnalysis({ ...output, issues: ["Low resolution"] }, facts, { flagsIssue: true }).passed).toBe(true);
  });
});

describe("cutout checks", () => {
  const mask = (values: number[]) => Uint8Array.from(values);
  it("measures coverage, purity and agreement", () => {
    const m = maskMetrics(mask([255, 255, 0, 0]), mask([255, 0, 0, 0]));
    expect(m).toEqual({ coverage: 0.5, purity: 1, agreement: 0.5 });
  });
  it("fails a soft grey mask", () => {
    const r = cutoutCheck(maskMetrics(mask([128, 128, 0, 0])));
    expect(r.passed).toBe(false);
    expect(r.summary).toBe("Mask isn't pure black and white");
  });
  it("fails a mask that disagrees with today's", () => {
    expect(cutoutCheck(maskMetrics(mask([255, 0, 0, 0]), mask([0, 255, 0, 0]))).passed).toBe(false);
  });
  it("skips agreement when there's nothing to compare with", () => {
    expect(cutoutCheck(maskMetrics(mask([255, 0, 0, 0]))).items).toHaveLength(2);
  });
});

describe("text prompts", () => {
  const product = { name: "VERDA Hydrating Shampoo", size: "400 ml", primary_claim: "72-hour hydration" };
  const spec = { headline: "{claim}", subline: "{name}, {size}", tone: "dark" as const };
  it("fills text from the product", () => {
    expect(expectedLines(spec, product)).toEqual(["72-hour hydration", "VERDA Hydrating Shampoo, 400 ml"]);
  });
  it("refuses a prompt the product has no data for", () => {
    expect(() => fillText("{claim}", { ...product, primary_claim: null })).toThrow(/no claim/);
  });
  it("asks models for the exact text, and the baseline's scene for none", () => {
    expect(textPrompt("A shelf.", spec, product)).toContain('Headline: "72-hour hydration"');
    expect(scenePrompt("A shelf.", spec)).toContain("No text");
    expect(scenePrompt("A shelf.", spec)).not.toContain("72-hour");
  });
  it("only keeps room for the pack when there is one", () => {
    expect(scenePrompt("A tile.", { ...spec, with_pack: false })).not.toContain("real pack");
  });
});

describe("models", () => {
  it("offers the baseline only for text in images", () => {
    expect(evalModels("text_image").some((m) => m.id === OVERLAY_MODEL)).toBe(true);
    expect(evalModels("image").some((m) => m.id === OVERLAY_MODEL)).toBe(false);
  });
  it("prices tokens per million", () => {
    expect(usageCost("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24);
    expect(usageCost("claude-haiku-5-5", 1_000_000, 0)).toBe(0.1);
  });
});

describe("compareText on a pack", () => {
  const pack = ["VERDA", "Daily Hydrating Shampoo", "with aloe & oat · 400 mL / 13.5 fl oz"];
  it("treats a bullet and a middle dot as the same mark", () => {
    expect(compareText(pack, ["VERDA", "Daily Hydrating Shampoo", "with aloe & oat • 400 mL / 13.5 fl oz"]).passed).toBe(true);
  });
  it("doesn't mind where a model breaks a line", () => {
    expect(compareText(pack, ["VERDA", "Daily Hydrating", "Shampoo", "with aloe & oat · 400 mL", "/ 13.5 fl oz"]).passed).toBe(true);
  });
  it("doesn't mind spacing around a slash, or a line break after a hyphen", () => {
    expect(compareText(pack, ["VERDA", "Daily Hydrating Shampoo", "with aloe & oat · 400 mL/ 13.5 fl oz"]).passed).toBe(true);
    expect(compareText(["TSA-ready"], ["TSA-", "ready"]).passed).toBe(true);
  });
  it("fails a wrong number or a misspelling", () => {
    expect(compareText(pack, ["VERDA", "Daily Hydrating Shampoo", "with aloe & oat · 40 mL / 13.5 fl oz"]).passed).toBe(false);
    expect(compareText(pack, ["VERBA", "Daily Hydrating Shampoo", "with aloe & oat · 400 mL / 13.5 fl oz"]).passed).toBe(false);
  });
  it("fails words that aren't on the pack", () => {
    expect(compareText(pack, [...pack, "Now with argan"]).passed).toBe(false);
  });
  it("accepts the three bottles of a set in any order", () => {
    expect(compareText(["VERDA", "Shampoo", "VERDA", "Conditioner", "VERDA", "Hair Mask"], ["VERDA Conditioner", "VERDA Hair Mask", "VERDA Shampoo"]).passed).toBe(true);
  });
});
