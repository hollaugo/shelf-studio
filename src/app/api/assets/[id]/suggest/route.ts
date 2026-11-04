import { z } from "zod";
import { getProduct } from "@/lib/data/products";
import { loadBrandSettings } from "@/lib/agent/copy-agent";
import { getAsset } from "@/lib/pipeline/versions";
import { suggestBackgrounds, suggestText } from "@/lib/pipeline/suggest";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

export const maxDuration = 90;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getRole(), "refine")) return Response.json({ error: "Only producers and owners can refine assets." }, { status: 403 });
  const { id } = await params;
  const parsed = z.object({ kind: z.enum(["background", "text"]) }).safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Unknown suggestion type." }, { status: 400 });
  const asset = await getAsset(id);
  const product = asset && (await getProduct(asset.product_id));
  if (!asset?.storage_path || !product) return Response.json({ error: "This asset has no image to refine yet." }, { status: 404 });
  const { styleGuide } = await loadBrandSettings();
  try {
    const options = parsed.data.kind === "background" ? await suggestBackgrounds(asset, product, styleGuide) : await suggestText(asset, product, styleGuide);
    return Response.json({ options });
  } catch (error) {
    console.error("Suggestions failed", error);
    return Response.json({ error: "The agent couldn't suggest anything just now. You can still type your own." }, { status: 502 });
  }
}
