import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { claimCardPrompt: fill, claimLines, claimTypeReference } = await import("./claim-card");
const shots: { key: string; prompt_template: string | null }[] = JSON.parse(readFileSync("supabase/seed-assets/shot-templates.json", "utf8"));
const template = shots.find((s) => s.key === "claim_card")!.prompt_template!;
const claimCardPrompt = (...args: [Parameters<typeof fill>[1], string[] | null, boolean]) => fill(template, ...args);

const product = { name: "VERDA Repair Hair Mask", primary_claim: "Repairs 3 months of damage", size: "250 mL", analysis: null };

describe("claim cards", () => {
  it("uses approved wording only", () => {
    expect(claimLines(product)).toEqual(["Repairs 3 months of damage", "250 mL"]);
    expect(claimLines({ ...product, primary_claim: null, size: null })).toEqual(["VERDA Repair Hair Mask"]);
  });
  it("gives every product the same scene and type instructions", () => {
    const a = claimCardPrompt(product, ["VERDA"], true);
    const b = claimCardPrompt({ analysis: null }, ["VERDA"], true);
    expect(a).toBe(b);
    expect(a).toContain("@type shows the exact typography");
    expect(a).toContain("burnt sienna");
  });
  it("quotes the pack's words, and doesn't mention a back image that doesn't exist", () => {
    const prompt = claimCardPrompt(product, ["VERDA", "Repair"], false);
    expect(prompt).toContain('"VERDA", "Repair"');
    expect(prompt).not.toContain("@back");
  });
  it("describes the pack only from what's known about it", () => {
    const analysis = { packaging: { form: "jar", material: "plastic", finish: "matte", closure: "screw lid" } } as never;
    expect(claimCardPrompt({ analysis }, null, true)).toContain("a matte jar with a screw lid");
    expect(claimCardPrompt({ analysis: null }, null, true)).not.toContain("flip-top");
  });
  it("sets the type on a square reference", async () => {
    const meta = await sharp(await claimTypeReference(product)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1536, 1536, "jpeg"]);
  });
});
