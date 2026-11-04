import sharp from "sharp";
import { db } from "@/lib/supabase/server";
import { getSource } from "@/lib/data/products";
import { getFile, putFile } from "@/lib/storage";
import { compositeProduct, DEFAULT_PLACEMENT, type Placement } from "@/lib/pipeline/compose";
import { tick } from "@/lib/pipeline/tick";
import type { Generation } from "@/lib/domain/types";

export const maxDuration = 300;
const COMPOSITES_PER_TICK = 4;

/** Advances queued work within Runway's limits, then puts the real pack onto any finished scenes. */
export async function POST() {
  await tick();
  const { data } = await db().from("eval_tasks").select("id,generation_id").is("composite_path", null).order("created_at").limit(300);
  const tasks = (data ?? []) as unknown as { id: string; generation_id: string }[];
  if (tasks.length) {
    const { data: gens } = await db().from("generations").select("*").in("id", tasks.map((t) => t.generation_id)).eq("kind", "image").eq("status", "done").limit(COMPOSITES_PER_TICK);
    await Promise.all(((gens ?? []) as unknown as Generation[]).map(async (g) => {
      const task = tasks.find((t) => t.generation_id === g.id)!;
      const source = await getSource(g.product_id, "cutout");
      if (!source) return;
      const [scene, cutout] = await Promise.all([getFile("outputs", g.output_path!), getFile("sources", source.storage_path)]);
      const pipeline = await compositeProduct(scene, cutout, 1600, g.ratio === "2752:1536" ? 893 : 1600, (g.inputs.placement as Placement) ?? DEFAULT_PLACEMENT);
      const jpeg = await sharp(await pipeline.png().toBuffer()).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
      const path = await putFile("outputs", `${g.product_id}/eval/${task.id}.jpg`, jpeg, "image/jpeg");
      await db().from("eval_tasks").update({ composite_path: path } as never).eq("id", task.id);
    }));
  }
  return Response.json({ ok: true });
}
