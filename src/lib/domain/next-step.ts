import type { Role } from "./types";

export type StepAction = "create" | "submit" | "write_copy" | "video" | "publish" | "open_version" | "new_version" | "switch_producer" | "switch_reviewer" | "view_site";
export type NextStep = { title: string; detail: string; actions: StepAction[] };

type Input = {
  role: Role;
  channel: string;
  /** The version being worked on or decided, if any. */
  open: { status: "draft" | "in_review" | "approved"; version: number } | null;
  liveVersion: number | null;
  total: number;
  working: number;
  attention: number;
  submittable: boolean;
  copyDraft: boolean;
  videoReady: boolean;
  canGenerateMore: boolean;
};

const plural = (n: number, word = "asset") => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The one thing to do next on this channel's PDP, in words, with the buttons that do it. Roles decide who can act, so it says so. */
export function nextStep(i: Input): NextStep {
  const makes = i.role !== "reviewer";
  const pdp = `${i.channel} PDP`;
  if (!i.open && i.liveVersion == null)
    return makes
      ? { title: `Create the ${pdp}`, detail: "Creates the images and writes the listing from the product's data.", actions: ["create"] }
      : { title: "Nothing to review yet", detail: "A producer creates this PDP first.", actions: ["switch_producer"] };
  if (i.working > 0) return { title: `Working on ${plural(i.working)}`, detail: "Results appear here as they finish. It's safe to leave this page.", actions: [] };

  if (!i.open)
    return { title: `Version ${i.liveVersion} is live`, detail: makes ? "Start a new version to change anything. This one stays live until a new one replaces it." : "A producer starts any new version.", actions: makes ? ["new_version", "view_site"] : ["view_site"] };

  const v = `Version ${i.open.version}`;
  if (i.open.status === "in_review")
    return makes
      ? { title: `${v} is with the reviewer`, detail: "It can't change while it's in review.", actions: ["switch_reviewer", "open_version"] }
      : { title: `${v} is waiting for your decision`, detail: "Review it as one page, and flag anything that needs work.", actions: ["open_version"] };
  if (i.open.status === "approved")
    return makes
      ? { title: `${v} is approved`, detail: "Publishing makes the whole version live together.", actions: ["open_version"] }
      : { title: `${v} is approved`, detail: "A producer publishes it.", actions: ["switch_producer"] };

  if (!makes) return { title: "Nothing waiting for review", detail: "The next step is a producer's.", actions: ["switch_producer"] };
  const actions: StepAction[] = [];
  if (i.canGenerateMore) actions.push("create");
  if (i.submittable) actions.push("submit");
  if (i.copyDraft) actions.push("write_copy");
  if (i.videoReady) actions.push("video");
  if (i.attention) return { title: `${plural(i.attention)} need${i.attention === 1 ? "s" : ""} attention`, detail: "A check failed or a generation stopped. Fix it on the card to submit this version.", actions: actions.filter((a) => a !== "submit") };
  if (actions[0] === "create") return { title: `Finish generating ${v}`, detail: "Some shots haven't been started.", actions };
  if (actions[0] === "submit") return { title: "Ready to submit for review", detail: `All checks have finished and none failed. A reviewer will see this as one page.${i.liveVersion != null ? ` Version ${i.liveVersion} stays live until a new version replaces it.` : ""}`, actions };
  if (actions[0] === "write_copy") return { title: "Write the listing", detail: "The agent writes copy from approved product data and validates it against this channel's rules.", actions };
  return { title: `${v} is a draft`, detail: "Change anything you need. Video is optional.", actions };
}
