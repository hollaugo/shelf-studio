import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).nullable().optional();

/** What's stored on a product. Description pages and the copy agent treat this as the source of truth. */
export const productDetailsSchema = z.object({
  brand: text(80),
  category: text(120),
  description: text(5000),
  benefits: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  ingredients: text(4000),
  directions: text(2000),
  warnings: text(2000),
  price: text(40),
  gtin: text(40),
  attributes: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) })).max(20).optional(),
});
export type ProductDetails = z.infer<typeof productDetailsSchema>;

/** What a model pulls out of an uploaded file. Everything is required but nullable, so nothing has to be guessed. */
export const extractedInfoSchema = z.object({
  name: z.string().nullable().describe("The product's full name"),
  size: z.string().nullable().describe("Net contents, e.g. '400 mL / 13.5 fl oz'"),
  claims: z.array(z.string()).describe("Marketing or performance claims, word for word. Empty if none"),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string().nullable().describe("The product description, word for word"),
  benefits: z.array(z.string()).describe("Features or benefits, one each, word for word. Empty if none"),
  ingredients: z.string().nullable().describe("The ingredient list, word for word"),
  directions: z.string().nullable().describe("How to use it, word for word"),
  warnings: z.string().nullable().describe("Warnings or cautions, word for word"),
  price: z.string().nullable().describe("The price with its currency, as written"),
  gtin: z.string().nullable().describe("GTIN, UPC or EAN"),
  attributes: z.array(z.object({ label: z.string(), value: z.string() })).describe("Any other stated specifications, e.g. hair type or country of origin"),
});
export type ExtractedInfo = z.infer<typeof extractedInfoSchema>;

export const hasDetails = (d: ProductDetails | null | undefined) => !!d && Object.values(d).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));

const DETAIL_KEYS = ["brand", "category", "description", "benefits", "ingredients", "directions", "warnings", "price", "gtin", "attributes"] as const;

/** New values win, but a blank in the file never wipes something already entered. */
export function mergeDetails(current: ProductDetails, info: ExtractedInfo): ProductDetails {
  const merged: ProductDetails = { ...current };
  for (const key of DETAIL_KEYS) {
    const value = info[key];
    if (Array.isArray(value) ? value.length : value) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}
