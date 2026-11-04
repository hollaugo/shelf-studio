import { getPdp } from "@/lib/data/pdps";
import { can } from "@/lib/domain/permissions";
import { restorePdp } from "@/lib/pipeline/pdp";
import { getRole } from "@/lib/role";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "publish")) return Response.json({ error: "Only producers and owners can restore a PDP." }, { status: 403 });
  const pdp = await getPdp((await params).id);
  if (!pdp) return Response.json({ error: "PDP not found." }, { status: 404 });
  try {
    return Response.json(await restorePdp(pdp, role));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't restore a PDP." }, { status: 409 });
  }
}
