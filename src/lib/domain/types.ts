export const ASSET_STATES = ["draft", "generating", "compositing", "checking", "needs_review", "approved", "published", "failed", "rejected"] as const;
export type AssetState = (typeof ASSET_STATES)[number];

export type Role = "producer" | "reviewer" | "owner";
export type Channel = "amazon" | "walmart" | "target" | "verda";
export type ShotKey = "hero" | "lifestyle" | "in_use" | "claim_card" | "video" | "copy";
export type ShotMode = "deterministic" | "generated" | "image_to_video" | "agent_copy";
export type CheckResult = "pass" | "warn" | "fail";

export const CHANNELS: Channel[] = ["amazon", "walmart", "target", "verda"];
export const CHANNEL_LABEL: Record<Channel, string> = { amazon: "Amazon", walmart: "Walmart", target: "Target", verda: "verda.com" };

export const SHOT_LABEL: Record<ShotKey, string> = { hero: "Main image", lifestyle: "Lifestyle", in_use: "In-use", claim_card: "Claim card", video: "Video", copy: "Product copy" };
export const SHOT_ORDER: ShotKey[] = ["hero", "lifestyle", "in_use", "claim_card", "video", "copy"];

export type ProductAnalysis = {
  productType: string;
  brand: string | null;
  productName: string | null;
  size: string | null;
  visibleText: string[];
  claimsOnPack: string[];
  packaging: { form: string; material: string; finish: string; closure: string };
  palette: { name: string; hex: string }[];
  imageType: "white_background_packshot" | "lifestyle" | "other";
  background: string;
  lighting: string;
  brandMood: string[];
  scenePrompting: { suggestedSettings: string[]; compatibleProps: string[]; avoid: string[] };
  usableForCutout: boolean;
  issues: string[];
};

export type Product = {
  id: string; sku: string; slug: string; name: string; size: string | null; primary_claim: string | null;
  approved_claims: string[]; channels: Channel[]; source: string; analysis: ProductAnalysis | null;
  analysis_status: "none" | "running" | "done" | "failed"; analysis_error: string | null; created_at: string;
};

export type Asset = {
  id: string; product_id: string; run_id: string | null; spec_id: string | null; generation_id: string | null;
  shot_key: ShotKey; channel: Channel; parent_id: string | null; version: number; is_current: boolean; state: AssetState;
  failure_code: string | null; failure_message: string | null; storage_path: string | null; scene_path: string | null;
  width: number | null; height: number | null; alt_text: string | null; content: unknown; refine: unknown; feedback: string | null;
  overlay: unknown; credits: number; tokens: number; submitted_at: string | null; created_at: string; updated_at: string;
};

export type Generation = {
  id: string; product_id: string; run_id: string | null; scene_key: string; kind: "image" | "video"; model: string; ratio: string;
  prompt: string | null; inputs: Record<string, unknown>; status: "queued" | "running" | "done" | "failed"; runway_task_id: string | null;
  runway_status: string | null; attempt: number; retry_at: string | null; output_path: string | null; credits: number;
  error_code: string | null; error: string | null; started_at: string | null; finished_at: string | null; created_at: string;
};

export type CheckRow = { id: string; asset_id: string; check_key: string; label: string; result: CheckResult; detail: { note?: string; [k: string]: unknown }; ran_at: string };

export type ChannelSpec = {
  id: string; channel: Channel; shot_key: ShotKey; width: number | null; height: number | null; scene_ratio: string | null;
  format: string; max_mb: number | null; white_bg: boolean; min_fill: number | null; text_allowed: boolean;
};

export type ShotTemplate = { key: ShotKey; label: string; mode: ShotMode; prompt_template: string | null; model: string | null; source_shot: ShotKey | null; sort: number };
