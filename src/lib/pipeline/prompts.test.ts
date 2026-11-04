import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sceneRequest } from "./prompts";

const base = { shotBrief: "In-use scene", analysis: null, styleGuide: {}, ratio: "1:1", model: "nano_banana_2.1" };
const skill = readFileSync("src/lib/agent/skills/prompting.md", "utf8");

describe("sceneRequest", () => {
  it("tells the writer how the product is really used", () => {
    const request = sceneRequest({ ...base, product: { name: "VERDA Hydrating Conditioner", details: { category: "Hair care > Conditioner", directions: "Apply to clean, wet hair, leave 2 min, rinse." } } });
    expect(request).toContain("Apply to clean, wet hair");
    expect(request).toContain("Hair care > Conditioner");
    expect(request).toContain("never name it in the prompt");
  });

  it("still works for a product with no data", () => {
    expect(sceneRequest(base)).not.toContain("product database");
    expect(sceneRequest({ ...base, product: { name: "New product", details: {} } })).toContain("New product");
  });

  it("puts the producer and reviewer's words in the request", () => {
    const request = sceneRequest({ ...base, direction: "Use a darker tile", feedback: "The fingers look wrong" });
    expect(request).toContain("Use a darker tile");
    expect(request).toContain("The fingers look wrong");
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
