import type { AssetState, ShotMode } from "./types";

const TRANSITIONS: Record<AssetState, AssetState[]> = {
  draft: ["generating", "compositing"],
  generating: ["compositing", "checking", "failed"],
  compositing: ["checking", "failed"],
  checking: ["needs_review", "failed"],
  needs_review: ["approved", "rejected"],
  approved: ["published"],
  published: [],
  failed: ["generating", "compositing"],
  rejected: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: AssetState, to: AssetState) {
    super(`Illegal asset transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: AssetState, to: AssetState) {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AssetState, to: AssetState) {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/** The first working state for a shot. Deterministic shots skip Runway entirely. */
export function firstWorkingState(mode: ShotMode): AssetState {
  return mode === "deterministic" ? "compositing" : "generating";
}

/** Video needs no composite: its approved source still already has the real product. */
export function afterGeneration(mode: ShotMode): AssetState {
  return mode === "generated" ? "compositing" : "checking";
}

export const WORKING_STATES: AssetState[] = ["generating", "compositing"];

/** Refining or regenerating makes a child version. Anything not published can be refined. */
export function canCreateChild(state: AssetState) {
  return ["checking", "needs_review", "approved", "failed", "rejected"].includes(state);
}
