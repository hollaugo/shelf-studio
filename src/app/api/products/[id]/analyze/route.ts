import { after } from "next/server";
import { createTextStreamResponse, Output, streamText, toTextStream } from "ai";
import { visionModel } from "@/lib/ai/models";
import { db } from "@/lib/supabase/server";
import { getSource } from "@/lib/data/products";
import { getFile } from "@/lib/storage";
import { logEvent } from "@/lib/events";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import { ANALYSIS_PROMPT, analysisSchema } from "@/lib/pipeline/analysis-schema";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can analyse products." }, { status: 403 });
  const { id } = await params;
  const front = await getSource(id, "front");
  if (!front) return Response.json({ error: "Upload an image first." }, { status: 404 });
  const image = await getFile("sources", front.storage_path);
  await db().from("products").update({ analysis_status: "running", analysis_error: null } as never).eq("id", id);

  const result = streamText({
    model: visionModel,
    output: Output.object({ schema: analysisSchema }),
    messages: [{ role: "user", content: [{ type: "text", text: ANALYSIS_PROMPT }, { type: "file", data: image, mediaType: "image/png" }] }],
    onError: async ({ error }) => {
      await db().from("products").update({ analysis_status: "failed", analysis_error: String(error) } as never).eq("id", id);
    },
  });

  after(async () => {
    try {
      const [analysis, usage] = await Promise.all([result.output, result.usage]);
      await db().from("products").update({ analysis, analysis_status: "done" } as never).eq("id", id);
      await logEvent({ entity: "product", entity_id: id, type: "analyzed", tokens: usage.totalTokens ?? 0 });
    } catch (error) {
      await db().from("products").update({ analysis_status: "failed", analysis_error: String(error) } as never).eq("id", id);
    }
  });

  return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) });
}
