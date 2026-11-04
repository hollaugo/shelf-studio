import { z } from "zod";
import { getPdp } from "@/lib/data/pdps";
import { can } from "@/lib/domain/permissions";
import { SHOT_ORDER, type ShotKey } from "@/lib/domain/types";
import { approvePdp, requestChanges } from "@/lib/pipeline/pdp";
import { getRole } from "@/lib/role";

export const maxDuration = 120;

const flag = z.object({ shot_key: z.enum(SHOT_ORDER as [ShotKey, ...ShotKey[]]), note: z.string().trim().min(1, "Say what should change on each flagged item.").max(1000) });
const body = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), confirmedWarnings: z.boolean().default(false) }),
  z.object({ decision: z.literal("changes"), flags: z.array(flag).min(1, "Flag at least one item.").max(SHOT_ORDER.length) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "review")) return Response.json({ error: "Only reviewers can decide on a PDP." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const pdp = await getPdp((await params).id);
  if (!pdp) return Response.json({ error: "PDP not found." }, { status: 404 });
  try {
    if (parsed.data.decision === "approve") await approvePdp(pdp, role, parsed.data.confirmedWarnings);
    else await requestChanges(pdp, role, parsed.data.flags);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't record that decision." }, { status: 409 });
  }
}
