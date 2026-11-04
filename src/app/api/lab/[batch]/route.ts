import { db, publicUrl } from "@/lib/supabase/server";
import { getSource } from "@/lib/data/products";
import { getFile, putFile } from "@/lib/storage";
import { compositeProduct, DEFAULT_PLACEMENT, type Placement } from "@/lib/pipeline/compose";
import { tick } from "@/lib/pipeline/tick";
import type { Generation } from "@/lib/domain/types";
import sharp from "sharp";

export const maxDuration = 300;

/** Advances the pipeline and returns this comparison's results. Finished scenes get the real pack composited on. */
export async function POST(_req: Request, { params }: { params: Promise<{ batch: string }> }) {
  const { batch } = await params;
  await tick();
  const { data } = await db().from("generations").select("*").like("scene_key", `lab:${batch}:%`).order("created_at");
  const rows = (data ?? []) as unknown as Generation[];
  await Promise.all(rows.filter((g) => g.kind === "image" && g.status === "done" && !g.inputs.compositePath).map(async (g) => {
    const source = await getSource(g.product_id, "cutout");
    if (!source) return;
    const [scene, cutout] = await Promise.all([getFile("outputs", g.output_path!), getFile("sources", source.storage_path)]);
    const wide = g.ratio === "2752:1536";
    const pipeline = await compositeProduct(scene, cutout, 1600, wide ? 893 : 1600, (g.inputs.placement as Placement) ?? DEFAULT_PLACEMENT);
    const jpeg = await sharp(await pipeline.png().toBuffer()).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
    const path = await putFile("outputs", `${g.product_id}/lab/${g.id}.jpg`, jpeg, "image/jpeg");
    g.inputs = { ...g.inputs, compositePath: path };
    await db().from("generations").update({ inputs: g.inputs } as never).eq("id", g.id);
  }));
  return Response.json({
    results: rows.map((g) => ({
      id: g.id, model: g.model, kind: g.kind, status: g.status, runwayStatus: g.runway_status, prompt: g.prompt, credits: g.credits, error: g.error, errorCode: g.error_code,
      startedAt: g.started_at, finishedAt: g.finished_at,
      sceneUrl: publicUrl("outputs", g.output_path), compositeUrl: publicUrl("outputs", g.inputs.compositePath as string | undefined),
    })),
  });
}
