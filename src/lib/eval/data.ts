import "server-only";
import { connection } from "next/server";
import { db, publicUrl } from "@/lib/supabase/server";
import { accountLimits } from "@/lib/runway/client";
import type { Generation, Product, ShotTemplate } from "@/lib/domain/types";
import type { AutoCheck } from "./auto-checks";
import type { EvalKind } from "./criteria";

export type EvalCase = { id: string; key: string; kind: EvalKind; title: string; category: string; prompt: string; shape: "square" | "wide"; look_for: string; agent_prompt: boolean; shot: string | null; sort: number; is_active: boolean; spec: Record<string, unknown> & { feedback?: string; headline?: string; subline?: string | null } };
export type EvalRun = { id: string; product_id: string; kind: EvalKind; name: string; created_by: string; est_credits: number; created_at: string };
export type Annotation = { id: string; task_id: string; author_role: string; overall: number; scores: Record<string, number>; tags: string[]; note: string | null; updated_at: string };
export type EvalTask = {
  id: string; run_id: string; case_id: string; model: string; prompt: string; kind: EvalKind; created_at: string;
  status: Generation["status"]; runwayStatus: string | null; credits: number; error: string | null; errorCode: string | null; attempt: number;
  seconds: number | null; startedAt: string | null; sceneUrl: string | null; compositeUrl: string | null; annotations: Annotation[];
  /** Still queued, running, or waiting for its image and checks to be finished. */
  pending: boolean; output: unknown; checks: AutoCheck | null; costUsd: number; inputTokens: number; outputTokens: number;
};

export async function getSuite() {
  await connection();
  const [cases, runs, tasks, notes, products, sources, shots, limits] = await Promise.all([
    db().from("eval_cases").select("*").order("sort"),
    db().from("eval_runs").select("*").order("created_at", { ascending: false }),
    db().from("eval_tasks").select("*").order("created_at", { ascending: false }).limit(2000),
    db().from("eval_annotations").select("*"),
    db().from("products").select("id,sku,name").order("sku"),
    db().from("source_assets").select("product_id").eq("kind", "cutout"),
    db().from("shot_templates").select("key,model"),
    accountLimits().catch(() => null),
  ]);
  type Row = { id: string; run_id: string; case_id: string; model: string; generation_id: string | null; prompt: string; composite_path: string | null; created_at: string; status: Generation["status"] | null; error: string | null; started_at: string | null; finished_at: string | null; output: unknown; checks: AutoCheck | null; input_tokens: number; output_tokens: number; cost_usd: number; processed_at: string | null };
  const rows = (tasks.data ?? []) as unknown as Row[];
  const genIds = rows.flatMap((t) => (t.generation_id ? [t.generation_id] : []));
  const { data: gens } = genIds.length ? await db().from("generations").select("id,kind,status,runway_status,credits,error,error_code,attempt,started_at,finished_at,output_path").in("id", genIds) : { data: [] };
  const genById = new Map(((gens ?? []) as unknown as Generation[]).map((g) => [g.id, g]));
  const annotations = (notes.data ?? []) as unknown as Annotation[];
  const runRows = (runs.data ?? []) as unknown as EvalRun[];
  const kindOfRun = new Map(runRows.map((r) => [r.id, r.kind]));
  const ready = new Set(((sources.data ?? []) as unknown as { product_id: string }[]).map((s) => s.product_id));
  const defaults = (shots.data ?? []) as unknown as Pick<ShotTemplate, "key" | "model">[];
  const secondsBetween = (start: string | null, end: string | null) => (start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000) : null);
  const evalTasks: EvalTask[] = rows.flatMap((t) => {
    const g = t.generation_id ? genById.get(t.generation_id) : undefined;
    if (t.generation_id && !g) return [];
    const kind = kindOfRun.get(t.run_id) ?? g?.kind ?? "image";
    const status = g?.status ?? t.status ?? "queued";
    const shared = { id: t.id, run_id: t.run_id, case_id: t.case_id, model: t.model, prompt: t.prompt, kind, created_at: t.created_at, status, output: t.output, checks: t.checks, costUsd: Number(t.cost_usd), inputTokens: t.input_tokens, outputTokens: t.output_tokens, annotations: annotations.filter((a) => a.task_id === t.id) };
    if (!g) return [{ ...shared, runwayStatus: null, credits: 0, error: t.error, errorCode: null, attempt: 0, startedAt: t.started_at, seconds: secondsBetween(t.started_at, t.finished_at), sceneUrl: null, compositeUrl: null, pending: status === "queued" || status === "running" }];
    return [{
      ...shared, runwayStatus: g.runway_status, credits: g.credits, error: g.error ?? t.error, errorCode: g.error_code, attempt: g.attempt, startedAt: g.started_at,
      seconds: secondsBetween(g.started_at, g.finished_at),
      sceneUrl: publicUrl("outputs", g.output_path), compositeUrl: publicUrl("outputs", t.composite_path),
      pending: status === "queued" || status === "running" || (status === "done" && g.kind === "image" && !t.processed_at),
    }];
  });
  return {
    cases: (cases.data ?? []) as unknown as EvalCase[],
    runs: runRows,
    tasks: evalTasks,
    products: ((products.data ?? []) as unknown as Pick<Product, "id" | "sku" | "name">[]).filter((p) => ready.has(p.id)),
    defaultImage: defaults.find((r) => r.key === "lifestyle")?.model ?? null,
    defaultVideo: defaults.find((r) => r.key === "video")?.model ?? null,
    creditBalance: limits?.creditBalance ?? null,
  };
}

export type Suite = Awaited<ReturnType<typeof getSuite>>;
