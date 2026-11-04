/** What can be measured about a result without a person: wording, facts and mask quality. */
export type AutoCheck = { passed: boolean; summary: string; items: { label: string; ok: boolean; detail?: string }[] };

const norm = (s: string) => s.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[•∙‧]/g, "·").replace(/\s+/g, " ").trim().toLowerCase();
const bareWords = (s: string) => norm(s).split(" ").map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);

function levenshtein(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** How close the nearest stretch of read text is to the requested line, from 0 to 1. */
function closest(line: string, read: string) {
  const size = line.split(" ").length;
  const words = read.split(" ");
  let best = 0;
  for (let i = 0; i < Math.max(1, words.length - size + 1); i++) {
    const piece = words.slice(i, i + size).join(" ");
    best = Math.max(best, 1 - levenshtein(line, piece) / Math.max(line.length, piece.length, 1));
  }
  return best;
}

/** Case is ignored, since all-caps can be a styling choice. Spelling, numbers and punctuation aren't. */
export function compareText(expected: string[], read: string[]): AutoCheck {
  const all = norm(read.join(" "));
  const items: AutoCheck["items"] = expected.map((line) => {
    const wanted = norm(line);
    if (all.includes(wanted)) return { label: `"${line}"`, ok: true };
    const score = closest(wanted, all);
    return { label: `"${line}"`, ok: false, detail: score > 0 ? `Not exact. Nearest match is ${Math.round(score * 100)}% similar` : "Not found" };
  });
  const allowed = new Set(expected.flatMap(bareWords));
  const extras = [...new Set(bareWords(read.join(" ")).filter((w) => !allowed.has(w)))];
  items.push({ label: "No extra text", ok: !extras.length, detail: extras.length ? extras.slice(0, 12).join(", ") : undefined });
  const correct = expected.length ? items.slice(0, expected.length).filter((i) => i.ok).length : 0;
  const passed = items.every((i) => i.ok);
  return { passed, summary: passed ? "Wording is exact" : `${correct} of ${expected.length} lines exact${extras.length ? ", with extra text" : ""}`, items };
}

export type AnalysisExpect = { name?: boolean; size?: boolean; claim?: boolean; imageType?: string; minText?: number; flagsIssue?: boolean };
type AnalysisFacts = { name: string; size: string | null; claim: string | null };
type AnalysisOutput = { productName: string | null; size: string | null; visibleText: string[]; claimsOnPack: string[]; imageType: string; issues: string[] };

const overlaps = (a: string, b: string) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));

export function compareAnalysis(output: AnalysisOutput, facts: AnalysisFacts, expect: AnalysisExpect): AutoCheck {
  const items: AutoCheck["items"] = [];
  const onPack = [...output.visibleText, ...output.claimsOnPack, output.productName ?? ""].join(" ");
  if (expect.name) items.push({ label: "Read the product name", ok: bareWords(facts.name).every((w) => bareWords(onPack).includes(w)), detail: output.productName ?? "Not reported" });
  if (expect.size && facts.size) items.push({ label: "Read the size", ok: !!output.size && overlaps(output.size, facts.size), detail: output.size ?? "Not reported" });
  if (expect.claim && facts.claim) items.push({ label: "Found the primary claim", ok: norm(onPack).includes(norm(facts.claim)), detail: facts.claim });
  if (expect.imageType) items.push({ label: "Identified the image type", ok: output.imageType === expect.imageType, detail: output.imageType });
  if (expect.minText) items.push({ label: `Read at least ${expect.minText} lines of text`, ok: output.visibleText.length >= expect.minText, detail: `${output.visibleText.length} lines` });
  if (expect.flagsIssue) items.push({ label: "Flagged the problem with this image", ok: output.issues.length > 0, detail: output.issues[0] ?? "No issue reported" });
  const correct = items.filter((i) => i.ok).length;
  return { passed: correct === items.length, summary: `${correct} of ${items.length} facts correct`, items };
}

/** Both buffers hold one greyscale byte per pixel, at the same size. */
export function maskMetrics(mask: Uint8Array, reference?: Uint8Array) {
  let white = 0, pure = 0, both = 0, either = 0;
  for (let i = 0; i < mask.length; i++) {
    const on = mask[i] > 127;
    if (on) white++;
    if (mask[i] < 16 || mask[i] > 239) pure++;
    if (reference) {
      const ref = reference[i] > 127;
      if (on && ref) both++;
      if (on || ref) either++;
    }
  }
  return { coverage: white / mask.length, purity: pure / mask.length, agreement: reference ? (either ? both / either : 0) : null };
}

export const MIN_PURITY = 0.97;
export const MIN_AGREEMENT = 0.95;

export function cutoutCheck(m: ReturnType<typeof maskMetrics>): AutoCheck {
  const items: AutoCheck["items"] = [
    { label: "Mask is a plausible size", ok: m.coverage >= 0.02 && m.coverage <= 0.9, detail: `Covers ${Math.round(m.coverage * 100)}% of the image` },
    { label: "Mask is pure black and white", ok: m.purity >= MIN_PURITY, detail: `${(m.purity * 100).toFixed(1)}% of pixels` },
  ];
  if (m.agreement !== null) items.push({ label: "Agrees with the mask in use today", ok: m.agreement >= MIN_AGREEMENT, detail: `${(m.agreement * 100).toFixed(1)}% overlap` });
  const passed = items.every((i) => i.ok);
  return { passed, summary: passed ? "Mask looks sound" : items.find((i) => !i.ok)!.label.replace(/^Mask is/, "Mask isn't").replace(/^Agrees/, "Disagrees"), items };
}
