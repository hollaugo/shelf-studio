import { randomUUID } from "node:crypto";
import { publicUrl } from "@/lib/supabase/server";
import { getSource, saveSource } from "@/lib/data/products";
import { getFile, putFile } from "@/lib/storage";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import { applyMask, generateMask } from "@/lib/pipeline/cutout";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can cut out products." }, { status: 403 });
  const { id } = await params;
  const front = await getSource(id, "front");
  if (!front) return Response.json({ error: "Upload an image first." }, { status: 404 });
  try {
    const source = await getFile("sources", front.storage_path);
    const result = await applyMask(source, await generateMask(source));
    const suffix = randomUUID();
    const [maskPath, cutoutPath] = await Promise.all([
      putFile("sources", `${id}/mask-${suffix}.png`, result.mask, "image/png"),
      putFile("sources", `${id}/cutout-${suffix}.png`, result.cutout, "image/png"),
    ]);
    await Promise.all([saveSource(id, "mask", maskPath, 1024, 1024), saveSource(id, "cutout", cutoutPath, result.width, result.height)]);
    await logEvent({ entity: "product", entity_id: id, type: "cutout_created", credits: 7, detail: { coverage: result.coverage } });
    return Response.json({ cutoutUrl: publicUrl("sources", cutoutPath), credits: 7 });
  } catch (error) {
    console.error("Cutout failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't cut out the product." }, { status: 502 });
  }
}
