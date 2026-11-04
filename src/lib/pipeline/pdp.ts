import "server-only";
import { after } from "next/server";
import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { draftFor, itemsOf, pdpsOf } from "@/lib/data/pdps";
import { writeCopy } from "@/lib/agent/write-copy";
import { logEvent } from "@/lib/events";
import { notify } from "@/lib/notifications";
import { canMovePdp, isOpen, submission, type Pdp, type PdpStatus } from "@/lib/domain/pdp";
import { CHANNEL_LABEL, SHOT_LABEL, type Asset, type Channel, type CheckRow, type Role, type ShotKey } from "@/lib/domain/types";
import { regenerate } from "./regenerate";

const label = (pdp: Pick<Pdp, "channel" | "version">) => `${CHANNEL_LABEL[pdp.channel]} PDP v${pdp.version}`;

/** Only moves from the status the caller saw, so two people acting at once can't both succeed. */
async function move(pdp: Pdp, to: PdpStatus, patch: Record<string, unknown>, actor: string) {
  if (!canMovePdp(pdp.status, to)) throw new Error(`A ${pdp.status.replace("_", " ")} PDP can't become ${to.replace("_", " ")}.`);
  const { data, error } = await db().from("pdps").update({ ...patch, status: to } as never).eq("id", pdp.id).eq("status", pdp.status).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("This PDP has already changed. Refresh and try again.");
  await logEvent({ entity: "pdp", entity_id: pdp.id, type: "pdp_status_changed", from_state: pdp.status, to_state: to, actor });
}

async function checksFor(assetIds: string[]) {
  if (!assetIds.length) return [];
  const { data } = await db().from("check_results").select("*").in("asset_id", assetIds);
  return (data ?? []) as CheckRow[];
}

/** The channel's draft, creating the next version if it has nothing open. A frozen version has to be dealt with first. */
export async function ensureDraft(productId: string, channel: Channel, actor: string, basedOn?: string) {
  const versions = await pdpsOf(productId, channel);
  const open = versions.find((p) => isOpen(p.status));
  if (open?.status === "draft") return open;
  if (open) throw new Error(`${label(open)} is ${open.status === "in_review" ? "with the reviewer" : "approved"}, so a new version can't start yet.`);
  const base = basedOn ?? versions.find((p) => p.status === "live")?.id ?? versions[0]?.id ?? null;
  const { data, error } = await db().from("pdps").insert({ product_id: productId, channel, version: (versions[0]?.version ?? 0) + 1, based_on: base, created_by: actor } as never).select("*").single();
  if (error) {
    // Someone else started it at the same moment.
    const again = await draftFor(productId, channel);
    if (again) return again;
    throw new Error(error.message);
  }
  const draft = data as unknown as Pdp;
  await logEvent({ entity: "pdp", entity_id: draft.id, type: "pdp_created", to_state: "draft", actor });
  return draft;
}

/** An approved version that hasn't gone live gives way to the new one. */
export async function startVersion(productId: string, channel: Channel, actor: string) {
  const approved = (await pdpsOf(productId, channel)).find((p) => p.status === "approved");
  if (approved) await move(approved, "replaced", {}, actor);
  return ensureDraft(productId, channel, actor);
}

export async function submitPdp(pdp: Pdp, actor: Role) {
  if (pdp.status !== "draft") throw new Error("Only a draft can be submitted.");
  const { data } = await db().from("assets").select("*").eq("product_id", pdp.product_id).eq("channel", pdp.channel).eq("is_current", true);
  const assets = (data ?? []) as unknown as Asset[];
  const checks = await checksFor(assets.map((a) => a.id));
  const result = submission(assets.map((a) => ({ ...a, checks: checks.filter((c) => c.asset_id === a.id).map((c) => c.result) })));
  if (!result.ready) throw new Error(result.problem);
  const items = assets.filter((a) => result.shots.includes(a.shot_key)).map((a) => ({ pdp_id: pdp.id, shot_key: a.shot_key, asset_id: a.id }));
  const { error } = await db().from("pdp_items").upsert(items as never, { onConflict: "pdp_id,shot_key" });
  if (error) throw new Error(error.message);
  await move(pdp, "in_review", { submitted_at: new Date().toISOString() }, actor);
  const product = await getProduct(pdp.product_id);
  await notify("reviewer", `${label(pdp)} is ready for review`, product?.name ?? "", `/pdps/${pdp.id}`);
}

export async function approvePdp(pdp: Pdp, actor: Role, confirmedWarnings: boolean) {
  if (pdp.status !== "in_review") throw new Error("This PDP isn't waiting for review.");
  const items = await itemsOf(pdp.id);
  const warnings = (await checksFor(items.map((i) => i.asset_id))).filter((c) => c.result === "warn");
  if (warnings.length && !confirmedWarnings) throw new Error("Confirm the flagged checks before approving.");
  await move(pdp, "approved", { decided_at: new Date().toISOString() }, actor);
  await db().from("reviews").insert({ pdp_id: pdp.id, reviewer_role: actor, decision: "approve", note: warnings.length ? `Confirmed ${warnings.length} flagged check${warnings.length === 1 ? "" : "s"}` : null } as never);
  const product = await getProduct(pdp.product_id);
  await notify("producer", `${label(pdp)} was approved`, product ? `${product.name} is ready to publish.` : "It's ready to publish.", `/pdps/${pdp.id}`);
}

