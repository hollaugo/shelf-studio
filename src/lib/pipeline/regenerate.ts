import "server-only";
import { db } from "@/lib/supabase/server";
import { isFinished } from "@/lib/domain/pdp";
import { createChild, newClaimGeneration, newSceneGeneration, newVideoGeneration } from "./versions";
import type { Asset } from "@/lib/domain/types";

/** The Lifestyle image is the first frame, so the model only has to move it. It doesn't have to invent a view of the pack. */
export const VIDEO_PROMPT = "One continuous shot with no cuts. The camera pushes in very slowly and smoothly toward the product, ending a little closer. The product stays perfectly still and unchanged: its shape, closure and every letter of its label stay sharp and readable throughout. Thin steam drifts slowly past behind it, any shadows on the wall sway gently, and the sunlight shifts very slightly. Nothing else moves. No people, no new objects, no text added.";

/** The channel's Lifestyle image, once it has passed its checks. Video starts from it. */
export async function readyStill(asset: Pick<Asset, "product_id" | "channel">) {
  const { data } = await db().from("assets").select("*").eq("product_id", asset.product_id).eq("channel", asset.channel).eq("shot_key", "lifestyle").eq("is_current", true).maybeSingle();
  const still = data as unknown as Asset | null;
  if (!still || !isFinished(still)) return null;
  const { data: failed } = await db().from("check_results").select("id").eq("asset_id", still.id).eq("result", "fail").limit(1);
  return failed?.length ? null : still;
}

/** A new attempt at the same shot. With feedback, the prompt writer has to address it. */
export async function regenerate(asset: Asset, { actor, feedback, composite }: { actor: string; feedback?: string | null; composite?: boolean }) {
  switch (asset.shot_key) {
    case "lifestyle":
    case "in_use": {
      const previous = asset.refine as { direction?: string } | null;
      const generation = await newSceneGeneration(asset, { direction: previous?.direction, feedback, composite });
      // A new image starts clean. Text stamped on the last one would otherwise follow it onto every attempt.
      return createChild(asset, { state: "generating", generationId: generation.id, overlay: null, feedback, refine: { action: "regenerate" }, actor, reason: feedback ? "regenerate_with_feedback" : "regenerate" });
    }
    case "video": {
      const still = await readyStill(asset);
      // Lifestyle may be regenerating too. The video keeps this feedback and starts once there's an image to start from.
      if (!still) return createChild(asset, { state: "draft", generationId: null, feedback, refine: { action: "regenerate" }, actor, reason: "regenerate" });
      const generation = await newVideoGeneration(asset, still, VIDEO_PROMPT, feedback);
      return createChild(asset, { state: "generating", generationId: generation.id, feedback, refine: { action: "regenerate" }, actor, reason: "regenerate" });
    }
    case "claim_card": {
      const generation = await newClaimGeneration(asset);
      return createChild(asset, { state: "generating", generationId: generation.id, feedback, refine: { action: "regenerate" }, actor, reason: "regenerate" });
    }
    case "copy":
      return createChild(asset, { state: "draft", generationId: null, feedback, refine: { action: "regenerate" }, actor, reason: feedback ? "regenerate_with_feedback" : "regenerate" });
    default:
      return createChild(asset, { state: "compositing", generationId: null, feedback, refine: { action: "regenerate" }, actor, reason: "regenerate" });
  }
}
