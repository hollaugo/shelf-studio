import { describe, expect, it } from "vitest";
import { afterGeneration, assertTransition, canTransition, firstWorkingState, IllegalTransitionError } from "./state-machine";
import { coverageStatus, summarizeChecks } from "./status";
import { backoffMs, failurePolicy } from "./failures";
import { can } from "./permissions";

describe("state machine", () => {
  it("allows the normal path", () => {
    for (const [a, b] of [["draft", "generating"], ["generating", "compositing"], ["compositing", "checking"], ["checking", "needs_review"], ["needs_review", "approved"], ["approved", "published"]] as const)
      expect(canTransition(a, b)).toBe(true);
  });
  it("throws on an illegal transition", () => {
    expect(() => assertTransition("draft", "approved")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("needs_review", "published")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("published", "draft")).toThrow(IllegalTransitionError);
  });
  it("sends each shot type down its own path", () => {
    expect(firstWorkingState("deterministic")).toBe("compositing");
    expect(firstWorkingState("generated")).toBe("generating");
    expect(afterGeneration("generated")).toBe("compositing");
    expect(afterGeneration("image_to_video")).toBe("checking");
  });
});

describe("coverage", () => {
  it("derives each status", () => {
    expect(coverageStatus([])).toBe("not_started");
    expect(coverageStatus([{ state: "generating", queued: true }])).toBe("queued");
    expect(coverageStatus([{ state: "generating" }, { state: "approved" }])).toBe("generating");
    expect(coverageStatus([{ state: "rejected" }, { state: "needs_review" }])).toBe("needs_rework");
    expect(coverageStatus([{ state: "checking", blocked: true }])).toBe("needs_rework");
    expect(coverageStatus([{ state: "needs_review" }, { state: "approved" }])).toBe("in_review");
    expect(coverageStatus([{ state: "approved" }, { state: "checking" }])).toBe("partially_approved");
    expect(coverageStatus([{ state: "approved" }, { state: "published" }])).toBe("ready");
    expect(coverageStatus([{ state: "published" }])).toBe("published");
  });
  it("blocks submission only on a failed check", () => {
    expect(summarizeChecks(["pass", "warn"]).blocked).toBe(false);
    expect(summarizeChecks(["pass", "fail"]).blocked).toBe(true);
  });
});

describe("failures", () => {
  it("never retries what a retry can't fix", () => {
    expect(failurePolicy("SAFETY.INPUT.TEXT").maxRetries).toBe(0);
    expect(failurePolicy("ASSET.INVALID").maxRetries).toBe(0);
    expect(failurePolicy("INTERNAL.BAD_OUTPUT.CODE01").maxRetries).toBe(1);
    expect(failurePolicy("THIRD_PARTY.UNAVAILABLE").maxRetries).toBeGreaterThan(0);
  });
  it("backs off within bounds", () => {
    expect(backoffMs(0, () => 0)).toBe(1000);
    expect(backoffMs(0, () => 1)).toBe(2000);
    expect(backoffMs(20, () => 1)).toBe(60000);
  });
});

describe("permissions", () => {
  it("separates producing from approving", () => {
    expect(can("producer", "review")).toBe(false);
    expect(can("reviewer", "review")).toBe(true);
    expect(can("owner", "review")).toBe(false);
    expect(can("reviewer", "publish")).toBe(false);
    expect(can("producer", "edit_settings")).toBe(false);
  });
});
