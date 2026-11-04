import { after } from "next/server";
import { moveAsset, tick } from "@/lib/pipeline/tick";
import { getAsset, newVideoGeneration } from "@/lib/pipeline/versions";
import { readyStill, VIDEO_PROMPT } from "@/lib/pipeline/regenerate";
import { db } from "@/lib/supabase/server";
import { draftFor } from "@/lib/data/pdps";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can generate video." }, { status: 403 });
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset || asset.shot_key !== "video" || asset.state !== "draft") return Response.json({ error: "This video can't be started." }, { status: 400 });
  if (!(await draftFor(asset.product_id, asset.channel))) return Response.json({ error: "Start a new version to add a video." }, { status: 409 });
  const still = await readyStill(asset);
  if (!still) return Response.json({ error: "Video starts from a Lifestyle image that has passed its checks." }, { status: 409 });
  const generation = await newVideoGeneration(asset, still, VIDEO_PROMPT, asset.feedback);
  await db().from("assets").update({ generation_id: generation.id } as never).eq("id", asset.id);
  await moveAsset(asset, "generating", {}, role);
  after(() => tick().catch((e) => console.error("Tick after video failed", e)));
  return Response.json({ ok: true });
}
