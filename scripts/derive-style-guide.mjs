// Derives the prestored style guide from the brand's own images. Run once; the result is committed and editable in Settings.
import { readFileSync, writeFileSync } from "node:fs";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const dir = new URL("../supabase/seed-assets/", import.meta.url);
const image = (name) => ({ type: "file", data: readFileSync(new URL(name, dir)), mediaType: "image/webp" });

const schema = z.object({
  brandEssence: z.string().describe("One sentence on how the brand feels"),
  palette: z.array(z.object({ name: z.string(), hex: z.string(), usage: z.string() })).describe("Sampled from the images, 4 to 6 colours"),
  typography: z.object({
    display: z.object({ description: z.string(), googleFontMatch: z.string(), rules: z.array(z.string()) }),
    body: z.object({ description: z.string(), googleFontMatch: z.string(), rules: z.array(z.string()) }),
  }),
  photography: z.object({
    lighting: z.array(z.string()), settings: z.array(z.string()), materials: z.array(z.string()),
    props: z.array(z.string()), composition: z.array(z.string()), avoid: z.array(z.string()),
  }),
  textOnImage: z.array(z.string()).describe("Rules for adding text to an image, consistent with the label's typography"),
  voice: z.object({ traits: z.array(z.string()), avoid: z.array(z.string()) }),
});

const { output } = await generateText({
  model: anthropic("claude-opus-5-5"),
  output: Output.object({ schema }),
  messages: [{ role: "user", content: [
    { type: "text", text: "These are VERDA's approved images: the front packshot, back packshot and an approved lifestyle still. Derive a practical style guide a creative team and an AI image pipeline can follow. Base every rule on what you can actually see. Don't invent history, values or claims. Rules should be specific and checkable." },
    image("verda_shampoo_front_packshot.webp"), image("verda_shampoo_back_packshot.webp"), image("good_lifestyle_still.webp"),
  ] }],
});
writeFileSync(new URL("style-guide.json", dir), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
