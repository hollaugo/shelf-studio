/** Judges a pack a model drew against the approved one. Pure, so that every outcome can be tested. */
export type PackBox = { left: number; top: number; right: number; bottom: number };

export const MAX_LABEL_RETRIES = 2;
const SHAPE_TOLERANCE = 0.14;
const COLOUR_TOLERANCE = 0.1;

export type PackInspection = { box: PackBox | null; lines: string[] | null; passed: boolean | null; summary: string; shapeOff: number | null; colourOff: number | null };

/** A wrong word is worth paying for another attempt, up to a limit. A read-back that didn't run isn't. */
export const shouldRetryLabel = (inspection: Pick<PackInspection, "passed">, retries: number) => inspection.passed === false && retries < MAX_LABEL_RETRIES;

/** How far the drawn pack's proportions are from the approved pack's, as a share. */
export function shapeDifference(box: PackBox, imageRatio: number, packRatio: number) {
  const height = box.bottom - box.top;
  if (height <= 0 || box.right <= box.left || packRatio <= 0) return null;
  return Math.abs(((box.right - box.left) * imageRatio) / height / packRatio - 1);
}

/** How far the colour has moved, ignoring brightness, because a scene's light is allowed to change that. */
export function colourDifference(a: number[], b: number[]) {
  const share = (c: number[]) => {
    const total = c[0] + c[1] + c[2] || 1;
    return c.map((v) => v / total);
  };
  const [x, y] = [share(a), share(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}

/** Where the pack's centre is, so that a tall video frame can be cropped around it. */
export const packCentre = (box: PackBox | null) => (box ? (box.left + box.right) / 2 : 0.5);

type Outcome = { check_key: string; label: string; result: "pass" | "warn" | "fail"; detail: { note: string } };

export function packOutcomes(inspection: PackInspection): Outcome[] {
  const text: Outcome = inspection.passed === null
    ? { check_key: "label_match", label: "Label wording matches the approved pack", result: "warn", detail: { note: `${inspection.summary} The reviewer needs to read the label by hand.` } }
    : { check_key: "label_match", label: "Label wording matches the approved pack", result: inspection.passed ? "pass" : "fail", detail: { note: inspection.passed ? "Read back from the image and compared word by word." : `${inspection.summary}. Read: ${inspection.lines?.join(" / ") || "no text"}` } };
  const off = [inspection.shapeOff != null && inspection.shapeOff > SHAPE_TOLERANCE ? `proportions are about ${Math.round(inspection.shapeOff * 100)}% off` : null, inspection.colourOff != null && inspection.colourOff > COLOUR_TOLERANCE ? "its colour has shifted" : null].filter(Boolean);
  const shape: Outcome = { check_key: "pack_shape", label: "Pack shape and colour match the approved pack", result: off.length ? "warn" : "pass", detail: { note: off.length ? `Its ${off.join(", and ")}. Compare it with the packshot.` : "Measured approximately against the packshot." } };
  const drawn: Outcome = { check_key: "model_drawn", label: "A model drew this pack", result: "warn", detail: { note: "It was made from the approved packshots, not their pixels. Check its shape, cap, colour and label closely." } };
  return [text, shape, drawn];
}
