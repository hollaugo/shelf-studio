import { describe, expect, it } from "vitest";
import { estimateRun, summarizeModels, type AnnotationLite, type TaskLite } from "./summary";

const task = (id: string, model: string, status: TaskLite["status"] = "done", seconds: number | null = 10, credits = 10): TaskLite => ({ id, model, status, seconds, credits });
const note = (task_id: string, overall: number, scores = {}, tags: string[] = []): AnnotationLite => ({ task_id, overall, scores, tags });

describe("summarizeModels", () => {
  it("ranks by average score, with unscored models last", () => {
    const rows = summarizeModels([task("1", "a"), task("2", "b"), task("3", "c")], [note("1", 3), note("2", 5)]);
    expect(rows.map((r) => r.model)).toEqual(["b", "a", "c"]);
    expect(rows[2].overall).toBeNull();
  });
  it("averages several reviewers on one task and counts it once", () => {
    const [row] = summarizeModels([task("1", "a")], [note("1", 2), note("1", 4)]);
    expect(row.overall).toBe(3);
    expect(row.scored).toBe(1);
  });
  it("counts failures and work in flight, and leaves them out of time and cost averages", () => {
    const [row] = summarizeModels([task("1", "a", "done", 20, 8), task("2", "a", "failed", null, 0), task("3", "a", "running", 99, 0)], []);
    expect(row).toMatchObject({ tasks: 3, done: 1, failed: 1, active: 1, avgSeconds: 20, avgCredits: 8 });
  });
  it("averages each criterion and surfaces common issues", () => {
    const [row] = summarizeModels([task("1", "a"), task("2", "a")], [note("1", 4, { realism: 5 }, ["Flicker", "Publish-ready"]), note("2", 2, { realism: 3 }, ["Flicker"])]);
    expect(row.criteria.realism).toBe(4);
    expect(row.topIssues).toEqual([{ tag: "Flicker", count: 2 }]);
    expect(row.publishReady).toBe(1);
  });
});

describe("estimateRun", () => {
  it("multiplies prompts by models", () => expect(estimateRun(3, [10, 20])).toEqual({ tasks: 6, credits: 90 }));
});
