export type EvalKind = "image" | "text_image" | "video" | "copy" | "analysis" | "cutout";

export const KINDS: { key: EvalKind; label: string }[] = [
  { key: "image", label: "Images" },
  { key: "text_image", label: "Text in image" },
  { key: "video", label: "Video" },
  { key: "copy", label: "Copy" },
  { key: "analysis", label: "Analysis" },
  { key: "cutout", label: "Cutouts" },
];
export const kindLabel = (kind: EvalKind) => KINDS.find((k) => k.key === kind)?.label ?? kind;

/** Tasks that run on Claude, with no Runway generation behind them. */
export const isClaudeKind = (kind: EvalKind) => kind === "copy" || kind === "analysis";
/** Results read as text rather than as a picture. */
export const isTextResult = isClaudeKind;

/** What a person scores, per kind. The overall score drives the leaderboard. */
export const CRITERIA: Record<EvalKind, { key: string; label: string; hint: string }[]> = {
  image: [
    { key: "realism", label: "Realism", hint: "Would it pass as a photograph?" },
    { key: "composition", label: "Composition", hint: "Is there natural room for the product?" },
    { key: "brand", label: "Brand fit", hint: "Does it follow the style guide?" },
    { key: "integration", label: "Product fit", hint: "Does the real pack look like it belongs there?" },
  ],
  text_image: [
    { key: "wording", label: "Wording", hint: "Is every word spelled exactly as requested?" },
    { key: "legibility", label: "Legibility", hint: "Can you read it at a glance, at shelf size?" },
    { key: "typography", label: "Typography", hint: "Is it clean, even and close to the brand font?" },
    { key: "layout", label: "Layout", hint: "Does the text sit well, clear of the pack?" },
  ],
  video: [
    { key: "label", label: "Label integrity", hint: "Does the text stay legible and unchanged?" },
    { key: "stability", label: "Product stability", hint: "Does the product hold its shape and stay in frame?" },
    { key: "motion", label: "Motion quality", hint: "Is the movement natural and did it follow the prompt?" },
    { key: "brand", label: "Brand fit", hint: "Does it feel like VERDA?" },
  ],
  copy: [
    { key: "accuracy", label: "Accuracy", hint: "Does it stick to the approved facts?" },
    { key: "channel", label: "Channel fit", hint: "Does it read right for this retailer?" },
    { key: "voice", label: "Brand voice", hint: "Does it sound like VERDA talking to a shopper?" },
    { key: "search", label: "Search", hint: "Would it be found and quoted, by search and by AI answers?" },
  ],
  analysis: [
    { key: "accuracy", label: "Accuracy", hint: "Is everything it reports actually in the image?" },
    { key: "text", label: "Text capture", hint: "Is on-pack text complete and verbatim?" },
    { key: "problems", label: "Problem spotting", hint: "Did it notice what's wrong with this image?" },
    { key: "scenes", label: "Scene ideas", hint: "Would these suggestions make good prompts?" },
  ],
  cutout: [
    { key: "edges", label: "Edges", hint: "Are the edges clean, with no fringe or jaggies?" },
    { key: "complete", label: "Completeness", hint: "Is the whole product there, including the cap?" },
    { key: "background", label: "Background", hint: "Is everything else gone, including the shadow?" },
  ],
};

export const READY_TAGS = ["Publish-ready", "Ready to use"];

export const ISSUE_TAGS: Record<EvalKind, string[]> = {
  image: ["Invented objects", "Text or logos in scene", "Visible patch or artifact", "Lighting mismatch", "Shadow looks wrong", "Bottle looks pasted on", "Wrong scale", "Off brand", "Too busy", "Plastic look", "Publish-ready"],
  text_image: ["Misspelled", "Garbled letters", "Missing text", "Extra text", "Wrong font", "Uneven lettering", "Hard to read", "Text behind pack", "Off brand", "Publish-ready"],
  video: ["Label smears", "Product morphs", "Camera drifts", "Product leaves frame", "Flicker", "Unnatural motion", "Ignored the prompt", "Off brand", "Publish-ready"],
  copy: ["Invented claim", "Reads like an audit", "Keyword stuffed", "Repetitive", "Generic", "Wrong tone", "Ignored the feedback", "Took the bad instruction", "Publish-ready"],
  analysis: ["Misread text", "Missed text", "Invented detail", "Wrong colours", "Missed a problem", "False alarm", "Weak scene ideas", "Ready to use"],
  cutout: ["Jagged edge", "Colour fringe", "Cap cut off", "Holes in product", "Background left in", "Shadow included", "Wrong object", "Ready to use"],
};

export const CATEGORY_LABEL: Record<string, string> = {
  pipeline: "Real pipeline", in_use: "In use", core: "Core", setting: "Settings", lighting: "Lighting", studio: "Studio", format: "Format", camera: "Camera", environment: "Environment", stress: "Stress tests", earlier: "Earlier comparisons", custom: "Your prompts", channel: "Channels", revision: "Revisions", source: "Source images",
};
