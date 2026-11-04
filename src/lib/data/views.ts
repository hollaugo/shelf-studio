import "server-only";
import { publicUrl } from "@/lib/supabase/server";
import { describeAsset, type CardView } from "@/lib/domain/describe";
import { isFinished } from "@/lib/domain/pdp";
import { SHOT_ORDER, type Asset, type ChannelSpec, type CheckRow, type Generation, type ShotTemplate } from "@/lib/domain/types";

export type AssetView = {
  asset: Asset;
  view: CardView;
  url: string | null;
  sceneUrl: string | null;
  meta: string;
  mode: ShotTemplate["mode"];
  note?: string | null;
  /** A model drew the pack, rather than the real one being placed. */
  drawnPack: boolean;
  labelFailed: boolean;
};

function metaLine(asset: Asset, spec: ChannelSpec | undefined, drawnPack: boolean) {
  if (asset.shot_key === "copy") return "Title, bullets, description, SEO and AEO";
  if (asset.shot_key === "video") return (asset.refine as { action?: string } | null)?.action === "edit_video" ? "5 s · 9:16 · edited with Aleph" : "5 s · 9:16 · from Lifestyle";
  const size = spec ? `${spec.width} × ${spec.height}` : "";
  if (asset.shot_key === "hero") return `${size} · pure white`;
  if (asset.shot_key === "claim_card") return `${size} · ${drawnPack ? "model-drawn" : `${asset.generation_id ? "text by GPT Image" : "exact lettering"}, real packshot`}`;
  return `${size} · ${drawnPack ? "model-drawn" : "scene + real packshot"}`;
}

export function buildViews(assets: Asset[], gens: Generation[], specs: ChannelSpec[], templates: ShotTemplate[], checks: CheckRow[]): AssetView[] {
  const genById = new Map(gens.map((g) => [g.id, g]));
  const specById = new Map(specs.map((s) => [s.id, s]));
  const failed = new Set(checks.filter((c) => c.result === "fail").map((c) => c.asset_id));
  const modeOf = (k: string) => templates.find((t) => t.key === k)?.mode ?? "generated";
  return assets.map((asset) => {
    const generation = asset.generation_id ? genById.get(asset.generation_id) ?? null : null;
    const sourceReady = assets.some((a) => a.shot_key === "lifestyle" && a.channel === asset.channel && isFinished(a) && !failed.has(a.id));
    const mode = modeOf(asset.shot_key);
    const drawnPack = !!generation?.inputs?.modelPlaced;
    return {
      asset, mode, drawnPack,
      labelFailed: drawnPack && checks.some((c) => c.asset_id === asset.id && c.check_key === "label_match" && c.result === "fail"),
      view: describeAsset(asset, mode, generation, checks.filter((c) => c.asset_id === asset.id).map((c) => c.result), sourceReady),
      url: publicUrl("outputs", asset.storage_path),
      sceneUrl: publicUrl("outputs", generation?.output_path),
      meta: metaLine(asset, asset.spec_id ? specById.get(asset.spec_id) : undefined, drawnPack),
    };
  }).sort((a, b) => SHOT_ORDER.indexOf(a.asset.shot_key) - SHOT_ORDER.indexOf(b.asset.shot_key));
}
