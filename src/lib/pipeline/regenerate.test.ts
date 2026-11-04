import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ db: vi.fn() }));
vi.mock("@/lib/data/products", () => ({ getSource: vi.fn() }));
vi.mock("./versions", () => ({}));

const { orbitPrompt } = await import("./regenerate");

describe("orbitPrompt", () => {
  it("asks for a top-down orbit in the 180 to 270 degree range", () => {
    const degrees = Number(orbitPrompt(true).match(/about (\d+) degrees/)?.[1]);
    expect(degrees).toBeGreaterThanOrEqual(180);
    expect(degrees).toBeLessThanOrEqual(270);
    expect(orbitPrompt(true)).toContain("from the top");
  });
  it("names the back reference only when there is one", () => {
    expect(orbitPrompt(true)).toContain("the third shows the back");
    expect(orbitPrompt(false)).not.toContain("third");
    expect(orbitPrompt(false)).toContain("no text");
  });
});
