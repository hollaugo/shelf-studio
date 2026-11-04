export type FailurePolicy = {
  /** Automatic attempts allowed after the first. */
  maxRetries: number;
  title: string;
  message: string;
  canRegenerate: boolean;
};

const WAIT = { canRegenerate: true };

/** From Runway's failure codes. A retry that can't change the outcome is never attempted. */
export function failurePolicy(code: string | null | undefined): FailurePolicy {
  const c = code ?? "";
  if (c.startsWith("SAFETY.INPUT") || c === "INPUT_PREPROCESSING.SAFETY.TEXT")
    return { maxRetries: 0, title: "Blocked by a safety check", message: "The prompt or reference was flagged. Change the scene to continue.", canRegenerate: false };
  if (c === "ASSET.INVALID")
    return { maxRetries: 0, title: "Input size or ratio isn't valid", message: "Fix the input's dimensions or ratio to continue.", canRegenerate: false };
  if (c.startsWith("INTERNAL.BAD_OUTPUT"))
    return { maxRetries: 1, title: "Couldn't get a usable scene", message: "Failed after 1 retry. Try a different scene or run it again.", ...WAIT };
  if (c === "THIRD_PARTY.UNAVAILABLE")
    return { maxRetries: 3, title: "Service unavailable", message: "Nothing is wrong with this asset, so try again later.", ...WAIT };
  if (c === "CREDIT_CAP")
    return { maxRetries: 0, title: "Stopped at the credit cap", message: "This run reached its credit cap. Regenerating starts a new run.", ...WAIT };
  return { maxRetries: 3, title: "Runway returned an error", message: "Automatic retries are used up. Run it again, or change the scene.", ...WAIT };
}

/** Exponential backoff with jitter, in milliseconds. */
export function backoffMs(attempt: number, random = Math.random) {
  const base = Math.min(60_000, 2_000 * 2 ** attempt);
  return Math.round(base / 2 + random() * (base / 2));
}
