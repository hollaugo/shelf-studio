import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

const fields = z.object({
  kind: z.enum(["image", "text_image", "video"]),
  title: z.string().trim().min(2, "Give the prompt a title.").max(80),
  prompt: z.string().trim().min(10, "Write a prompt.").max(2000),
  look_for: z.string().trim().max(400).default(""),
  shape: z.enum(["square", "wide"]).default("square"),
  spec: z.object({ headline: z.string().trim().min(2, "Write the headline.").max(160), subline: z.string().trim().max(200).nullable().optional(), tone: z.enum(["dark", "light"]).default("dark"), position: z.enum(["top", "center", "bottom"]).default("top"), with_pack: z.boolean().default(true) }).optional(),
}).refine((c) => c.kind !== "text_image" || c.spec, { message: "Write the headline." });

/** Past tasks keep a snapshot of their prompt, so editing here only affects future runs. */
export async function POST(req: Request) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can edit prompts." }, { status: 403 });
  const parsed = fields.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { data, error } = await db().from("eval_cases").insert({ ...parsed.data, key: `custom-${randomUUID().slice(0, 8)}`, category: "custom", sort: 500 } as never).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ case: data });
}

export async function PATCH(req: Request) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can edit prompts." }, { status: 403 });
  const parsed = z.object({ id: z.string().uuid(), is_active: z.boolean().optional(), title: z.string().trim().min(2).max(80).optional(), prompt: z.string().trim().min(10).max(2000).optional(), look_for: z.string().trim().max(400).optional(), spec: z.record(z.string(), z.unknown()).optional() }).safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Check the prompt's fields." }, { status: 400 });
  const { id, ...update } = parsed.data;
  const { error } = await db().from("eval_cases").update(update as never).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
