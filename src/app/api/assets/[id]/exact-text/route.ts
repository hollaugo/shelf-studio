import { baseScene, createChild, getAsset } from "@/lib/pipeline/versions";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

/** The fallback when a model gets the wording wrong: the same text, drawn by code from the brand's own font. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "refine")) return Response.json({ error: "Only producers and owners can change text." }, { status: 403 });
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
  const refine = asset.refine as { engine?: string; headline?: string; subline?: string | null; position?: string; tone?: string } | null;
  try {
    if (asset.shot_key === "claim_card") {
      const child = await createChild(asset, { state: "compositing", generationId: null, refine: { action: "exact_lettering" }, actor: role, reason: "exact_lettering" });
      return Response.json({ asset: child });
    }
    if ((await baseScene(asset)).inputs.modelPlaced) return Response.json({ error: "A model drew this image, so regenerate it to fix its text." }, { status: 400 });
    if (refine?.engine !== "model" || !refine.headline) return Response.json({ error: "This image has no model-drawn text to replace." }, { status: 400 });
    const text = { headline: refine.headline, subline: refine.subline ?? null, position: refine.position ?? "top", tone: refine.tone ?? "dark" };
    const child = await createChild(asset, { state: "compositing", generationId: (await baseScene(asset)).id, overlay: text, refine: { action: "add_text", engine: "exact", ...text }, actor: role, reason: "exact_lettering" });
    return Response.json({ asset: child });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't start the new version." }, { status: 409 });
  }
}
