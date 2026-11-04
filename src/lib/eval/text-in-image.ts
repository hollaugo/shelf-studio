export type TextSpec = { headline: string; subline?: string | null; position?: "top" | "center" | "bottom"; tone?: "dark" | "light"; with_pack?: boolean };
type ProductFacts = { name: string; size: string | null; primary_claim: string | null };

/** Text can pull from the product, so a prompt never asks for a claim that hasn't been approved. */
export function fillText(template: string, product: ProductFacts) {
  const values: Record<string, string | null> = { name: product.name, size: product.size, claim: product.primary_claim };
  return template.replace(/\{(name|size|claim)\}/g, (match, key: string) => {
    const value = values[key];
    if (!value) throw new Error(`${product.name} has no ${key} for this prompt to use.`);
    return value;
  });
}

export function expectedLines(spec: TextSpec, product: ProductFacts) {
  return [spec.headline, spec.subline].filter((l): l is string => !!l).map((l) => fillText(l, product));
}

const TONE = { dark: "deep sage green (#4f6147)", light: "warm cream (#f1eddf)" };
const PLACE = { top: "in the upper third", center: "in the centre", bottom: "in the lower third" };

const packRoom = (spec: TextSpec) => (spec.with_pack === false ? "" : " Don't draw any bottle, jar or product: a real pack is added to the lower two thirds afterwards, so keep that area clear and uncluttered.");

/** The wording a model was asked to draw into this asset, or null if it has none. */
export function modelTextLines(asset: { shot_key: string; generation_id: string | null; refine: unknown }, product: ProductFacts) {
  if (asset.shot_key === "claim_card" && asset.generation_id) return [product.primary_claim ?? product.name, product.size].filter((l): l is string => !!l);
  const refine = asset.refine as { engine?: string; headline?: string; subline?: string | null } | null;
  if (refine?.engine === "model" && refine.headline) return [refine.headline, refine.subline].filter((l): l is string => !!l);
  return null;
}

export function claimCardPrompt(product: ProductFacts) {
  const [headline, subline] = [product.primary_claim ?? product.name, product.size];
  return `A flat, warm cream (#f1eddf) backdrop with soft, even studio light and a very subtle paper grain. Nothing else in the frame.

Render this text in the image, spelled exactly as written, and no other text:
Headline, large: "${headline}"${subline ? `\nSubline, much smaller, below it: "${subline}"` : ""}

Set it in a clean geometric sans serif similar to Jost, regular weight, in ${TONE.dark}, left-aligned, vertically centred, inside the right half of the frame, with a right margin of at least 6% of the width. Leave the left half completely empty: a real pack is added there afterwards. Don't draw any bottle, jar or product. No boxes, effects, logos or watermarks.`;
}

/** Adds text to a scene the producer has already chosen, so the rest of the picture has to stay as it is. */
export function addTextPrompt(text: { headline: string; subline?: string | null; position: "top" | "center" | "bottom"; tone: "dark" | "light" }) {
  return `Edit the reference image. Keep its scene, composition, lighting and colours exactly as they are, and only add this text, spelled exactly as written, and no other text:
Headline: "${text.headline}"${text.subline ? `\nSubline, smaller: "${text.subline}"` : ""}

Set it in a clean geometric sans serif similar to Jost, regular weight, in ${TONE[text.tone]}, centred ${PLACE[text.position]}, with margins of at least 6% of the width, so it looks professionally typeset over the photograph. No boxes, effects, logos or watermarks. Don't add any bottle, jar or product.`;
}

/** The scene alone, for lettering added afterwards. */
export function scenePrompt(scene: string, spec: TextSpec) {
  return `${scene} No text, lettering, logos or watermarks anywhere.${packRoom(spec)}`;
}

/** The same scene, with the model asked to draw the text itself. */
export function textPrompt(scene: string, spec: TextSpec, product: ProductFacts) {
  const [headline, subline] = expectedLines(spec, product);
  return `${scene}

Render this text in the image, spelled exactly as written, and no other text:
Headline: "${headline}"${subline ? `\nSubline, smaller: "${subline}"` : ""}

Set it in a clean geometric sans serif similar to Jost, regular weight, in ${TONE[spec.tone ?? "dark"]}, centred ${PLACE[spec.position ?? "top"]}, with margins of at least 6% of the width. No boxes, effects, logos or watermarks.${packRoom(spec)}`;
}
