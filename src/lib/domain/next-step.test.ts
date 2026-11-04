import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";

const base = { role: "producer" as const, channel: "Amazon", total: 6, working: 0, attention: 0, ready: 0, inReview: 0, approved: 0, published: 0, copyDraft: false, videoReady: false, videoLocked: false, canGenerateMore: false };

describe("nextStep", () => {
  it("starts with generating", () => {
    expect(nextStep({ ...base, total: 0 }).actions).toEqual(["generate"]);
  });
  it("offers a reviewer the switch instead of hiding generation", () => {
    expect(nextStep({ ...base, role: "reviewer", total: 0 }).actions).toEqual(["switch_producer"]);
    expect(nextStep({ ...base, role: "reviewer", copyDraft: true, videoReady: true }).actions).toEqual(["switch_producer"]);
  });
  it("gives a producer copy and video buttons when they're waiting", () => {
    const step = nextStep({ ...base, copyDraft: true, videoReady: true });
    expect(step.title).toBe("Write the listing");
    expect(step.actions).toEqual(["write_copy", "video"]);
  });
  it("puts a reviewer's decisions first", () => {
    expect(nextStep({ ...base, role: "reviewer", inReview: 2 }).title).toBe("2 assets waiting for your decision");
  });
  it("sends a producer to the reviewer when only review is left", () => {
    expect(nextStep({ ...base, inReview: 1, videoLocked: true }).actions).toEqual(["switch_reviewer"]);
  });
  it("waits while work is running", () => {
    expect(nextStep({ ...base, working: 2, ready: 3 }).actions).toEqual([]);
  });
  it("flags problems but keeps the other actions available", () => {
    const step = nextStep({ ...base, attention: 1, ready: 2 });
    expect(step.title).toBe("1 asset needs attention");
    expect(step.actions).toEqual(["submit"]);
  });
  it("ends with the live site", () => {
    expect(nextStep({ ...base, published: 6 }).actions).toEqual(["view_site"]);
  });
});
