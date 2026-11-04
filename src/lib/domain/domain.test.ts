import { describe, expect, it } from "vitest";
import { afterGeneration, assertTransition, canTransition, firstWorkingState, IllegalTransitionError } from "./state-machine";
import { coverageStatus, summarizeChecks } from "./status";
import { backoffMs, failurePolicy } from "./failures";
import { can } from "./permissions";
import { describeAsset } from "./describe";
import { imageModel, ratioFor, sceneCredits } from "@/lib/runway/model-registry";

describe("state machine", () => {
  it("allows the normal path", () => {
    for (const [a, b] of [["draft", "generating"], ["generating", "compositing"], ["compositing", "checking"], ["checking", "failed"], ["failed", "generating"]] as const)
      expect(canTransition(a, b)).toBe(true);
  });
  it("throws on an illegal transition", () => {
    expect(() => assertTransition("draft", "checking")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("checking", "needs_review")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("approved", "published")).toThrow(IllegalTransitionError);
  });
  it("sends each shot type down its own path", () => {
    expect(firstWorkingState("deterministic")).toBe("compositing");
    expect(firstWorkingState("generated")).toBe("generating");
    expect(afterGeneration("generated")).toBe("compositing");
    expect(afterGeneration("image_to_video")).toBe("checking");
  });
});

describe("coverage", () => {
  it("derives each status from the assets and PDP versions", () => {
    const draft = [{ status: "draft" as const }];
    expect(coverageStatus([], [])).toBe("not_started");
    expect(coverageStatus([{ state: "generating", queued: true }], draft)).toBe("queued");
    expect(coverageStatus([{ state: "generating" }, { state: "checking" }], draft)).toBe("generating");
    expect(coverageStatus([{ state: "failed" }], draft)).toBe("needs_rework");
    expect(coverageStatus([{ state: "checking", blocked: true }], draft)).toBe("needs_rework");
    expect(coverageStatus([{ state: "checking" }], draft)).toBe("draft");
    expect(coverageStatus([{ state: "checking" }], [{ status: "in_review" }])).toBe("in_review");
    expect(coverageStatus([{ state: "checking" }], [{ status: "approved" }, { status: "live" }])).toBe("approved");
    expect(coverageStatus([{ state: "checking" }], [{ status: "live" }])).toBe("live");
    expect(coverageStatus([{ state: "checking" }], [{ status: "draft" }, { status: "live" }])).toBe("live_draft");
    expect(coverageStatus([{ state: "checking" }], [{ status: "replaced" }])).toBe("not_started");
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
  it("locks video until its still passes its checks", () => {
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

describe("a pack the model drew", () => {
  const asset = { state: "generating", shot_key: "lifestyle", failure_code: null, failure_message: null, feedback: null, checks_done_at: null } as const;
  const generation = (inputs: Record<string, unknown>, status = "running") => ({ status, runway_status: "RUNNING", model: "gpt_image_2_5_sunburst", attempt: 0, error_code: null, inputs }) as never;
  it("says the model is drawing it, and doesn't mention compositing", () => {
    const view = describeAsset(asset, "generated", generation({ modelPlaced: true }), [], false);
    expect(view.steps).toEqual(["Generate", "Finish", "Check"]);
    expect(view.status).toContain("18 credits");
  });
  it("says why it's trying again after a wrong label", () => {
    const view = describeAsset(asset, "generated", generation({ modelPlaced: true, labelRetries: 1 }, "queued"), [], false);
    expect(view.chip.label).toBe("Retrying");
    expect(view.status).toContain("attempt 2 of 3");
  });
  it("finishes the image rather than placing a packshot", () => {
    const view = describeAsset({ ...asset, state: "compositing" }, "generated", generation({ modelPlaced: true }, "done"), [], false);
    expect(view.chip.label).toBe("Finishing");
  });
  it("leaves a blended scene as it was", () => {
    const view = describeAsset({ ...asset, state: "compositing" }, "generated", generation({}, "done"), [], false);
    expect(view.chip.label).toBe("Compositing");
  });
});
