import "server-only";
import { db } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain/types";

export async function notify(audience: Role, title: string, body: string, href: string) {
  const { error } = await db().from("notifications").insert({ audience, title, body, href } as never);
  if (error) console.error("Failed to notify", error.message);
}
