import type { AssetState, CheckResult } from "./types";

export type CoverageStatus = "not_started" | "queued" | "generating" | "in_progress" | "needs_rework" | "in_review" | "partially_approved" | "ready" | "published";

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  not_started: "Not started", queued: "Queued", generating: "Generating", in_progress: "In progress", needs_rework: "Needs rework",
  in_review: "In review", partially_approved: "Partially approved", ready: "Ready", published: "Published",
};

type Lite = { state: AssetState; queued?: boolean; blocked?: boolean };

/** Channel status from its assets. Work in flight wins, then problems, then review, then outcomes. */
export function coverageStatus(assets: Lite[]): CoverageStatus {
  if (assets.length === 0 || assets.every((a) => a.state === "draft")) return "not_started";
  if (assets.some((a) => ["generating", "compositing"].includes(a.state) && !a.queued)) return "generating";
  if (assets.some((a) => a.state === "generating")) return "queued";
  if (assets.some((a) => a.state === "failed" || a.state === "rejected" || a.blocked)) return "needs_rework";
  if (assets.some((a) => a.state === "needs_review")) return "in_review";
  // Locked video and copy that hasn't been written yet shouldn't hold a channel back from Ready.
  const started = assets.filter((a) => a.state !== "draft");
  if (started.every((a) => a.state === "published")) return "published";
  if (started.every((a) => a.state === "approved" || a.state === "published")) return "ready";
  if (started.some((a) => a.state === "approved" || a.state === "published")) return "partially_approved";
  return "in_progress";
}

export function summarizeChecks(results: CheckResult[]) {
  const pass = results.filter((r) => r === "pass").length;
  const warn = results.filter((r) => r === "warn").length;
  const fail = results.filter((r) => r === "fail").length;
  return { total: results.length, pass, warn, fail, blocked: fail > 0 };
}
