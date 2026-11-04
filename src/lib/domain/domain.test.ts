import { describe, expect, it } from "vitest";
import { afterGeneration, assertTransition, canTransition, firstWorkingState, IllegalTransitionError } from "./state-machine";
import { coverageStatus, summarizeChecks } from "./status";
import { backoffMs, failurePolicy } from "./failures";
import { can } from "./permissions";
import { describeAsset } from "./describe";
import { imageModel, ratioFor, sceneCredits } from "@/lib/runway/model-registry";

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

describe("asset card view", () => {
  const asset = { state: "draft", shot_key: "lifestyle", failure_code: null, failure_message: null, feedback: null, checks_done_at: null } as const;
  const gen = (runway_status: string, status: "queued" | "running" = "running") => ({ status, runway_status, model: "gemini_image3.1_flash", attempt: 1, error_code: "INTERNAL" });
  it("locks video until its still is approved", () => {
    expect(describeAsset({ ...asset, shot_key: "video" }, "image_to_video", null, [], false).chip.label).toBe("Locked");
    expect(describeAsset({ ...asset, shot_key: "video" }, "image_to_video", null, [], true).canGenerate).toBe(true);
  });
  it("shows Runway throttling and rate limits as queued, not as errors", () => {
    for (const s of ["THROTTLED", "RATE_LIMITED"]) expect(describeAsset({ ...asset, state: "generating" }, "generated", gen(s), [], false).chip.label).toBe("Queued");
    expect(describeAsset({ ...asset, state: "generating" }, "generated", gen("RETRYING"), [], false).chip.label).toBe("Retrying");
  });
  it("keeps a failed check from being submitted", () => {
    const done = { ...asset, state: "checking" as const, checks_done_at: "now" };
    expect(describeAsset(done, "generated", null, ["pass", "warn"], false).readyToSubmit).toBe(true);
    expect(describeAsset(done, "generated", null, ["pass", "fail"], false).readyToSubmit).toBeUndefined();
    expect(describeAsset(done, "generated", null, ["pass", "fail"], false).blocked).toBe(true);
  });
  it("gives deterministic shots their own steps", () => {
    expect(describeAsset({ ...asset, state: "compositing", shot_key: "hero" }, "deterministic", null, [], false).steps[0]).toBe("Render");
  });
  it("only offers Regenerate when a retry can work", () => {
    expect(describeAsset({ ...asset, state: "failed", failure_code: "SAFETY.INPUT.TEXT" }, "generated", null, [], false).canRegenerate).toBe(false);
    expect(describeAsset({ ...asset, state: "failed", failure_code: "INTERNAL" }, "generated", null, [], false).canRegenerate).toBe(true);
  });
});

describe("model registry", () => {
  it("maps a spec ratio to each model's own ratio string", () => {
    const sunburst = imageModel("gpt_image_2_5_sunburst")!;
    expect(ratioFor(sunburst, "2048:2048")).toBe("2560:2560");
    expect(ratioFor(sunburst, "2752:1536")).toBe("2560:1440");
    expect(ratioFor(imageModel("seedream5_pro")!, "2752:1536")).toBe("2720:1530");
  });
  it("estimates from the model in the shot list", () => {
    expect(sceneCredits("gemini_image3_pro")).toBe(20);
    expect(sceneCredits(null)).toBe(11);
  });
});
