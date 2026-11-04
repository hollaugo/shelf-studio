import { publicUrl } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { checkUpload, savePackshot } from "@/lib/data/uploads";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

/** Adds or replaces the back of pack, which later videos use to show the real rear label. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can upload." }, { status: 403 });
  const { id } = await params;
  if (!(await getProduct(id))) return Response.json({ error: "Product not found." }, { status: 404 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image of the back of the pack." }, { status: 400 });
  const upload = await checkUpload(file, "back image");
  if ("error" in upload) return Response.json({ error: upload.error }, { status: 400 });
  const path = await savePackshot(id, "back", upload);
  await logEvent({ entity: "product", entity_id: id, type: "source_uploaded", actor: role, detail: { kind: "back" } });
  return Response.json({ backUrl: publicUrl("sources", path) });
}
