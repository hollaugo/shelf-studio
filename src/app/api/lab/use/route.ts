import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { imageModel, videoModel } from "@/lib/runway/model-registry";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

const body = z.object({ kind: z.enum(["image", "video"]), model: z.string() });

/** The shot list is data, so switching model is one row. New generations use it. Existing assets don't change. */
export async function POST(req: Request) {
  const role = await getRole();
  if (!can(role, "edit_settings")) return Response.json({ error: "Only an owner can change the default model." }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Unknown model." }, { status: 400 });
  const { kind, model } = parsed.data;
  if (!(kind === "image" ? imageModel(model) : videoModel(model))) return Response.json({ error: "Unknown model." }, { status: 400 });
  const { error } = await db().from("shot_templates").update({ model } as never).in("key", kind === "image" ? ["lifestyle", "in_use"] : ["video"]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logEvent({ entity: "product", entity_id: "00000000-0000-0000-0000-000000000000", type: "default_model_changed", actor: role, detail: { kind, model } });
  return Response.json({ ok: true });
}
