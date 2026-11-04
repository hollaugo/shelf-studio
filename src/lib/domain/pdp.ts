import type { AssetState, Channel, CheckResult, ShotKey } from "./types";

export type PdpStatus = "draft" | "in_review" | "changes_requested" | "approved" | "live" | "replaced";

export type Pdp = {
  id: string; product_id: string; channel: Channel; version: number; status: PdpStatus; based_on: string | null; created_by: string;
  submitted_at: string | null; decided_at: string | null; live_at: string | null; created_at: string;
};

export type PdpItem = { pdp_id: string; shot_key: ShotKey; asset_id: string; flagged: boolean; flag_note: string | null };

export const PDP_LABEL: Record<PdpStatus, string> = { draft: "Draft", in_review: "In review", changes_requested: "Changes requested", approved: "Approved", live: "Live", replaced: "Replaced" };
export const PDP_TONE = { draft: "warn", in_review: "info", changes_requested: "danger", approved: "ok", live: "solid", replaced: "neutral" } as const satisfies Record<PdpStatus, string>;

const TRANSITIONS: Record<PdpStatus, PdpStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "changes_requested"],
  changes_requested: [],
  approved: ["live", "replaced"],
  live: ["replaced"],
  replaced: ["live"],
};

export const canMovePdp = (from: PdpStatus, to: PdpStatus) => TRANSITIONS[from].includes(to);

/** A channel has at most one of these at a time. */
export const isOpen = (status: PdpStatus) => status === "draft" || status === "in_review" || status === "approved";

type Candidate = { shot_key: ShotKey; state: AssetState; checks_done_at: string | null; checks: CheckResult[] };

const WORKING: AssetState[] = ["generating", "compositing"];
/** Assets approved before PDPs existed have finished too. */
const LEGACY_FINISHED: AssetState[] = ["needs_review", "approved", "published"];

export function isFinished(asset: Pick<Candidate, "state" | "checks_done_at">) {
  return LEGACY_FINISHED.includes(asset.state) || (asset.state === "checking" && !!asset.checks_done_at);
}

/** Whether a draft can go to review, and which assets it would hold. Video is optional, so one that isn't finished stays out. */
export function submission(assets: Candidate[]): { ready: true; shots: ShotKey[] } | { ready: false; problem: string } {
  if (!assets.length) return { ready: false, problem: "Generate this PDP first." };
  if (assets.some((a) => WORKING.includes(a.state) || (a.state === "checking" && !a.checks_done_at))) return { ready: false, problem: "Some assets are still being worked on." };
  const required = assets.filter((a) => a.shot_key !== "video");
  const missing = required.filter((a) => !isFinished(a));
  if (missing.length) return { ready: false, problem: `${missing.length} asset${missing.length === 1 ? " isn't" : "s aren't"} finished.` };
  const included = assets.filter(isFinished);
  if (included.some((a) => a.checks.includes("fail"))) return { ready: false, problem: "A check failed, so this can't be submitted until it's fixed." };
  return { ready: true, shots: included.map((a) => a.shot_key) };
}

/** Generating adds to a draft, or starts a channel's first version. Otherwise a person chooses to start a new version. */
export const canGenerate = (versions: { status: PdpStatus }[]) => !versions.length || versions.some((p) => p.status === "draft");

/** How an asset relates to the version this one is based on. */
export function itemNote(assetId: string, base: { assetIds: string[]; version: number } | null, version: number) {
  if (!base) return null;
  return base.assetIds.includes(assetId) ? `Same as v${base.version}` : `New in v${version}`;
}