/** Ends this version. The next one reuses everything except the flagged items, which regenerate from the reviewer's notes. */
export async function requestChanges(pdp: Pdp, actor: Role, flags: { shot_key: ShotKey; note: string }[]) {
  if (pdp.status !== "in_review") throw new Error("This PDP isn't waiting for review.");
  const items = await itemsOf(pdp.id);
  const flagged = flags.flatMap((flag) => {
    const item = items.find((i) => i.shot_key === flag.shot_key);
    return item ? [{ ...flag, assetId: item.asset_id }] : [];
  });
  if (!flagged.length) throw new Error("Flag at least one item that needs changes.");
  await move(pdp, "changes_requested", { decided_at: new Date().toISOString() }, actor);
  await Promise.all(flagged.map((f) => db().from("pdp_items").update({ flagged: true, flag_note: f.note } as never).eq("pdp_id", pdp.id).eq("shot_key", f.shot_key)));
  await db().from("reviews").insert({ pdp_id: pdp.id, reviewer_role: actor, decision: "reject", note: flagged.map((f) => `${SHOT_LABEL[f.shot_key]}: ${f.note}`).join("\n"), regenerate: true } as never);
  const draft = await ensureDraft(pdp.product_id, pdp.channel, "agent", pdp.id);
  const product = await getProduct(pdp.product_id);

  // Video goes last, because it starts from a Lifestyle image that may be regenerating too.
  const ordered = [...flagged].sort((a, b) => Number(a.shot_key === "video") - Number(b.shot_key === "video"));
  const { data: rows } = await db().from("assets").select("*").in("id", ordered.map((f) => f.assetId));
  const assets = (rows ?? []) as unknown as Asset[];
  const failed: string[] = [];
  for (const flag of ordered) {
    const asset = assets.find((a) => a.id === flag.assetId);
    if (!asset) continue;
    try {
      const child = await regenerate(asset, { actor: "agent", feedback: flag.note });
      if (child.shot_key === "copy" && product) {
        const prompt = "Rewrite the listing, addressing the reviewer's feedback.";
        after(() => writeCopy(child, product, prompt).catch((e) => console.error("Copy rewrite failed", e)));
      }
    } catch (error) {
      console.error(`Regenerating ${flag.shot_key} failed`, error);
      failed.push(SHOT_LABEL[flag.shot_key]);
    }
  }
  const body = failed.length ? `${failed.join(", ")} couldn't start, so ${failed.length === 1 ? "it needs" : "they need"} regenerating by hand.` : `Version ${draft.version} is regenerating ${flagged.length} item${flagged.length === 1 ? "" : "s"}.`;
  await notify("producer", `Changes requested on ${label(pdp)}`, body, `/products/${product?.sku ?? ""}`);
  return draft;
}

async function goLive(pdp: Pdp, actor: Role) {
  const product = await getProduct(pdp.product_id);
  if (!product) throw new Error("Product not found.");
  const current = (await pdpsOf(pdp.product_id, pdp.channel)).find((p) => p.status === "live");
  if (current) await move(current, "replaced", {}, actor);
  const url = `/verda/${product.slug}`;
  try {
    await move(pdp, "live", { live_at: new Date().toISOString() }, actor);
  } catch (error) {
    if (current) await db().from("pdps").update({ status: "live" } as never).eq("id", current.id).eq("status", "replaced");
    throw error;
  }
  const items = await itemsOf(pdp.id);
  const { error } = await db().from("publications").insert(items.map((i) => ({ pdp_id: pdp.id, asset_id: i.asset_id, channel: pdp.channel, target: "website", url, published_by: actor })) as never);
  if (error) console.error("Failed to record the publication", error.message);
  await notify("owner", `${label(pdp)} is live`, product.name, url);
  return { url, items };
}

export async function publishPdp(pdp: Pdp, actor: Role) {
  if (pdp.status !== "approved") throw new Error("Only an approved PDP can be published.");
  const { url } = await goLive(pdp, actor);
  return { url };
}

/** Puts an earlier live version back. With no draft open, it also becomes what the next version starts from. */
export async function restorePdp(pdp: Pdp, actor: Role) {
  if (pdp.status !== "replaced" || !pdp.live_at) throw new Error("Only a version that has been live can be restored.");
  const { url, items } = await goLive(pdp, actor);
  const open = (await pdpsOf(pdp.product_id, pdp.channel)).some((p) => isOpen(p.status));
  if (!open) {
    await db().from("assets").update({ is_current: false } as never).eq("product_id", pdp.product_id).eq("channel", pdp.channel).eq("is_current", true);
    await db().from("assets").update({ is_current: true } as never).in("id", items.map((i) => i.asset_id));
  }
  return { url };
}
