import "server-only";
import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | undefined;

/** Server-only client. It uses the secret key, which bypasses RLS, so it must never reach the browser. */
export function db() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function publicUrl(bucket: "sources" | "outputs", path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
