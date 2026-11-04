import { describe, expect, it } from "vitest";
import { colourDifference, MAX_LABEL_RETRIES, packCentre, packOutcomes, shapeDifference, shouldRetryLabel, type PackInspection } from "./pack-check";

const base: PackInspection = { box: { left: 0.1, top: 0.3, right: 0.3, bottom: 0.82 }, lines: ["VERDA"], passed: true, summary: "Wording is exact", shapeOff: 0.03, colourOff: 0.02 };
const result = (over: Partial<PackInspection>, key: string) => packOutcomes({ ...base, ...over }).find((o) => o.check_key === key)!;

describe("label retries", () => {
  it("retries a wrong label up to the limit", () => {
    expect(shouldRetryLabel({ passed: false }, 0)).toBe(true);
    expect(shouldRetryLabel({ passed: false }, MAX_LABEL_RETRIES - 1)).toBe(true);
    expect(shouldRetryLabel({ passed: false }, MAX_LABEL_RETRIES)).toBe(false);
  });
  it("doesn't pay again when the label is right, or wasn't read", () => {
    expect(shouldRetryLabel({ passed: true }, 0)).toBe(false);
    expect(shouldRetryLabel({ passed: null }, 0)).toBe(false);
  });
});

describe("packOutcomes", () => {
  it("blocks a wrong label and names what it read", () => {
    const check = result({ passed: false, summary: "2 of 3 lines exact", lines: ["VERBA"] }, "label_match");
    expect(check.result).toBe("fail");
    expect(check.detail.note).toContain("VERBA");
  });
  it("asks a person to read a label the check couldn't", () => {
    expect(result({ passed: null, summary: "The read-back didn't run." }, "label_match").result).toBe("warn");
  });
  it("warns, but doesn't block, on shape and colour, since these are approximate", () => {
    expect(result({}, "pack_shape").result).toBe("pass");
    expect(result({ shapeOff: 0.3 }, "pack_shape")).toMatchObject({ result: "warn", detail: { note: expect.stringContaining("30%") } });
    expect(result({ colourOff: 0.2 }, "pack_shape").result).toBe("warn");
    expect(result({ shapeOff: null, colourOff: null }, "pack_shape").result).toBe("pass");
  });
  it("always tells the reviewer that a model drew it", () => {
    expect(result({}, "model_drawn").result).toBe("warn");
  });
});

describe("measurements", () => {
  it("compares proportions, allowing for a non-square image", () => {
    expect(shapeDifference({ left: 0, top: 0, right: 0.2, bottom: 0.5 }, 1, 0.4)).toBeCloseTo(0);
    expect(shapeDifference({ left: 0, top: 0, right: 0.25, bottom: 0.5 }, 1, 0.4)).toBeCloseTo(0.25);
    expect(shapeDifference({ left: 0, top: 0, right: 0.1, bottom: 0.5 }, 2, 0.4)).toBeCloseTo(0);
    expect(shapeDifference({ left: 0.2, top: 0.5, right: 0.1, bottom: 0.5 }, 1, 0.4)).toBeNull();
  });
  it("ignores brightness when comparing colour", () => {
    expect(colourDifference([150, 170, 140], [75, 85, 70])).toBeCloseTo(0);
    expect(colourDifference([150, 170, 140], [200, 100, 60])).toBeGreaterThan(0.1);
  });
  it("finds the pack's centre, or the middle if it wasn't found", () => {
    expect(packCentre({ left: 0.1, top: 0, right: 0.3, bottom: 1 })).toBeCloseTo(0.2);
    expect(packCentre(null)).toBe(0.5);
  });
});
