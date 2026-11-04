import "server-only";
import sharp from "sharp";
import { db } from "@/lib/supabase/server";
import { getFile } from "@/lib/storage";
import type { Asset, ChannelSpec, CheckResult, Product } from "@/lib/domain/types";

export type CheckOutcome = { check_key: string; label: string; result: CheckResult; detail: { note?: string; [k: string]: unknown } };

export async function deterministicChecks(asset: Asset, spec: ChannelSpec, product: Product, file: Buffer | null): Promise<CheckOutcome[]> {
  const out: CheckOutcome[] = [];
  if (file && spec.format !== "mp4") {
    const meta = await sharp(file).metadata();
    const sizeMb = file.length / 1024 / 1024;
    const okSize = meta.width === spec.width && meta.height === spec.height;
    const okFormat = meta.format === (spec.format === "jpg" ? "jpeg" : spec.format);
    const okWeight = !spec.max_mb || sizeMb <= spec.max_mb;
    out.push({
      check_key: "spec",
      label: `${spec.width} × ${spec.height}, ${spec.format.toUpperCase()}${spec.max_mb ? `, under ${spec.max_mb} MB` : ""}`,
      result: okSize && okFormat && okWeight ? "pass" : "fail",
      detail: { note: `${meta.width} × ${meta.height}, ${meta.format}, ${sizeMb.toFixed(2)} MB` },
    });
    if (spec.white_bg) {
      const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const w = info.width, h = info.height;
      let border = 0, off = 0;
      const pure = (x: number, y: number) => { const i = (y * w + x) * 3; return data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250; };
      for (let x = 0; x < w; x += 2) { border += 2; if (!pure(x, 0)) off++; if (!pure(x, h - 1)) off++; }
      for (let y = 0; y < h; y += 2) { border += 2; if (!pure(0, y)) off++; if (!pure(w - 1, y)) off++; }
      out.push({ check_key: "white_bg", label: "Pure white background", result: off / border < 0.01 ? "pass" : "fail", detail: { note: `${off} of ${border} edge samples aren't white` } });
      if (spec.min_fill) {
        let minX = w, maxX = 0, minY = h, maxY = 0;
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (!pure(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        const fill = Math.max((maxX - minX) / w, (maxY - minY) / h);
        out.push({ check_key: "fill", label: `Product fills at least ${Math.round(spec.min_fill * 100)}% of the frame`, result: fill >= spec.min_fill ? "pass" : "fail", detail: { note: `${Math.round(fill * 100)}% on its longest side` } });
      }
    }
  }
  out.push({ check_key: "alt_text", label: "Alt text and file name present", result: asset.alt_text && asset.storage_path ? "pass" : "fail", detail: {} });
  if (asset.shot_key !== "hero" && asset.shot_key !== "video" && product.approved_claims.length === 0)
    out.push({ check_key: "claim_data", label: "Product has an approved claim", result: "warn", detail: { note: "No approved claim is on file for this product." } });
  return out;
}

export async function saveChecks(assetId: string, outcomes: CheckOutcome[]) {
  await db().from("check_results").delete().eq("asset_id", assetId);
  const { error } = await db().from("check_results").insert(outcomes.map((o) => ({ ...o, asset_id: assetId })) as never);
  if (error) throw new Error(error.message);
}

/** Runs every check that applies and records the packet. Vision review plugs in here. */
export async function runChecks(asset: Asset, spec: ChannelSpec, product: Product) {
  const file = asset.storage_path && spec.format !== "text" ? await getFile("outputs", asset.storage_path) : null;
  const outcomes = await deterministicChecks(asset, spec, product, file);
  await saveChecks(asset.id, outcomes);
  return outcomes;
}
