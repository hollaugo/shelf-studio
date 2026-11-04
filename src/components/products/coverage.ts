import type { CoverageStatus } from "@/lib/domain/status";
import type { Tone } from "@/components/ui";

export const COVERAGE_TONE: Record<CoverageStatus, Tone> = {
  not_started: "neutral", queued: "neutral", generating: "info", draft: "plain", needs_rework: "danger", in_review: "warn", approved: "ok", live: "solid", live_draft: "solid",
};
