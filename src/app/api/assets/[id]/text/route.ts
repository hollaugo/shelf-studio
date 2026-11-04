import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { baseScene, createChild, getAsset, newTextGeneration } from "@/lib/pipeline/versions";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import type { ChannelSpec } from "@/lib/domain/types";

const body = z.object({
  headline: z.string().trim().min(1, "Add some text.").max(60, "Keep the headline under 60 characters."),
  subline: z.string().trim().max(60).nullable().optional(),
  position: z.enum(["top", "center", "bottom"]),
  tone: z.enum(["dark", "light"]),
  engine: z.enum(["model", "exact"]).default("model"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "refine")) return Response.json({ error: "Only producers and owners can refine assets." }, { status: 403 });
  const { id } = await params;
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const asset = await getAsset(id);
  if (!asset?.spec_id || !["lifestyle", "in_use"].includes(asset.shot_key)) return Response.json({ error: "Text can be added to Lifestyle and In-use images." }, { status: 400 });
  const { data: spec } = await db().from("channel_specs").select("text_allowed").eq("id", asset.spec_id).single();
  if (!(spec as unknown as ChannelSpec).text_allowed) return Response.json({ error: "This channel doesn't allow text on this image." }, { status: 400 });
  try {
    const { engine, ...text } = parsed.data;
    const child = engine === "model"
      ? await createChild(asset, { state: "generating", generationId: (await newTextGeneration(asset, text)).id, overlay: null, refine: { action: "add_text", engine, ...text }, actor: role, reason: "add_text" })
      : await createChild(asset, { state: "compositing", generationId: (await baseScene(asset)).id, overlay: text, refine: { action: "add_text", engine, ...text }, actor: role, reason: "add_text" });
    return Response.json({ asset: child });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't start the new version." }, { status: 409 });
  }
}
