import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { visionModel } from "@/lib/ai/models";

/** The model reads back what's actually in the picture, and code does the comparing. */
export async function readImageText(image: Buffer) {
  const result = await generateText({
    model: visionModel,
    output: Output.object({ schema: z.object({ lines: z.array(z.string()).describe("Each line of text, exactly as drawn") }) }),
    messages: [{ role: "user", content: [{ type: "text", text: "Transcribe all text drawn in this image, letter by letter, exactly as it appears. Copy misspellings and malformed letters as they are, and don't correct or complete anything. Leave out text printed on the label of a physical bottle, jar or pack." }, { type: "file", data: image, mediaType: "image/jpeg" }] }],
  });
  return { lines: result.output.lines, inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 };
}
