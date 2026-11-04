import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";

const draft = { status: "draft" as const, version: 2 };
const base = { role: "producer" as const, channel: "Amazon", open: draft, liveVersion: null, total: 6, working: 0, attention: 0, submittable: false, copyDraft: false, videoReady: false, canGenerateMore: false };

describe("nextStep", () => {
  it("starts with creating the PDP", () => {
    expect(nextStep({ ...base, open: null, total: 0 })).toMatchObject({ title: "Create the Amazon PDP", actions: ["create"] });
  });
  it("offers a reviewer the switch instead of hiding creation", () => {
    expect(nextStep({ ...base, role: "reviewer", open: null, total: 0 }).actions).toEqual(["switch_producer"]);
    expect(nextStep({ ...base, role: "reviewer", copyDraft: true, videoReady: true }).actions).toEqual(["switch_producer"]);
  });
  it("waits while work is running", () => {
    expect(nextStep({ ...base, working: 2, submittable: true }).actions).toEqual([]);
  });
  it("needs the listing written before anything else in a draft", () => {
    expect(nextStep({ ...base, copyDraft: true })).toMatchObject({ title: "Write the listing", actions: ["write_copy"] });
  });
  it("offers video alongside submitting, because it's optional", () => {
    expect(nextStep({ ...base, submittable: true, videoReady: true })).toMatchObject({ title: "Ready to submit for review", actions: ["submit", "video"] });
  });
  it("says the live version stays up while a draft is ready", () => {
    expect(nextStep({ ...base, submittable: true, liveVersion: 1 }).detail).toContain("Version 1 stays live");
  });
  it("won't submit past a problem", () => {
    const step = nextStep({ ...base, attention: 1, submittable: true, videoReady: true });
    expect(step.title).toBe("1 asset needs attention");
    expect(step.actions).toEqual(["video"]);
  });
  it("puts the decision with the reviewer", () => {
    const open = { status: "in_review" as const, version: 3 };
    expect(nextStep({ ...base, role: "reviewer", open })).toMatchObject({ title: "Version 3 is waiting for your decision", actions: ["open_version"] });
    expect(nextStep({ ...base, open }).actions).toEqual(["switch_reviewer", "open_version"]);
  });
  it("sends a producer to publish an approved version", () => {
    const open = { status: "approved" as const, version: 3 };
    expect(nextStep({ ...base, open }).actions).toEqual(["open_version"]);
    expect(nextStep({ ...base, role: "reviewer", open }).actions).toEqual(["switch_producer"]);
  });
  it("offers a new version once it's live", () => {
    expect(nextStep({ ...base, open: null, liveVersion: 2 })).toMatchObject({ title: "Version 2 is live", actions: ["new_version", "view_site"] });
    expect(nextStep({ ...base, role: "reviewer", open: null, liveVersion: 2 }).actions).toEqual(["view_site"]);
  });
});
