import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BACKDROPS, backdropFor, sceneRequest } from "./prompts";

const base = { shotBrief: "In-use scene", analysis: null, styleGuide: {}, ratio: "1:1", model: "nano_banana_2.1" };
const skill = readFileSync("src/lib/agent/skills/prompting.md", "utf8");

describe("sceneRequest", () => {
  it("tells the writer how the product is really used", () => {
    const request = sceneRequest({ ...base, product: { sku: "VRD-1002", name: "VERDA Hydrating Conditioner", details: { category: "Hair care > Conditioner", directions: "Apply to clean, wet hair, leave 2 min, rinse." } } });
    expect(request).toContain("Apply to clean, wet hair");
    expect(request).toContain("Hair care > Conditioner");
    expect(request).toContain("never name it in the prompt");
  });

  it("still works for a product with no data", () => {
    expect(sceneRequest(base)).not.toContain("product database");
    expect(sceneRequest({ ...base, product: { sku: "NEW-1", name: "New product", details: {} } })).toContain("New product");
  });

  it("puts the producer and reviewer's words in the request", () => {
    const request = sceneRequest({ ...base, direction: "Use a darker tile", feedback: "The fingers look wrong" });
    expect(request).toContain("Use a darker tile");
    expect(request).toContain("The fingers look wrong");
  });
});

describe("backdrops", () => {
  const skus = ["VRD-1001", "VRD-1002", "VRD-1003", "VRD-1004"];

  it("differ between the demo products", () => {
    expect(new Set(skus.map((sku) => backdropFor(sku, "lifestyle"))).size).toBe(BACKDROPS.length);
  });

  it("differ between a product's Lifestyle and In-use", () => {
    for (const sku of skus) expect(backdropFor(sku, "lifestyle")).not.toBe(backdropFor(sku, "in_use"));
  });

  it("stay the same for a product, so that its channels match", () => {
    expect(backdropFor("VRD-1001", "lifestyle")).toBe(backdropFor("VRD-1001", "lifestyle"));
  });

  it("are named in the request for a shot", () => {
    expect(sceneRequest({ ...base, shot: "lifestyle", product: { sku: "VRD-1001", name: "x", details: {} } })).toContain(`Backdrop: ${backdropFor("VRD-1001", "lifestyle")}`);
    expect(sceneRequest(base)).not.toContain("Backdrop:");
  });

  it("come with rules against flat, level-less scenes", () => {
    expect(skill).toMatch(/never make a beige-on-beige scene/i);
    expect(skill).toMatch(/level with the surface/);
  });
});

describe("the in-use rules", () => {
  it("keep the real pack separate from the person", () => {
    expect(skill).toMatch(/left third is open surface/);
    expect(skill).toMatch(/Never ask for a hand holding/);
    expect(skill).toMatch(/Never a face/);
  });

  it("only let shampoo foam", () => {
    for (const product of ["Conditioner", "Hair mask", "Scalp treatment"]) expect(skill).toMatch(new RegExp(`\\| ${product}.*never foams`, "i"));
    expect(skill).not.toMatch(/\| Shampoo.*never foams/i);
  });
});
