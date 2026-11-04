import { describe, expect, it } from "vitest";
import { validateListing, type Listing } from "./channel-rules";

const amazon: Listing = {
  title: "VERDA Daily Hydrating Shampoo with Aloe & Oat, 13.5 fl oz",
  itemHighlights: "Matte sage bottle, aloe and oat formula, for daily use on all hair types",
  bullets: ["A", "B", "C", "D", "E"],
  description: "A daily shampoo with aloe and oat.",
  altText: "VERDA shampoo",
};

const rules = (l: Listing, c: Parameters<typeof validateListing>[0] = "amazon") => validateListing(c, l).filter((v) => v.severity === "fail").map((v) => v.rule);

describe("validateListing", () => {
  it("accepts a clean Amazon listing", () => expect(rules(amazon)).toEqual([]));
  it("enforces Amazon's 75-character title", () => expect(rules({ ...amazon, title: "x".repeat(76) })).toContain("length"));
  it("needs exactly five Amazon bullets", () => expect(rules({ ...amazon, bullets: ["A"] })).toContain("count"));
  it("enforces Walmart's 80-character key features and 150-word description", () => {
    const r = rules({ ...amazon, itemHighlights: undefined, shortDescription: "short", bullets: Array(5).fill("y".repeat(81)), description: "too short" }, "walmart");
    expect(r).toContain("length");
  });
  it("blocks drug claims, promotions and superlatives", () => {
    expect(rules({ ...amazon, bullets: ["Treats dandruff", "B", "C", "D", "E"] })).toContain("drug_claim");
    expect(rules({ ...amazon, description: "Free shipping today" })).toContain("promotional");
    expect(rules({ ...amazon, description: "The best shampoo" })).toContain("superlative");
  });
  it("blocks symbols and shouting in titles, but allows the brand name", () => {
    expect(rules({ ...amazon, title: "VERDA Shampoo™" })).toContain("symbols");
    expect(rules({ ...amazon, title: "VERDA AMAZING Shampoo" })).toContain("caps");
  });
  it("requires verda.com SEO and FAQ fields", () => {
    const r = rules({ ...amazon, itemHighlights: undefined, bullets: ["A", "B", "C"] }, "verda");
    expect(r).toEqual(expect.arrayContaining(["required", "count"]));
  });
});
