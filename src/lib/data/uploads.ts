import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { putFile } from "@/lib/storage";
import { db } from "@/lib/supabase/server";
import { saveSource } from "./products";

const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

type Checked = { error: string } | { buffer: Buffer; width?: number; height?: number };

/** Every uploaded packshot passes the same checks before anything is stored. */
export async function checkUpload(file: File, label = "image"): Promise<Checked> {
  if (!TYPES.includes(file.type)) return { error: `Use a JPEG, PNG or WebP ${label}.` };
  if (file.size > MAX_BYTES) return { error: `The ${label} can be up to 20 MB.` };
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const meta = await sharp(buffer).metadata();
    if ((meta.width ?? 0) < 512 || (meta.height ?? 0) < 512) return { error: `Use a ${label} at least 512 × 512 pixels.` };
    return { buffer, width: meta.width, height: meta.height };
  } catch {
    return { error: `That ${label} couldn't be read as an image.` };
  }
}

export async function savePackshot(productId: string, kind: "front" | "back", upload: { buffer: Buffer; width?: number; height?: number }) {
  const png = await sharp(upload.buffer).rotate().png().toBuffer();
  const path = await putFile("sources", `${productId}/${kind}-${randomUUID()}.png`, png, "image/png");
  await saveSource(productId, kind, path, upload.width, upload.height);
  // Drawn labels are judged against the pack's text, so a new front has to be read again.
  if (kind === "front") await db().from("products").update({ pack_text: null } as never).eq("id", productId);
  return path;
}
