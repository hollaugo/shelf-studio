import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import { CHANNELS } from "@/lib/domain/types";

const patch = z.object({
  name: z.string().trim().min(1, "Add a product name."),
  size: z.string().trim().nullable(),
  primary_claim: z.string().trim().nullable(),
  approved_claims: z.array(z.string()),
  channels: z.array(z.enum(CHANNELS as [string, ...string[]])).min(1, "Choose at least one channel."),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can edit products." }, { status: 403 });
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const update: Record<string, unknown> = { ...parsed.data };
  // SKU sheet claims are the source of truth: an image can't change them.
  if (product.source === "sku_sheet") {
    delete update.primary_claim;
    delete update.approved_claims;
    delete update.name;
    delete update.size;
  } else {
    update.slug = `${parsed.data.name.toLowerCase().replace(/^verda\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${product.sku.slice(-4).toLowerCase()}`;
  }
  const { data, error } = await db().from("products").update(update as never).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ product: data });
}
