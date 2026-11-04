import type { Asset, CheckResult, Generation, ShotMode } from "./types";
import { failurePolicy } from "./failures";
import { MAX_LABEL_RETRIES } from "./pack-check";
import { summarizeChecks } from "./status";
import { generationCredits, modelLabel } from "@/lib/runway/model-registry";

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
  generated: ["Generate", "Composite", "Check"],
  deterministic: ["Render", "Check"],
  image_to_video: ["Generate", "Check"],
  agent_copy: ["Write", "Check"],
};

const DRAWN_STEPS = ["Generate", "Finish", "Check"];

function bars(steps: string[], current: string, status: StepStatus) {
  const i = steps.indexOf(current);
  return steps.map((_, n) => (n < i ? "done" : n === i ? status : "todo")) as StepStatus[];
}

/** Everything an asset card shows, from its data. Keeping this pure means every state can be tested. */
export function describeAsset(asset: Pick<Asset, "state" | "shot_key" | "failure_code" | "failure_message" | "feedback" | "checks_done_at">, mode: ShotMode, generation: (Pick<Generation, "status" | "runway_status" | "model" | "attempt" | "error_code"> & { inputs?: Generation["inputs"] }) | null, checks: CheckResult[], sourceReady: boolean): CardView {
  const drawnPack = !!generation?.inputs?.modelPlaced;
  const labelRetries = Number(generation?.inputs?.labelRetries ?? 0);
  const steps = drawnPack ? DRAWN_STEPS : STEPS[mode];
  const [first, second] = steps;
  const checkStep = "Check";
  const c = summarizeChecks(checks);
  const checkLine = c.fail ? `${c.fail} check${c.fail > 1 ? "s" : ""} failed` : c.warn ? `${c.pass} of ${c.total} checks · ${c.warn} to confirm` : `${c.total} of ${c.total} checks passed`;
  const base = { steps };
  const ready = (line: string, summary: typeof c): CardView => ({ ...base, chip: { label: "Ready", tone: "plain" }, thumb: mode === "agent_copy" ? "copy" : "image", statuses: steps.map(() => "done"), stepLabel: "Checks complete", status: line, statusTone: summary.warn ? "warn" : "ok", dots: { done: summary.total, total: summary.total, warn: summary.warn, fail: 0 }, readyToSubmit: true, canRefine: true, canRegenerate: true });

  switch (asset.state) {
    case "draft":
      if (mode === "image_to_video" && !sourceReady)
        return { ...base, chip: { label: "Locked", tone: "neutral" }, thumb: "locked", statuses: bars(steps, first, "todo"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "Starts when Lifestyle passes its checks", statusTone: "muted" };
      return { ...base, chip: { label: "Not started", tone: "neutral" }, thumb: mode === "agent_copy" ? "copy" : "empty", statuses: bars(steps, first, "todo"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: mode === "image_to_video" ? "Optional. Generates from the Lifestyle image" : mode === "agent_copy" ? "Writes channel-specific, validated copy" : "", statusTone: "muted", canGenerate: true };
    case "generating": {
      if (mode === "agent_copy")
        return { ...base, chip: { label: "Writing", tone: "info", spin: true }, thumb: "copy", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "The agent is writing this listing", statusTone: "info" };
      const rs = generation?.runway_status;
      if (labelRetries && generation?.status !== "done")
        return { ...base, chip: { label: "Retrying", tone: "warn", spin: true }, thumb: "generating", statuses: bars(steps, first, "wait"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: `Label was wrong · redrawing, attempt ${labelRetries + 1} of ${MAX_LABEL_RETRIES + 1}`, statusTone: "warn" };
      if (rs === "RETRYING")
        return { ...base, chip: { label: "Retrying", tone: "warn", spin: true }, thumb: "generating", statuses: bars(steps, first, "wait"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: `Attempt ${(generation?.attempt ?? 0) + 1} · ${generation?.error_code ?? "Runway error"}`, statusTone: "warn" };
      if (!generation || generation.status === "queued" || rs === "THROTTLED" || rs === "RATE_LIMITED")
        return { ...base, chip: { label: "Queued", tone: "info" }, thumb: "skeleton", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: rs === "RATE_LIMITED" ? "Runway is at capacity · waiting for a slot" : "Waiting for a slot", statusTone: "muted" };
      if (rs === "PREPARING")
        return { ...base, chip: { label: "Generating", tone: "info", spin: true }, thumb: "generating", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "The agent is writing the prompt", statusTone: "info" };
      return { ...base, chip: { label: "Generating", tone: "info", spin: true }, thumb: "generating", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: `${modelLabel(generation.model)} · est. ${generationCredits(generation)} credits`, statusTone: "info" };
    }
    case "compositing":
      if (mode === "deterministic")
        return { ...base, chip: { label: "Rendering", tone: "info", spin: true }, thumb: "skeleton", statuses: bars(steps, first, "active"), stepLabel: `Step 1 of ${steps.length} · ${first}`, status: "No generation · 0 credits", statusTone: "info" };
      if (drawnPack)
        return { ...base, chip: { label: "Finishing", tone: "info", spin: true }, thumb: "compositing", statuses: bars(steps, second, "active"), stepLabel: `Step 2 of ${steps.length} · ${second}`, status: "Sizing the image for this channel", statusTone: "info" };
      return { ...base, chip: { label: "Compositing", tone: "info", spin: true }, thumb: "compositing", statuses: bars(steps, second, "active"), stepLabel: `Step 2 of ${steps.length} · ${second}`, status: "Placing the real packshot", statusTone: "info" };
    case "checking": {
      const n = steps.indexOf(checkStep) + 1;
      if (!asset.checks_done_at)
        return { ...base, chip: { label: "Checking", tone: "info", spin: true }, thumb: mode === "agent_copy" ? "copy" : "checking", statuses: bars(steps, checkStep, "active"), stepLabel: `Step ${n} of ${steps.length} · ${checkStep}`, status: "Running pre-compliance checks", statusTone: "info" };
      if (c.blocked)
        return { ...base, chip: { label: "Checks failed", tone: "danger" }, thumb: mode === "agent_copy" ? "copy" : "blocked", statuses: bars(steps, checkStep, "fail"), stepLabel: `Step ${n} of ${steps.length} · Stopped at Check`, status: checkLine, statusTone: "danger", dots: { done: c.total, total: c.total, warn: c.warn, fail: c.fail }, blocked: true, canRefine: true, canRegenerate: true };
      return ready(checkLine, c);
    }
    // Finished before approval moved to the PDP.
    case "needs_review":
    case "approved":
    case "published":
      return ready(checkLine, c);
    case "rejected":
      return { ...base, chip: { label: "Rejected", tone: "danger" }, thumb: mode === "agent_copy" ? "copy" : "dimmed", statuses: bars(steps, checkStep, "fail"), stepLabel: "Back with the producer", status: asset.feedback ?? "Rejected by the reviewer", statusTone: "danger", canRefine: true, canRegenerate: true };
    case "failed": {
      const p = failurePolicy(asset.failure_code);
      return { ...base, chip: { label: asset.failure_code === "CREDIT_CAP" ? "Stopped" : "Failed", tone: "danger" }, thumb: "failed", statuses: bars(steps, first, "fail"), stepLabel: `Stopped at step 1 of ${steps.length} · ${first}`, status: asset.failure_message ?? p.message, statusTone: "danger", failure: { title: p.title, code: asset.failure_code }, canRefine: asset.shot_key === "lifestyle" || asset.shot_key === "in_use", canRegenerate: p.canRegenerate };
    }
  }
}
