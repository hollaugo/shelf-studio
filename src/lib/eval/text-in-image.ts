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
