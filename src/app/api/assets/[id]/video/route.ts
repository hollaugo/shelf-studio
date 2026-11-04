import { after } from "next/server";
import { moveAsset, tick } from "@/lib/pipeline/tick";
import { getAsset, newVideoGeneration } from "@/lib/pipeline/versions";
import { approvedStill, videoPrompt } from "@/lib/pipeline/regenerate";
import { db } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can generate video." }, { status: 403 });
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset || asset.shot_key !== "video" || asset.state !== "draft") return Response.json({ error: "This video can't be started." }, { status: 400 });
  const still = await approvedStill(asset);
  if (!still) return Response.json({ error: "Video starts from an approved Lifestyle image." }, { status: 409 });
  const generation = await newVideoGeneration(asset, still, await videoPrompt(asset.product_id));
  await db().from("assets").update({ generation_id: generation.id } as never).eq("id", asset.id);
  await moveAsset(asset, "generating", {}, role);
  after(() => tick().catch((e) => console.error("Tick after video failed", e)));
  return Response.json({ ok: true });
}
