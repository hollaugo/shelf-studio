import { describe, expect, it } from "vitest";
import sheet from "../../../supabase/seed-assets/product-sheet.json";
import { productDetailsSchema } from "./product-info";

const row = (sku: string) => sheet.find((p) => p.sku === sku)!;

describe("the product sheet", () => {
  it("covers all five SKUs with complete, valid details", () => {
    expect(sheet.map((p) => p.sku)).toEqual(["VRD-1001", "VRD-1002", "VRD-1003", "VRD-1004", "VRD-1005"]);
    for (const p of sheet) {
      const details = productDetailsSchema.parse(p.details);
      for (const value of [p.name, p.size, p.primary_claim, details.description, details.ingredients, details.directions, details.gtin]) expect(value).toBeTruthy();
    }
  });

  it("uses the same unit as the packs", () => {
    for (const p of sheet) expect(p.size).toMatch(/\d mL$/);
  });

  it("keeps the fragrance-free claim true to the ingredients", () => {
    expect(row("VRD-1004").primary_claim).toContain("fragrance-free");
    expect(row("VRD-1004").details.ingredients).not.toMatch(/parfum|fragrance/i);
  });
});
