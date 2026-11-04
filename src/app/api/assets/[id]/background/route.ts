import { z } from "zod";
import { createChild, getAsset, newSceneGeneration } from "@/lib/pipeline/versions";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

const body = z.object({ direction: z.string().trim().min(3, "Describe the background.").max(500) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "refine")) return Response.json({ error: "Only producers and owners can refine assets." }, { status: 403 });
  const { id } = await params;
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const asset = await getAsset(id);
  if (!asset || !["lifestyle", "in_use"].includes(asset.shot_key)) return Response.json({ error: "Only Lifestyle and In-use images have a background to change." }, { status: 400 });
  try {
    const generation = await newSceneGeneration(asset, { direction: parsed.data.direction });
    const child = await createChild(asset, { state: "generating", generationId: generation.id, overlay: null, refine: { action: "change_background", direction: parsed.data.direction }, actor: role, reason: "change_background" });
    return Response.json({ asset: child });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't start the new version." }, { status: 409 });
  }
}
