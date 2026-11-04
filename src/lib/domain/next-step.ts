import type { Role } from "./types";

export type StepAction = "generate" | "submit" | "write_copy" | "video" | "publish" | "open_review" | "switch_producer" | "switch_reviewer" | "view_site";
export type NextStep = { title: string; detail: string; actions: StepAction[] };

type Input = { role: Role; channel: string; total: number; working: number; attention: number; ready: number; inReview: number; approved: number; published: number; copyDraft: boolean; videoReady: boolean; videoLocked: boolean; canGenerateMore: boolean };

const plural = (n: number, word = "asset") => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The one thing to do next on this channel, in words, with the buttons that do it. Roles decide who can act, so it says so. */
export function nextStep(i: Input): NextStep {
  const makes = i.role !== "reviewer";
  if (i.total === 0)
    return makes
      ? { title: `Generate ${i.channel}`, detail: "Creates the images and writes the listing. Video follows once Lifestyle is approved.", actions: ["generate"] }
      : { title: "Nothing to review yet", detail: "A producer generates this channel first.", actions: ["switch_producer"] };
  if (i.working > 0) return { title: `Working on ${plural(i.working)}`, detail: "Results appear here as they finish. It's safe to leave this page.", actions: [] };

  if (!makes) {
    if (i.inReview) return { title: `${plural(i.inReview)} waiting for your decision`, detail: "Open each report to approve or reject.", actions: ["open_review"] };
    const left = i.copyDraft || i.videoReady || i.ready > 0 || i.approved > 0 || i.attention > 0 || i.canGenerateMore;
    return left
      ? { title: "Nothing waiting for review", detail: "The next step is a producer's: writing, generating, submitting or publishing.", actions: ["switch_producer"] }
      : { title: `${i.channel} is live`, detail: "Everything here has been published.", actions: ["view_site"] };
  }

  const actions: StepAction[] = [];
  if (i.canGenerateMore) actions.push("generate");
  if (i.ready) actions.push("submit");
  if (i.copyDraft) actions.push("write_copy");
  if (i.videoReady) actions.push("video");
  if (i.approved) actions.push("publish");
  if (i.attention) return { title: `${plural(i.attention)} need${i.attention === 1 ? "s" : ""} attention`, detail: "A check failed or a generation stopped. Fix it on the Assets tab.", actions };
  if (actions[0] === "generate") return { title: `Finish generating ${i.channel}`, detail: "Some shots haven't been started.", actions };
  if (actions[0] === "submit") return { title: `Submit ${plural(i.ready)} for review`, detail: "Checks have passed, so these are ready for a reviewer.", actions };
  if (actions[0] === "write_copy") return { title: "Write the listing", detail: "The agent writes copy from approved product data and validates it against this channel's rules.", actions };
  if (actions[0] === "video") return { title: "Generate the video", detail: "Lifestyle is approved, so the video can start from it.", actions };
  if (actions[0] === "publish") return { title: `Publish ${plural(i.approved)} to the website`, detail: "These have been approved.", actions };
  if (i.inReview) return { title: `${plural(i.inReview)} in review`, detail: i.videoLocked ? "Video starts once Lifestyle is approved. Switch to Reviewer to decide." : "Switch to Reviewer to approve or reject.", actions: ["switch_reviewer"] };
  if (i.videoLocked) return { title: "Video is waiting for Lifestyle", detail: "Submit and approve the Lifestyle image to unlock it.", actions: [] };
  return { title: `${i.channel} is live`, detail: "Everything here has been published.", actions: ["view_site"] };
}
