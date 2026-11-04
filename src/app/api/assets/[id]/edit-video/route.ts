import { z } from "zod";
import { createChild, getAsset, newVideoEdit } from "@/lib/pipeline/versions";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

const body = z.object({ direction: z.string().trim().min(3, "Describe the edit.").max(500, "Keep the edit under 500 characters.") });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "refine")) return Response.json({ error: "Only producers and owners can edit video." }, { status: 403 });
  const { id } = await params;
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const asset = await getAsset(id);
  if (!asset || asset.shot_key !== "video" || !asset.storage_path) return Response.json({ error: "Only a finished video can be edited." }, { status: 400 });
  try {
    const generation = await newVideoEdit(asset, parsed.data.direction);
    const child = await createChild(asset, { state: "generating", generationId: generation.id, refine: { action: "edit_video", direction: parsed.data.direction }, actor: role, reason: "edit_video" });
    return Response.json({ asset: child });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't start the edit." }, { status: 409 });
  }
}
