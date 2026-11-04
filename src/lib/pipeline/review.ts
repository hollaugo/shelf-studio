import "server-only";
import { after } from "next/server";
import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { notify } from "@/lib/notifications";
import { summarizeChecks } from "@/lib/domain/status";
import { CHANNEL_LABEL, SHOT_LABEL, type Asset, type CheckRow, type Role } from "@/lib/domain/types";
import { createCopyAgent, loadBrandSettings, saveToAsset } from "@/lib/agent/copy-agent";
import { moveAsset } from "./tick";
import { regenerate } from "./regenerate";

export const REASONS = ["label_issue", "claim_issue", "off_brand", "spec_issue", "quality", "other"] as const;
export const REASON_LABEL: Record<(typeof REASONS)[number], string> = { label_issue: "Label issue", claim_issue: "Claim issue", off_brand: "Off brand", spec_issue: "Spec issue", quality: "Quality", other: "Other" };

const name = (a: Asset) => `${SHOT_LABEL[a.shot_key]} for ${CHANNEL_LABEL[a.channel]}`;

export async function checksFor(assetId: string) {
  const { data } = await db().from("check_results").select("*").eq("asset_id", assetId);
  return (data ?? []) as CheckRow[];
}

/** Requires finished checks and none failed. The packet is frozen by the submit event. */
export async function submitForReview(asset: Asset, actor: Role) {
  if (asset.state !== "checking" || !asset.checks_done_at) throw new Error("Checks haven't finished on this asset.");
  const checks = await checksFor(asset.id);
  if (summarizeChecks(checks.map((c) => c.result)).blocked) throw new Error("A check failed, so this can't be submitted until it's fixed.");
  await moveAsset(asset, "needs_review", { submitted_at: new Date().toISOString() }, actor);
  const product = await getProduct(asset.product_id);
  await notify("reviewer", `${name(asset)} is ready for review`, product?.name ?? "", "/review");
}

export async function approve(asset: Asset, actor: Role, confirmedWarnings: boolean) {
  if (asset.state !== "needs_review") throw new Error("This asset isn't waiting for review.");
  const warnings = (await checksFor(asset.id)).filter((c) => c.result === "warn");
  if (warnings.length && !confirmedWarnings) throw new Error("Confirm the flagged checks before approving.");
  await db().from("reviews").insert({ asset_id: asset.id, reviewer_role: actor, decision: "approve", note: warnings.length ? `Confirmed: ${warnings.map((w) => w.label).join("; ")}` : null } as never);
  await moveAsset(asset, "approved", {}, actor);
  const product = await getProduct(asset.product_id);
  await notify("producer", `${name(asset)} was approved`, asset.shot_key === "lifestyle" ? "Its video can now be generated." : "It's ready to publish.", `/products/${product?.sku}`);
}

export async function reject(asset: Asset, actor: Role, input: { reasonCode: string; note: string | null; regenerate: boolean }) {
  if (asset.state !== "needs_review") throw new Error("This asset isn't waiting for review.");
  const label = REASON_LABEL[input.reasonCode as keyof typeof REASON_LABEL] ?? input.reasonCode;
  const feedback = input.note ? `${label}: ${input.note}` : label;
  await db().from("reviews").insert({ asset_id: asset.id, reviewer_role: actor, decision: "reject", reason_code: input.reasonCode, note: input.note, regenerate: input.regenerate } as never);
  await moveAsset(asset, "rejected", { feedback }, actor, { reason: input.reasonCode });
  const product = await getProduct(asset.product_id);
  const href = `/products/${product?.sku}`;
  if (!input.regenerate) {
    await notify("producer", `${name(asset)} was rejected`, feedback, href);
    return;
  }
  const child = await regenerate({ ...asset, state: "rejected", feedback }, { actor: "agent", feedback });
  await notify("producer", `${name(asset)} was rejected and is regenerating`, feedback, href);
  if (child.shot_key === "copy") after(() => rewriteCopy(child).catch((e) => console.error("Copy rewrite failed", e)));
}

/** After a rejection there's no page streaming the agent, so it runs here with the same rules. */
async function rewriteCopy(child: Asset) {
  const product = await getProduct(child.product_id);
  if (!product) return;
  await moveAsset(child, "generating", {}, "agent");
  const { styleGuide, legalRules } = await loadBrandSettings();
  const agent = createCopyAgent({ channel: child.channel, save: saveToAsset(child.id), product, styleGuide, legalRules, feedback: child.feedback });
  await agent.generate({ prompt: "Rewrite the listing, addressing the reviewer's feedback." });
  const { data } = await db().from("assets").select("state").eq("id", child.id).single();
  if ((data as unknown as { state: string }).state === "generating") await moveAsset({ id: child.id, state: "generating" }, "failed", { failure_code: "AGENT" }, "agent");
}
