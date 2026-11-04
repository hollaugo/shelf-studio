import { describe, expect, it } from "vitest";
import { hasDetails, mergeDetails, productDetailsSchema, type ExtractedInfo } from "./product-info";

const info: ExtractedInfo = { name: "A", size: null, claims: [], brand: null, category: null, description: "New", benefits: [], ingredients: null, directions: null, warnings: null, price: null, gtin: null, attributes: [] };

describe("product details", () => {
  it("takes new values without wiping existing ones", () => {
    expect(mergeDetails({ description: "Old", ingredients: "Aqua", benefits: ["Soft"] }, info)).toEqual({ description: "New", ingredients: "Aqua", benefits: ["Soft"] });
  });
  it("leaves name, size and claims out of the stored details", () => {
    expect(mergeDetails({}, info)).not.toHaveProperty("name");
  });
  it("knows when there's nothing stored", () => {
    expect(hasDetails({})).toBe(false);
    expect(hasDetails({ benefits: [], description: "" })).toBe(false);
    expect(hasDetails({ benefits: ["Soft"] })).toBe(true);
  });
  it("drops fields it doesn't know and rejects oversized ones", () => {
    expect(productDetailsSchema.parse({ brand: "VERDA", channel: "../x" })).toEqual({ brand: "VERDA" });
    expect(productDetailsSchema.safeParse({ price: "x".repeat(41) }).success).toBe(false);
  });
});
