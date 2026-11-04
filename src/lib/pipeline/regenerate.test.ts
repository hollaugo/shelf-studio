import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ db: vi.fn() }));
vi.mock("@/lib/data/products", () => ({ getSource: vi.fn() }));
vi.mock("./versions", () => ({}));

const { VIDEO_PROMPT } = await import("./regenerate");

describe("VIDEO_PROMPT", () => {
  it("moves the camera slowly and keeps the label still", () => {
    expect(VIDEO_PROMPT).toContain("pushes in very slowly");
    expect(VIDEO_PROMPT).toContain("every letter of its label");
  });
  it("doesn't ask for a view of the pack that the first frame doesn't show", () => {
    expect(VIDEO_PROMPT).not.toMatch(/orbit|back of|from the top/i);
  });
});
