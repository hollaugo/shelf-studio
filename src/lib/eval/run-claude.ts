import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { createCopyAgent, loadBrandSettings } from "@/lib/agent/copy-agent";
import { validateListing, type Listing } from "@/lib/agent/channel-rules";
import { ANALYSIS_PROMPT, analysisSchema } from "@/lib/pipeline/analysis-schema";
import { CHANNEL_LABEL, type Channel, type Product } from "@/lib/domain/types";
import { compareAnalysis, type AnalysisExpect, type AutoCheck } from "./auto-checks";
import { usageCost } from "./models";
import { evalSource, type SourceSpec } from "./sources";

const MAX_RUNNING = 4;
const STALE_MS = 6 * 60_000;

type ClaudeTask = { id: string; run_id: string; case_id: string; model: string };
type Outcome = { output: unknown; checks: AutoCheck; inputTokens: number; outputTokens: number };

/** Fails anything abandoned, then claims as much queued work as there's room for. */
export async function claimClaudeTasks() {
  const now = new Date().toISOString();
  await db().from("eval_tasks").update({ status: "failed", error: "This task stopped responding, so start it again.", finished_at: now } as never).eq("status", "running").lt("started_at", new Date(Date.now() - STALE_MS).toISOString());
  const { count } = await db().from("eval_tasks").select("id", { count: "exact", head: true }).eq("status", "running");
  const room = MAX_RUNNING - (count ?? 0);
  if (room <= 0) return [];
  const { data } = await db().from("eval_tasks").select("id,run_id,case_id,model").eq("status", "queued").order("created_at").limit(room);
  const claimed: ClaudeTask[] = [];
  for (const task of (data ?? []) as unknown as ClaudeTask[]) {
    const { data: won } = await db().from("eval_tasks").update({ status: "running", started_at: now } as never).eq("id", task.id).eq("status", "queued").select("id");
    if (won?.length) claimed.push(task);
  }
  return claimed;
}

async function runCopy(model: string, spec: { channel: Channel; feedback?: string; thinData?: boolean }, product: Product): Promise<Outcome> {
  const { styleGuide, legalRules } = await loadBrandSettings();
  let saved: Listing | null = null;
  const agent = createCopyAgent({
    channel: spec.channel, model: anthropic(model), styleGuide, legalRules, feedback: spec.feedback,
    product: spec.thinData ? { ...product, analysis: null, approved_claims: [], size: null, details: {} } : product,
    save: async (listing) => { saved = listing; return true; },
  });
  const result = await agent.generate({ prompt: `Write the ${CHANNEL_LABEL[spec.channel]} listing for ${product.name}.` });
  const listing = saved as Listing | null;
  if (!listing) throw new Error("The agent finished without saving a listing that passed validation.");
  const violations = validateListing(spec.channel, listing);
  const drafts = result.steps.flatMap((s) => s.toolCalls).filter((c) => c.toolName === "validate_listing").length;
  const failures = violations.filter((v) => v.severity === "fail");
  const warnings = violations.filter((v) => v.severity === "warn");
  return {
    output: { listing, violations, drafts },
    inputTokens: result.totalUsage.inputTokens ?? 0, outputTokens: result.totalUsage.outputTokens ?? 0,
    checks: {
      passed: !failures.length,
      summary: failures.length ? `${failures.length} rule failures` : `Passes ${CHANNEL_LABEL[spec.channel]} rules${drafts > 1 ? ` after ${drafts} drafts` : " first time"}`,
      items: [
        { label: `Passes ${CHANNEL_LABEL[spec.channel]} rules`, ok: !failures.length, detail: failures.map((v) => `${v.field}: ${v.detail}`).join("; ") || undefined },
        { label: "Right first time", ok: drafts <= 1, detail: `${drafts} ${drafts === 1 ? "draft" : "drafts"} validated` },
        { label: "No warnings", ok: !warnings.length, detail: warnings.map((v) => `${v.field}: ${v.detail}`).join("; ") || undefined },
      ],
    },
  };
}

async function runAnalysis(model: string, spec: SourceSpec & { expect?: AnalysisExpect }, product: Product): Promise<Outcome> {
  const image = await evalSource(product.id, spec);
  const result = await generateText({
    model: anthropic(model),
    output: Output.object({ schema: analysisSchema }),
    messages: [{ role: "user", content: [{ type: "text", text: ANALYSIS_PROMPT }, { type: "file", data: image, mediaType: "image/png" }] }],
  });
  return {
    output: result.output,
    inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0,
    checks: compareAnalysis(result.output, { name: product.name, size: product.size, claim: product.primary_claim }, spec.expect ?? {}),
  };
}

export async function runClaudeTask(task: ClaudeTask) {
  try {
    const [{ data: evalCase }, { data: run }] = await Promise.all([
      db().from("eval_cases").select("kind,spec").eq("id", task.case_id).single(),
      db().from("eval_runs").select("product_id").eq("id", task.run_id).single(),
    ]);
    const { kind, spec } = evalCase as unknown as { kind: string; spec: never };
    const product = await getProduct((run as unknown as { product_id: string }).product_id);
    if (!product) throw new Error("Product not found.");
    const outcome = kind === "copy" ? await runCopy(task.model, spec, product) : await runAnalysis(task.model, spec, product);
    await db().from("eval_tasks").update({
      status: "done", finished_at: new Date().toISOString(), output: outcome.output, checks: outcome.checks,
      input_tokens: outcome.inputTokens, output_tokens: outcome.outputTokens, cost_usd: usageCost(task.model, outcome.inputTokens, outcome.outputTokens),
    } as never).eq("id", task.id);
  } catch (error) {
    console.error("Eval task failed", task.id, error);
    await db().from("eval_tasks").update({ status: "failed", finished_at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) } as never).eq("id", task.id);
  }
}
