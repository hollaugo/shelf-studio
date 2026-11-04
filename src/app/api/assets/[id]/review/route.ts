import { z } from "zod";
import { getAsset } from "@/lib/pipeline/versions";
import { approve, reject, REASONS } from "@/lib/pipeline/review";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

const body = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), confirmedWarnings: z.boolean().default(false) }),
  z.object({ decision: z.literal("reject"), reasonCode: z.enum(REASONS), note: z.string().trim().max(1000).nullable().default(null), regenerate: z.boolean().default(true) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "review")) return Response.json({ error: "Only reviewers can approve or reject." }, { status: 403 });
  const { id } = await params;
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "A rejection needs a reason." }, { status: 400 });
  const asset = await getAsset(id);
  if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });
  try {
    if (parsed.data.decision === "approve") await approve(asset, role, parsed.data.confirmedWarnings);
    else await reject(asset, role, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't record that decision." }, { status: 409 });
  }
}
