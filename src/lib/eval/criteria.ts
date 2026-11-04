export type EvalKind = "image" | "video";

/** What a person scores, per kind. The overall score drives the leaderboard. */
export const CRITERIA: Record<EvalKind, { key: string; label: string; hint: string }[]> = {
  image: [
    { key: "realism", label: "Realism", hint: "Would it pass as a photograph?" },
    { key: "composition", label: "Composition", hint: "Is there natural room for the product?" },
    { key: "brand", label: "Brand fit", hint: "Does it follow the style guide?" },
    { key: "integration", label: "Product fit", hint: "Does the real pack look like it belongs there?" },
  ],
  video: [
    { key: "label", label: "Label integrity", hint: "Does the text stay legible and unchanged?" },
    { key: "stability", label: "Product stability", hint: "Does the product hold its shape and stay in frame?" },
    { key: "motion", label: "Motion quality", hint: "Is the movement natural and did it follow the prompt?" },
    { key: "brand", label: "Brand fit", hint: "Does it feel like VERDA?" },
  ],
};

export const ISSUE_TAGS: Record<EvalKind, string[]> = {
  image: ["Invented objects", "Text or logos in scene", "Visible patch or artifact", "Lighting mismatch", "Shadow looks wrong", "Bottle looks pasted on", "Wrong scale", "Off brand", "Too busy", "Plastic look", "Publish-ready"],
  video: ["Label smears", "Product morphs", "Camera drifts", "Product leaves frame", "Flicker", "Unnatural motion", "Ignored the prompt", "Off brand", "Publish-ready"],
};

export const CATEGORY_LABEL: Record<string, string> = {
  pipeline: "Real pipeline", core: "Core", setting: "Settings", lighting: "Lighting", studio: "Studio", format: "Format", camera: "Camera", environment: "Environment", stress: "Stress tests", earlier: "Earlier comparisons", custom: "Your prompts",
};
