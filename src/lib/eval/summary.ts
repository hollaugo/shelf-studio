import { READY_TAGS } from "./criteria";

export type TaskLite = { id: string; model: string; status: "queued" | "running" | "done" | "failed"; seconds: number | null; credits: number; costUsd?: number; checkPassed?: boolean | null };
export type AnnotationLite = { task_id: string; overall: number; scores: Record<string, number>; tags: string[] };

export type ModelSummary = {
  model: string; tasks: number; done: number; failed: number; active: number; scored: number;
  overall: number | null; criteria: Record<string, number>; topIssues: { tag: string; count: number }[];
  avgSeconds: number | null; avgCredits: number | null; spent: number; publishReady: number;
  checked: number; checksPassed: number; avgCostUsd: number | null;
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** One row per model. Scored models rank by average score, then unscored ones follow. */
export function summarizeModels(tasks: TaskLite[], annotations: AnnotationLite[]): ModelSummary[] {
  const byTask = new Map<string, AnnotationLite[]>();
  for (const a of annotations) byTask.set(a.task_id, [...(byTask.get(a.task_id) ?? []), a]);
  const models = [...new Set(tasks.map((t) => t.model))];
  return models.map((model) => {
    const rows = tasks.filter((t) => t.model === model);
    const done = rows.filter((t) => t.status === "done");
    const notes = rows.flatMap((t) => byTask.get(t.id) ?? []);
    const keys = [...new Set(notes.flatMap((n) => Object.keys(n.scores)))];
    const tagCounts = new Map<string, number>();
    for (const n of notes) for (const tag of n.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    return {
      model, tasks: rows.length, done: done.length,
      failed: rows.filter((t) => t.status === "failed").length,
      active: rows.filter((t) => t.status === "queued" || t.status === "running").length,
      scored: new Set(notes.map((n) => n.task_id)).size,
      overall: mean(notes.map((n) => n.overall)),
      criteria: Object.fromEntries(keys.map((k) => [k, mean(notes.map((n) => n.scores[k]).filter((v): v is number => typeof v === "number")) ?? 0])),
      topIssues: [...tagCounts].filter(([tag]) => !READY_TAGS.includes(tag)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag, count]) => ({ tag, count })),
      publishReady: READY_TAGS.reduce((sum, tag) => sum + (tagCounts.get(tag) ?? 0), 0),
      checked: done.filter((t) => t.checkPassed === true || t.checkPassed === false).length,
      checksPassed: done.filter((t) => t.checkPassed === true).length,
      avgCostUsd: mean(done.map((t) => t.costUsd ?? 0)),
      avgSeconds: mean(done.map((t) => t.seconds).filter((v): v is number => v !== null)),
      avgCredits: mean(done.map((t) => t.credits)),
      spent: rows.reduce((sum, t) => sum + t.credits, 0),
    };
  }).sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.model.localeCompare(b.model));
}

export function estimateRun(caseCount: number, modelCredits: number[]) {
  return { tasks: caseCount * modelCredits.length, credits: Math.ceil(caseCount * modelCredits.reduce((a, b) => a + b, 0)) };
}

/** Above this, the person has to confirm the spend explicitly. */
export const CONFIRM_OVER_CREDITS = 300;
export const MAX_TASKS_PER_RUN = 120;
