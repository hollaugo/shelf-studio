import "server-only";
import { db } from "@/lib/supabase/server";
import { createChild, newSceneGeneration, newVideoGeneration } from "./versions";
import type { Asset } from "@/lib/domain/types";

export const VIDEO_PROMPT = "Locked-off camera with no camera movement. Soft morning light shifts slowly across the scene and the leaves stir very slightly. The product stays perfectly still, in the same position, with its label sharp and unchanged.";

export async function approvedStill(asset: Pick<Asset, "product_id" | "channel">) {
  const { data } = await db().from("assets").select("*").eq("product_id", asset.product_id).eq("channel", asset.channel).eq("shot_key", "lifestyle").eq("is_current", true).in("state", ["approved", "published"]).maybeSingle();
  return data as unknown as Asset | null;
}

/** A new attempt at the same shot. With feedback, the prompt writer has to address it. */
export async function regenerate(asset: Asset, { actor, feedback }: { actor: string; feedback?: string | null }) {
  switch (asset.shot_key) {
    case "lifestyle":
    case "in_use": {
      const previous = asset.refine as { direction?: string } | null;
      const generation = await newSceneGeneration(asset, { direction: previous?.direction, feedback });
      return createChild(asset, { state: "generating", generationId: generation.id, feedback, refine: { action: "regenerate" }, actor, reason: feedback ? "regenerate_with_feedback" : "regenerate" });
    }
    case "video": {
      const still = await approvedStill(asset);
      if (!still) throw new Error("Video needs an approved Lifestyle image.");
      const generation = await newVideoGeneration(asset, still, VIDEO_PROMPT, feedback);
      return createChild(asset, { state: "generating", generationId: generation.id, feedback, refine: { action: "regenerate" }, actor, reason: "regenerate" });
    }
    case "copy":
      return createChild(asset, { state: "draft", generationId: null, feedback, refine: { action: "regenerate" }, actor, reason: feedback ? "regenerate_with_feedback" : "regenerate" });
    default:
      return createChild(asset, { state: "compositing", generationId: null, feedback, refine: { action: "regenerate" }, actor, reason: "regenerate" });
  }
}
