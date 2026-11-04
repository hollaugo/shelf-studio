import { describe, expect, it } from "vitest";
import { canMovePdp, groupWarnings, isFinished, isOpen, itemNote, submission } from "./pdp";

const done = { state: "checking" as const, checks_done_at: "now", checks: ["pass" as const] };

describe("PDP lifecycle", () => {
  it("follows the design's path", () => {
    for (const [a, b] of [["draft", "in_review"], ["in_review", "approved"], ["in_review", "changes_requested"], ["approved", "live"], ["live", "replaced"], ["replaced", "live"], ["approved", "replaced"]] as const) expect(canMovePdp(a, b)).toBe(true);
  });

  it("can't skip review, or reopen a finished version", () => {
    for (const [a, b] of [["draft", "approved"], ["draft", "live"], ["in_review", "live"], ["changes_requested", "draft"], ["changes_requested", "approved"], ["replaced", "draft"]] as const) expect(canMovePdp(a, b)).toBe(false);
  });

  it("counts anything unresolved as the channel's open version", () => {
    expect(["draft", "in_review", "approved", "changes_requested", "live", "replaced"].filter((s) => isOpen(s as never))).toEqual(["draft", "in_review", "approved"]);
  });
});

describe("submission", () => {
  const set = (over: Partial<Record<string, object>> = {}) => (["hero", "lifestyle", "in_use", "claim_card", "copy", "video"] as const).map((shot_key) => ({ shot_key, ...done, ...(over[shot_key] ?? {}) }));

  it("needs something to submit", () => {
    expect(submission([])).toMatchObject({ ready: false });
  });

  it("includes everything when all of it is finished", () => {
    expect(submission(set())).toEqual({ ready: true, shots: ["hero", "lifestyle", "in_use", "claim_card", "copy", "video"] });
  });

  it("treats video as optional, whether not started or failed", () => {
    for (const state of ["draft", "failed"]) {
      const result = submission(set({ video: { state, checks_done_at: null, checks: [] } }));
      expect(result).toEqual({ ready: true, shots: ["hero", "lifestyle", "in_use", "claim_card", "copy"] });
    }
  });

  it("waits for work in progress, including video", () => {
    expect(submission(set({ video: { state: "generating" } }))).toMatchObject({ ready: false, problem: expect.stringContaining("worked on") });
    expect(submission(set({ hero: { state: "checking", checks_done_at: null } }))).toMatchObject({ ready: false });
  });

  it("requires the copy to be written", () => {
    expect(submission(set({ copy: { state: "draft", checks_done_at: null, checks: [] } }))).toMatchObject({ ready: false, problem: "1 asset isn't finished." });
  });

  it("blocks on a failed check, but not on a warning", () => {
    expect(submission(set({ lifestyle: { checks: ["pass", "fail"] } }))).toMatchObject({ ready: false, problem: expect.stringContaining("check failed") });
    expect(submission(set({ lifestyle: { checks: ["pass", "warn"] } })).ready).toBe(true);
  });

  it("accepts assets finished before PDPs existed", () => {
    for (const state of ["needs_review", "approved", "published"] as const) expect(isFinished({ state, checks_done_at: null })).toBe(true);
    expect(isFinished({ state: "rejected", checks_done_at: "now" })).toBe(false);
  });
});

describe("itemNote", () => {
  it("compares with the version this one is based on", () => {
    const base = { assetIds: ["a"], version: 2 };
    expect(itemNote("a", base, 3)).toBe("Same as v2");
    expect(itemNote("b", base, 3)).toBe("New in v3");
    expect(itemNote("a", null, 1)).toBeNull();
  });
});

describe("groupWarnings", () => {
  const drawn = { label: "A model drew this pack", detail: { note: "Check it closely." } };
  it("merges the same warning on several items", () => {
    const groups = groupWarnings([{ ...drawn, shot: "lifestyle" }, { ...drawn, shot: "in_use" }, { label: "Follows the style guide", shot: "lifestyle", detail: { note: "One thing." } }]);
    expect(groups).toHaveLength(2);
    expect(groups[0].shots).toEqual(["lifestyle", "in_use"]);
  });
  it("keeps warnings apart when they say different things", () => {
    expect(groupWarnings([{ label: "Follows the style guide", shot: "lifestyle", detail: { note: "One thing." } }, { label: "Follows the style guide", shot: "copy", detail: { note: "Another." } }])).toHaveLength(2);
  });
});
