import "server-only";
import { db } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events";
import { moveAsset } from "@/lib/pipeline/tick";
import type { Asset, Product } from "@/lib/domain/types";
import { createCopyAgent, loadBrandSettings, saveToAsset } from "./copy-agent";

/** Writes a listing without a browser attached, so copy arrives with the images. Any failure leaves a retry on the card. */
export async function writeCopy(asset: Asset, product: Product, prompt: string) {
  const fail = (message: string) => moveAsset({ id: asset.id, state: "generating" }, "failed", { failure_code: "AGENT", failure_message: message }, "agent");
  try {
    if (asset.state !== "generating" && !(await moveAsset(asset, "generating", {}, "agent"))) return;
    const { styleGuide, legalRules } = await loadBrandSettings();
    const agent = createCopyAgent({ channel: asset.channel, save: saveToAsset(asset.id), product, styleGuide, legalRules, feedback: asset.feedback });
    await agent.generate({ prompt });
    const { data } = await db().from("assets").select("state").eq("id", asset.id).single();
    if ((data as unknown as { state: string }).state === "generating") await fail("The agent didn't produce a valid listing. Try again.");
    await logEvent({ entity: "asset", entity_id: asset.id, type: "copy_written", actor: "agent" });
  } catch (error) {
    console.error("Copy writing failed", asset.id, error);
    await fail("The agent couldn't finish this listing. Try again.").catch(() => undefined);
  }
}
