import { z } from "zod";
import { getProduct } from "@/lib/data/products";
import { can } from "@/lib/domain/permissions";
import { CHANNELS, type Channel } from "@/lib/domain/types";
import { startVersion } from "@/lib/pipeline/pdp";
import { getRole } from "@/lib/role";

const body = z.object({ productId: z.string().uuid(), channel: z.enum(CHANNELS as [Channel, ...Channel[]]) });

/** Starts a new draft from the assets in use, so that they can be changed. Nothing is generated yet. */
export async function POST(req: Request) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can start a new version." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a product and channel." }, { status: 400 });
  const product = await getProduct(parsed.data.productId);
  if (!product?.channels.includes(parsed.data.channel)) return Response.json({ error: "This product isn't sold on that channel." }, { status: 404 });
  try {
    return Response.json({ pdp: await startVersion(product.id, parsed.data.channel, role) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't start a new version." }, { status: 409 });
  }
}
