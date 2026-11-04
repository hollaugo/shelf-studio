import { after } from "next/server";
import { finishEvalImages } from "@/lib/eval/finish";
import { claimClaudeTasks, runClaudeTask } from "@/lib/eval/run-claude";
import { tick } from "@/lib/pipeline/tick";

export const maxDuration = 300;

/** Advances queued Runway work within its limits, finishes what's done, and starts waiting Claude tasks. */
export async function POST() {
  await tick();
  await finishEvalImages();
  const claimed = await claimClaudeTasks();
  if (claimed.length) after(() => Promise.allSettled(claimed.map(runClaudeTask)));
  return Response.json({ ok: true });
}
