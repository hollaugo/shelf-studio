import "server-only";
import { db } from "@/lib/supabase/server";

type EventInput = { entity: string; entity_id: string; type: string; from_state?: string | null; to_state?: string | null; actor?: string; credits?: number; tokens?: number; detail?: Record<string, unknown> };

/** Append-only. Every state change writes one row, so metrics can be derived later. */
export async function logEvent(event: EventInput) {
  const { error } = await db().from("events").insert(event as never);
  if (error) console.error("Failed to log event", event.type, error.message);
}
