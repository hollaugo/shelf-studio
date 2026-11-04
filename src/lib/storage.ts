import "server-only";
import { db } from "@/lib/supabase/server";

type Bucket = "sources" | "outputs";

export async function putFile(bucket: Bucket, path: string, body: Buffer, contentType: string) {
  const { error } = await db().storage.from(bucket).upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

export async function getFile(bucket: Bucket, path: string) {
  const { data, error } = await db().storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Storage download failed for ${path}: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
