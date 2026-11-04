import { getSource } from "@/lib/data/products";
import { getFile } from "@/lib/storage";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import { createCutout } from "@/lib/pipeline/prepare";
import { CUTOUT_CREDITS } from "@/lib/runway/model-registry";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can cut out products." }, { status: 403 });
  const { id } = await params;
  const front = await getSource(id, "front");
  if (!front) return Response.json({ error: "Upload an image first." }, { status: 404 });
  try {
    const source = await getFile("sources", front.storage_path);
    return Response.json({ cutoutUrl: await createCutout(id, source), credits: CUTOUT_CREDITS });
  } catch (error) {
    console.error("Cutout failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't cut out the product." }, { status: 502 });
  }
}
