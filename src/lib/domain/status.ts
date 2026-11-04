import type { PdpStatus } from "./pdp";
import type { AssetState, CheckResult } from "./types";

export type CoverageStatus = "not_started" | "queued" | "generating" | "draft" | "needs_rework" | "in_review" | "approved" | "live" | "live_draft";

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  not_started: "Not started", queued: "Queued", generating: "Generating", draft: "Draft", needs_rework: "Needs rework",
  in_review: "In review", approved: "Approved", live: "Live", live_draft: "Live, new draft",
};

type Lite = { state: AssetState; queued?: boolean; blocked?: boolean };

/** A channel's status from its PDP versions and current assets. Work in flight wins, then problems, then where the PDP is. */
export function coverageStatus(assets: Lite[], pdps: { status: PdpStatus }[]): CoverageStatus {
  const has = (status: PdpStatus) => pdps.some((p) => p.status === status);
  if (assets.some((a) => ["generating", "compositing"].includes(a.state) && !a.queued)) return "generating";
  if (assets.some((a) => a.state === "generating")) return "queued";
  if (has("in_review")) return "in_review";
  if (has("approved")) return "approved";
  if (has("draft")) {
    if (assets.some((a) => a.state === "failed" || a.state === "rejected" || a.blocked)) return "needs_rework";
    return has("live") ? "live_draft" : "draft";
  }
  return has("live") ? "live" : "not_started";
}

export function summarizeChecks(results: CheckResult[]) {
  const pass = results.filter((r) => r === "pass").length;
  const warn = results.filter((r) => r === "warn").length;
  const fail = results.filter((r) => r === "fail").length;
  return { total: results.length, pass, warn, fail, blocked: fail > 0 };
}
