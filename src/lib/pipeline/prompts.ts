import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, Output } from "ai";
import { z } from "zod";
import { agentModel, visionModel } from "@/lib/ai/models";
import type { ProductAnalysis } from "@/lib/domain/types";
import { DEFAULT_PLACEMENT, type Placement } from "./compose";

const skill = (name: string) => readFileSync(join(process.cwd(), "src/lib/agent/skills", name), "utf8");

type StyleGuide = { brandEssence?: string; photography?: Record<string, string[]> };

export async function writeScenePrompt(input: { shotBrief: string; analysis: ProductAnalysis | null; styleGuide: StyleGuide; ratio: string; model: string; direction?: string | null; feedback?: string | null }) {
  const { output, usage } = await generateText({
    model: agentModel,
    output: Output.object({ schema: z.object({ prompt: z.string().describe("The finished prompt, ready to send") }) }),
    system: skill("prompting.md"),
    prompt: `Write one ${input.model} prompt for this ${input.ratio} scene.

Shot brief: ${input.shotBrief}
${input.direction ? `Producer's direction, which takes priority: ${input.direction}` : ""}
${input.feedback ? `Reviewer's feedback on the last attempt, which must be addressed: ${input.feedback}` : ""}

What the product looks like, so the scene suits it (do not describe it in the prompt):
${JSON.stringify({ type: input.analysis?.productType, finish: input.analysis?.packaging, lighting: input.analysis?.lighting, mood: input.analysis?.brandMood, settings: input.analysis?.scenePrompting?.suggestedSettings, props: input.analysis?.scenePrompting?.compatibleProps, avoid: input.analysis?.scenePrompting?.avoid })}

Brand style guide:
${JSON.stringify({ essence: input.styleGuide.brandEssence, ...input.styleGuide.photography })}`,
  });
  return { prompt: output.prompt, tokens: usage.totalTokens ?? 0 };
}

/** Finds where the real product should stand in a generated scene. */
export async function findPlacement(scene: Buffer, mediaType: string): Promise<Placement> {
  try {
    const { output } = await generateText({
      model: visionModel,
      output: Output.object({
        schema: z.object({
          centerX: z.number().describe("Horizontal centre of the clearest spot to stand a bottle, 0 to 1 from the left"),
          baselineY: z.number().describe("Vertical position where the bottle's base touches the surface, 0 to 1 from the top. It must be on the flat top of the surface, not its front edge"),
          heightFrac: z.number().describe("Bottle height as a fraction of frame height that looks physically right here, usually 0.45 to 0.7"),
          lightFrom: z.enum(["left", "right", "top", "front"]),
        }),
      }),
      messages: [{ role: "user", content: [{ type: "text", text: "A real product bottle will be composited into this scene, standing upright. Choose where it stands: on the flat surface, clear of props, with its whole height inside the frame." }, { type: "file", data: scene, mediaType }] }],
    });
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const heightFrac = clamp(output.heightFrac, 0.35, 0.72);
    return { centerX: clamp(output.centerX, 0.2, 0.8), baselineY: clamp(output.baselineY, heightFrac + 0.04, 0.95), heightFrac, lightFrom: output.lightFrom };
  } catch (error) {
    console.error("Placement failed, using the default", error);
    return DEFAULT_PLACEMENT;
  }
}
