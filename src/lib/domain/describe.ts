import type { Asset, CheckResult, Generation, ShotMode } from "./types";
import { failurePolicy } from "./failures";
import { summarizeChecks } from "./status";
import { sceneCredits, videoModel } from "@/lib/runway/model-registry";

export type StepStatus = "done" | "active" | "wait" | "fail" | "todo";
export type ThumbKind = "empty" | "skeleton" | "generating" | "compositing" | "image" | "checking" | "blocked" | "dimmed" | "locked" | "failed" | "video" | "copy";
export type ChipTone = "neutral" | "plain" | "info" | "warn" | "danger" | "ok" | "solid";

export type CardView = {
  chip: { label: string; tone: ChipTone; spin?: boolean };
  thumb: ThumbKind;
  steps: string[];
  statuses: StepStatus[];
  stepLabel: string;
  status: string;
  statusTone: "muted" | "info" | "warn" | "danger" | "ok";
  dots?: { done: number; total: number; warn: number; fail: number };
  failure?: { title: string; code: string | null };
  readyToSubmit?: boolean;
  blocked?: boolean;
  canGenerate?: boolean;
  canRefine?: boolean;
  canRegenerate?: boolean;
};

const STEPS: Record<ShotMode, string[]> = {
  generated: ["Generate", "Composite", "Check", "Review", "Publish"],
  deterministic: ["Render", "Check", "Review", "Publish"],
  image_to_video: ["Generate", "Check", "Review", "Publish"],
  agent_copy: ["Write", "Check", "Review", "Publish"],
};

function bars(steps: string[], current: string, status: StepStatus) {
  const i = steps.indexOf(current);
  return steps.map((_, n) => (n < i ? "done" : n === i ? status : "todo")) as StepStatus[];
}

