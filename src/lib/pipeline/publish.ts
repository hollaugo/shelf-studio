import "server-only";
import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { notify } from "@/lib/notifications";
import { CHANNEL_LABEL, SHOT_LABEL, type Asset, type Role } from "@/lib/domain/types";
import { moveAsset } from "./tick";

/** Approved only. Records what went where and when. Marketplace and Salsify connectors can plug in beside this. */
export async function publishToWebsite(asset: Asset, actor: Role) {
  if (asset.state !== "approved") throw new Error("Only approved assets can be published.");
  const product = await getProduct(asset.product_id);
  if (!product) throw new Error("Product not found.");
  const url = `/verda/${product.slug}`;
  if (!(await moveAsset(asset, "published", {}, actor, { target: "website" }))) throw new Error("This asset has already changed. Refresh and try again.");
  const { error } = await db().from("publications").insert({ asset_id: asset.id, channel: asset.channel, target: "website", url, published_by: actor } as never);
  if (error) throw new Error(error.message);
  await notify("owner", `${SHOT_LABEL[asset.shot_key]} for ${CHANNEL_LABEL[asset.channel]} is live`, product.name, url);
  return { url };
}
