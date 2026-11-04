import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

const legal = z.array(z.object({ id: z.string().min(1), rule: z.string().trim().min(3), severity: z.enum(["fail", "warn"]) })).max(50);
const body = z.discriminatedUnion("key", [
  z.object({ key: z.literal("legal_rules"), value: legal }),
  z.object({ key: z.literal("style_guide"), value: z.object({ brandEssence: z.string() }).passthrough() }),
  z.object({ key: z.literal("baseline_turnaround_days"), value: z.number().min(0.1).max(365) }),
]);

export async function PUT(req: Request) {
  const role = await getRole();
  if (!can(role, "edit_settings")) return Response.json({ error: "Only an owner can change these settings." }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { error } = await db().from("settings").upsert({ key: parsed.data.key, value: parsed.data.value, updated_at: new Date().toISOString() } as never);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