/** Everything an asset card shows, from its data. Keeping this pure means every state can be tested. */
export function describeAsset(asset: Pick<Asset, "state" | "shot_key" | "failure_code" | "failure_message" | "feedback" | "checks_done_at">, mode: ShotMode, generation: Pick<Generation, "status" | "runway_status" | "model" | "attempt" | "error_code"> | null, checks: CheckResult[], sourceApproved: boolean): CardView {
  const steps = STEPS[mode];
  const [first, second] = steps;
  const checkStep = "Check";
  const c = summarizeChecks(checks);
  const checkLine = c.fail ? `${c.fail} check${c.fail > 1 ? "s" : ""} failed` : c.warn ? `${c.pass} of ${c.total} checks · ${c.warn} for reviewer` : `${c.total} of ${c.total} checks passed`;
  const base = { steps };

  switch (asset.state) {
    case "draft":
      if (mode === "image_to_video" && !sourceApproved)
        return { ...base, chip: { label: "Locked", tone: "neutral" }, thumb: "locked", statuses: bars(steps, first, "todo"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "Starts when Lifestyle is approved", statusTone: "muted" };
      return { ...base, chip: { label: "Not started", tone: "neutral" }, thumb: mode === "agent_copy" ? "copy" : "empty", statuses: bars(steps, first, "todo"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: mode === "image_to_video" ? "Generates from the approved still" : mode === "agent_copy" ? "Writes channel-specific, validated copy" : "", statusTone: "muted", canGenerate: true };
    case "generating": {
      if (mode === "agent_copy")
        return { ...base, chip: { label: "Writing", tone: "info", spin: true }, thumb: "copy", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "The agent is writing this listing", statusTone: "info" };
      const rs = generation?.runway_status;
      if (rs === "RETRYING")
        return { ...base, chip: { label: "Retrying", tone: "warn", spin: true }, thumb: "generating", statuses: bars(steps, first, "wait"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: `Attempt ${(generation?.attempt ?? 0) + 1} · ${generation?.error_code ?? "Runway error"}`, statusTone: "warn" };
      if (!generation || generation.status === "queued" || rs === "THROTTLED" || rs === "RATE_LIMITED")
        return { ...base, chip: { label: "Queued", tone: "info" }, thumb: "skeleton", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: rs === "RATE_LIMITED" ? "Runway is at capacity · waiting for a slot" : "Waiting for a slot", statusTone: "muted" };
      if (rs === "PREPARING")
        return { ...base, chip: { label: "Generating", tone: "info", spin: true }, thumb: "generating", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "The agent is writing the prompt", statusTone: "info" };
      return { ...base, chip: { label: "Generating", tone: "info", spin: true }, thumb: "generating", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: `${generation.model} · est. ${mode === "image_to_video" ? videoModel(generation.model)?.credits ?? 60 : sceneCredits(generation.model)} credits`, statusTone: "info" };
    }
    case "compositing":
      if (mode === "deterministic")
        return { ...base, chip: { label: "Rendering", tone: "info", spin: true }, thumb: "skeleton", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "No generation · 0 credits", statusTone: "info" };
      return { ...base, chip: { label: "Compositing", tone: "info", spin: true }, thumb: "compositing", statuses: bars(steps, second, "active"), stepLabel: `Step 2 of ${steps.length} · ${second}`, status: "Placing the real packshot", statusTone: "info" };
    case "checking": {
      const n = steps.indexOf(checkStep) + 1;
      if (!asset.checks_done_at)
        return { ...base, chip: { label: "Checking", tone: "info", spin: true }, thumb: mode === "agent_copy" ? "copy" : "checking", statuses: bars(steps, checkStep, "active"), stepLabel: `Step ${n} of ${steps.length} · ${checkStep}`, status: "Running pre-compliance checks", statusTone: "info" };
      if (c.blocked)
        return { ...base, chip: { label: "Checks failed", tone: "danger" }, thumb: mode === "agent_copy" ? "copy" : "blocked", statuses: bars(steps, checkStep, "fail"), stepLabel: `Step ${n} of ${steps.length} · Stopped at Check`, status: checkLine, statusTone: "danger", dots: { done: c.total, total: c.total, warn: c.warn, fail: c.fail }, blocked: true, canRefine: true, canRegenerate: true };
      return { ...base, chip: { label: "Ready to submit", tone: "plain" }, thumb: mode === "agent_copy" ? "copy" : "image", statuses: bars(steps, "Review", "todo"), stepLabel: `Step ${n} of ${steps.length} · Check complete`, status: checkLine, statusTone: c.warn ? "warn" : "ok", dots: { done: c.total, total: c.total, warn: c.warn, fail: 0 }, readyToSubmit: true, canRefine: true, canRegenerate: true };
    }
    case "needs_review":
      return { ...base, chip: { label: "In review", tone: "warn" }, thumb: mode === "agent_copy" ? "copy" : "image", statuses: bars(steps, "Review", "wait"), stepLabel: `Step ${steps.indexOf("Review") + 1} of ${steps.length} · Review`, status: mode === "image_to_video" ? "Video: always human-reviewed" : checkLine, statusTone: "warn", canRefine: true, canRegenerate: true };
    case "approved":
      return { ...base, chip: { label: "Approved", tone: "ok" }, thumb: mode === "agent_copy" ? "copy" : "image", statuses: bars(steps, "Publish", "todo"), stepLabel: `Step ${steps.length} of ${steps.length} · Publish`, status: checkLine, statusTone: c.warn ? "warn" : "ok", canRefine: true, canRegenerate: true };
    case "published":
      return { ...base, chip: { label: "Published", tone: "solid" }, thumb: mode === "agent_copy" ? "copy" : "image", statuses: steps.map(() => "done"), stepLabel: "Pipeline complete", status: "Live on the website", statusTone: "ok" };
    case "rejected":
      return { ...base, chip: { label: "Rejected", tone: "danger" }, thumb: mode === "agent_copy" ? "copy" : "dimmed", statuses: bars(steps, "Review", "fail"), stepLabel: "Back with the producer", status: asset.feedback ?? "Rejected by the reviewer", statusTone: "danger", canRefine: true, canRegenerate: true };
    case "failed": {
      const p = failurePolicy(asset.failure_code);
      return { ...base, chip: { label: asset.failure_code === "CREDIT_CAP" ? "Stopped" : "Failed", tone: "danger" }, thumb: "failed", statuses: bars(steps, first, "fail"), stepLabel: `Stopped at step 1 of ${steps.length} · ${first}`, status: asset.failure_message ?? p.message, statusTone: "danger", failure: { title: p.title, code: asset.failure_code }, canRefine: asset.shot_key === "lifestyle" || asset.shot_key === "in_use", canRegenerate: p.canRegenerate };
    }
  }
}
