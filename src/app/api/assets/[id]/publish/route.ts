import { z } from "zod";
import { getAsset } from "@/lib/pipeline/versions";
import { publishToWebsite } from "@/lib/pipeline/publish";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

const body = z.object({ target: z.literal("website") });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "publish")) return Response.json({ error: "Only producers and owners can publish." }, { status: 403 });
  const { id } = await params;
  if (!body.safeParse(await req.json()).success) return Response.json({ error: "That destination isn't connected yet." }, { status: 400 });
  const asset = await getAsset(id);
  if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
  try {
    return Response.json(await publishToWebsite(asset, role));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't publish this asset." }, { status: 409 });
  }
}
