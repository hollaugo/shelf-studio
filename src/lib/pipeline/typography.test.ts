import { describe, expect, it } from "vitest";
import { textSvg, type TextStyle } from "./typography";

const TEXT = ["72-hour hydration", "VERDA Hydrating Shampoo", "VERDA Repair Hair Mask", "Repairs 3 months of damage", "Clinically tested, fragrance-free", "TSA-ready", "400 mL / 13.5 fl oz", "3 × 90 ml", "Available at Amazon, Walmart, Target and verda.com"];

describe("textSvg", () => {
  it.each(["body", "display"] as const)("writes valid path data for every position and size in the %s font", (font) => {
    for (const line of TEXT) for (const size of [35, 72, 80, 132]) for (const x of [0, 137, 500, 1013]) {
      const style: TextStyle = { font, size, color: "#000", align: "left" };
      const svg = textSvg([line], style, x, 100, 2000);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(svg).toMatch(/d="M/);
    }
  });
});
