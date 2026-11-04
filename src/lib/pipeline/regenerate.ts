import "server-only";
import { getSource } from "@/lib/data/products";
import { db } from "@/lib/supabase/server";
import { isFinished } from "@/lib/domain/pdp";
import { createChild, newClaimGeneration, newSceneGeneration, newVideoGeneration } from "./versions";
import type { Asset } from "@/lib/domain/types";

/**
 * A top-down orbit that shows the whole pack. The camera has to see parts of the product no frame shows, so the model
 * is given the real front and back to work from. Reviewers always check video, and this is why.
 */
export function orbitPrompt(hasBack: boolean) {
  const sources = hasBack
    ? "The first reference image shows the scene with the product in place, the second shows the front of the product, and the third shows the back."
    : "The first reference image shows the scene with the product in place, and the second shows the front of the product. The back of the product is plain, in the same colour and finish, with no text.";
  return `${sources} A single continuous premium product shot with no cuts. The camera starts high above, looking down at the product from the top, then glides in one smooth orbit of about 220 degrees around it, descending gently as it travels, so the front, the side and the back each come into view. The product stays centred and perfectly still on the surface throughout. Its shape, proportions, cap, colour and finish never change, and every letter on its labels matches the reference images exactly. The surface and setting stay consistent with the scene as the camera moves. Soft natural light. No people, no hands and no added text.`;
}

export async function videoPrompt(productId: string) {
  return orbitPrompt(!!(await getSource(productId, "back")));
}

/** The channel's Lifestyle image, once it has passed its checks. Video starts from it. */
export async function readyStill(asset: Pick<Asset, "product_id" | "channel">) {
  const { data } = await db().from("assets").select("*").eq("product_id", asset.product_id).eq("channel", asset.channel).eq("shot_key", "lifestyle").eq("is_current", true).maybeSingle();
  const still = data as unknown as Asset | null;
  if (!still || !isFinished(still)) return null;
  const { data: failed } = await db().from("check_results").select("id").eq("asset_id", still.id).eq("result", "fail").limit(1);
  return failed?.length ? null : still;
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
      const still = await readyStill(asset);
      // Lifestyle may be regenerating too. The video keeps this feedback and starts once there's an image to start from.
      if (!still) return createChild(asset, { state: "draft", generationId: null, feedback, refine: { action: "regenerate" }, actor, reason: "regenerate" });
      const generation = await newVideoGeneration(asset, still, await videoPrompt(asset.product_id), feedback);
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
