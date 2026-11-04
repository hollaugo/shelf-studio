import { z } from "zod";
import { getAsset } from "@/lib/pipeline/versions";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import { regenerate } from "@/lib/pipeline/regenerate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "refine")) return Response.json({ error: "Only producers and owners can regenerate assets." }, { status: 403 });
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
  const parsed = z.object({ feedback: z.string().trim().max(1000).optional(), composite: z.boolean().optional() }).safeParse(await req.json().catch(() => ({})));
  try {
    const child = await regenerate(asset, { actor: role, feedback: parsed.success ? parsed.data.feedback ?? null : null, composite: parsed.success && parsed.data.composite });
    return Response.json({ asset: child });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't regenerate this asset." }, { status: 409 });
  }
}
