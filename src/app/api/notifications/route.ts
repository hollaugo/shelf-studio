import { db } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";

export async function GET() {
  const role = await getRole();
  const { data } = await db().from("notifications").select("*").eq("audience", role).order("created_at", { ascending: false }).limit(15);
  return Response.json({ notifications: data ?? [] });
}

export async function POST() {
  const role = await getRole();
  await db().from("notifications").update({ read_at: new Date().toISOString() } as never).eq("audience", role).is("read_at", null);
  return Response.json({ ok: true });
}
