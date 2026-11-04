import { z } from "zod";
import type { Channel } from "@/lib/domain/types";

export const listingSchema = z.object({
  title: z.string(),
  itemHighlights: z.string().optional().describe("Amazon only"),
  shortDescription: z.string().optional().describe("Walmart only"),
  bullets: z.array(z.string()),
  description: z.string(),
  searchTerms: z.string().optional().describe("Amazon only"),
  metaTitle: z.string().optional().describe("verda.com only"),
  metaDescription: z.string().optional().describe("verda.com only"),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional().describe("verda.com only"),
  altText: z.string().describe("Alt text for the product's main image"),
});
export type Listing = z.infer<typeof listingSchema>;

export type Limit = { title: number; bullets: [number, number]; bullet: number; description: number; minWords?: number; highlights?: number; shortDescription?: number; searchBytes?: number; metaTitle?: number; metaDescription?: number; faq?: [number, number] };

export const LIMITS: Record<Channel, Limit> = {
  amazon: { title: 75, bullets: [5, 5], bullet: 250, description: 2000, highlights: 125, searchBytes: 250 },
  walmart: { title: 150, bullets: [5, 7], bullet: 80, description: 4000, minWords: 150, shortDescription: 500 },
  target: { title: 150, bullets: [3, 10], bullet: 120, description: 2000 },
  verda: { title: 70, bullets: [3, 5], bullet: 140, description: 1600, metaTitle: 60, metaDescription: 155, faq: [3, 5] },
};

export type Violation = { field: string; rule: string; severity: "fail" | "warn"; detail: string };

const PROMO = /\b(best[- ]?seller|free shipping|on sale|sale price|discount|limited time|guaranteed|top[- ]rated|#\s?1|number one|money[- ]back)\b/i;
const SUPERLATIVE = /\b(the best|best in class|world'?s best|unbeatable|miracle)\b/i;
const DRUG = /\b(cure[sd]?|treat(s|ment|ing)?|heal(s|ing)?|prevent(s|ing)? (hair loss|dandruff)|regrow(s|th)?|stops? hair loss|anti[- ]dandruff|eczema|psoriasis|alopecia|fda[- ]approved|medical[- ]grade|prescription)\b/i;
const SYMBOLS = /[™®©@*]|\p{Extended_Pictographic}/u;
const SHOUTING = /\b[A-Z]{4,}\b/;
const URLS = /(https?:\/\/|www\.|\.com\b)/i;

function allText(l: Listing) {
  return [l.title, l.itemHighlights, l.shortDescription, ...l.bullets, l.description, l.metaTitle, l.metaDescription, ...(l.faq ?? []).flatMap((f) => [f.question, f.answer])].filter(Boolean).join("\n");
}

export function validateListing(channel: Channel, listing: Listing, brand = "VERDA"): Violation[] {
  const limit = LIMITS[channel];
  const v: Violation[] = [];
  const fail = (field: string, rule: string, detail: string) => v.push({ field, rule, severity: "fail", detail });
  const warn = (field: string, rule: string, detail: string) => v.push({ field, rule, severity: "warn", detail });

  if (listing.title.length > limit.title) fail("title", "length", `${listing.title.length} characters, limit ${limit.title}`);
  if (channel === "walmart" && (listing.title.length < 30 || listing.title.length > 90)) warn("title", "length", `${listing.title.length} characters. Walmart displays about 50 to 75 best`);
  if (SYMBOLS.test(listing.title)) fail("title", "symbols", "Titles can't use special characters or emoji");
  const shoutSafe = listing.title.replaceAll(brand, "");
  if (SHOUTING.test(shoutSafe)) fail("title", "caps", "No all-caps words apart from the brand name");

  const [min, max] = limit.bullets;
  if (listing.bullets.length < min || listing.bullets.length > max) fail("bullets", "count", `${listing.bullets.length} bullets, needs ${min === max ? min : `${min} to ${max}`}`);
  listing.bullets.forEach((b, i) => {
    if (b.length > limit.bullet) fail(`bullets[${i}]`, "length", `${b.length} characters, limit ${limit.bullet}`);
    if (channel === "walmart" && /[.!?]$/.test(b.trim())) warn(`bullets[${i}]`, "punctuation", "Walmart key features shouldn't end in punctuation");
  });

  if (listing.description.length > limit.description) fail("description", "length", `${listing.description.length} characters, limit ${limit.description}`);
  if (limit.minWords && listing.description.trim().split(/\s+/).length < limit.minWords) fail("description", "length", `Needs at least ${limit.minWords} words`);
  if (/<[a-z][^>]*>/i.test(listing.description)) fail("description", "html", "Descriptions must be plain text");
  if (channel !== "verda" && URLS.test(allText(listing))) fail("listing", "urls", "No URLs in marketplace copy");

  if (limit.highlights) {
    if (!listing.itemHighlights) fail("itemHighlights", "required", "Amazon listings need item highlights");
    else if (listing.itemHighlights.length > limit.highlights) fail("itemHighlights", "length", `${listing.itemHighlights.length} characters, limit ${limit.highlights}`);
  }
  if (limit.searchBytes && listing.searchTerms && new TextEncoder().encode(listing.searchTerms).length > limit.searchBytes) fail("searchTerms", "length", `${new TextEncoder().encode(listing.searchTerms).length} bytes, limit ${limit.searchBytes}`);
  if (limit.shortDescription) {
    if (!listing.shortDescription) fail("shortDescription", "required", "Walmart listings need a short description");
    else if (listing.shortDescription.length > limit.shortDescription) fail("shortDescription", "length", `${listing.shortDescription.length} characters, limit ${limit.shortDescription}`);
  }
  if (limit.metaTitle) {
    if (!listing.metaTitle) fail("metaTitle", "required", "The site needs a meta title");
    else if (listing.metaTitle.length > limit.metaTitle) fail("metaTitle", "length", `${listing.metaTitle.length} characters, limit ${limit.metaTitle}`);
  }
  if (limit.metaDescription) {
    if (!listing.metaDescription) fail("metaDescription", "required", "The site needs a meta description");
    else if (listing.metaDescription.length > limit.metaDescription) fail("metaDescription", "length", `${listing.metaDescription.length} characters, limit ${limit.metaDescription}`);
  }
  if (limit.faq) {
    const n = listing.faq?.length ?? 0;
    if (n < limit.faq[0] || n > limit.faq[1]) fail("faq", "count", `${n} questions, needs ${limit.faq[0]} to ${limit.faq[1]}`);
  }

  const text = allText(listing);
  const promo = text.match(PROMO);
  if (promo) fail("listing", "promotional", `Promotional language: "${promo[0]}"`);
  const superlative = text.match(SUPERLATIVE);
  if (superlative) fail("listing", "superlative", `Unsupported superlative: "${superlative[0]}"`);
  const drug = text.match(DRUG);
  if (drug) fail("listing", "drug_claim", `Possible drug or medical claim: "${drug[0]}"`);
  return v;
}
