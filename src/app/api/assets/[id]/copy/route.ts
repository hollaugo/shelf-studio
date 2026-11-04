import { createAgentUIStreamResponse } from "ai";
import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { createCopyAgent, loadBrandSettings } from "@/lib/agent/copy-agent";
import { moveAsset } from "@/lib/pipeline/tick";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import type { Asset } from "@/lib/domain/types";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "run")) return Response.json({ error: "Only producers and owners can generate copy." }, { status: 403 });
  const { id } = await params;
  const { data } = await db().from("assets").select("*").eq("id", id).maybeSingle();
  const asset = data as unknown as Asset | null;
  if (!asset || asset.shot_key !== "copy") return Response.json({ error: "Copy asset not found." }, { status: 404 });
  const product = await getProduct(asset.product_id);
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
  if (asset.state !== "generating" && !(await moveAsset(asset, "generating", { failure_code: null, failure_message: null }, role)))
    return Response.json({ error: "This copy is already being written." }, { status: 409 });

  const { messages } = await req.json();
  const { styleGuide, legalRules } = await loadBrandSettings();
  const agent = createCopyAgent({ asset, product, styleGuide, legalRules, feedback: asset.feedback });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    onError: (error) => {
      console.error("Copy agent failed", error);
      return "The agent couldn't finish this listing.";
    },
    onFinish: async () => {
      const { data: after } = await db().from("assets").select("state").eq("id", id).single();
      if ((after as { state: string } | null)?.state === "generating")
        await moveAsset({ id, state: "generating" }, "failed", { failure_code: "AGENT", failure_message: "The agent didn't produce a valid listing. Try again." });
      await logEvent({ entity: "asset", entity_id: id, type: "copy_written", actor: "agent" });
    },
  });
}
