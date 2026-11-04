import { getAsset } from "@/lib/pipeline/versions";
import { submitForReview } from "@/lib/pipeline/review";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "submit")) return Response.json({ error: "Only producers and owners can submit assets." }, { status: 403 });
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
  try {
    await submitForReview(asset, role);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't submit this asset." }, { status: 409 });
  }
}
