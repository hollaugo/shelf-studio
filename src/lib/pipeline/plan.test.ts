import { describe, expect, it } from "vitest";
import { planShots, reusableScene } from "./plan";
import type { ChannelSpec, ShotTemplate } from "@/lib/domain/types";

const templates = [
  { key: "hero", mode: "deterministic", model: null },
  { key: "lifestyle", mode: "generated", model: "gpt_image_2_5_sunburst" },
  { key: "claim_card", mode: "deterministic", model: null },
  { key: "video", mode: "image_to_video", model: "gen4.5" },
  { key: "copy", mode: "agent_copy", model: "x" },
] as unknown as ShotTemplate[];

const spec = (channel: string, shot_key: string, scene_ratio: string | null = null) => ({ id: `${channel}-${shot_key}`, channel, shot_key, scene_ratio }) as unknown as ChannelSpec;
const specs = [
  ...["amazon", "walmart"].flatMap((c) => [spec(c, "hero"), spec(c, "lifestyle", "2048:2048"), spec(c, "claim_card"), spec(c, "video", "720:1280"), spec(c, "copy")]),
  spec("verda", "hero"), spec("verda", "lifestyle", "2752:1536"),
];

describe("reusableScene", () => {
  const scene = (inputs: Record<string, unknown>) => ({ status: "done", kind: "image", ratio: "2048:2048", scene_key: "k", inputs });
  it("shares a placed scene only once its label is confirmed", () => {
    expect(reusableScene(scene({ shot: "lifestyle", modelPlaced: true, pack: { passed: true } }))).toBe(true);
    expect(reusableScene(scene({ shot: "lifestyle", modelPlaced: true, pack: { passed: false } }))).toBe(false);
    expect(reusableScene(scene({ shot: "lifestyle", modelPlaced: true }))).toBe(false);
  });
  it("doesn't reuse older scenes made for compositing", () => {
    expect(reusableScene(scene({ shot: "in_use" }))).toBe(false);
  });
  it("doesn't reuse an older claim card, or an image with text added", () => {
    expect(reusableScene(scene({ shot: "claim_card", textRender: true }))).toBe(false);
    expect(reusableScene(scene({ shot: "claim_card", modelPlaced: true, drawnClaim: true, pack: { passed: true } }))).toBe(true);
    expect(reusableScene(scene({ shot: "lifestyle", modelPlaced: true, pack: { passed: true }, baseGeneration: "x" }))).toBe(false);
  });
});

describe("planShots", () => {
  it("plans stills per channel and leaves video and copy out", () => {
    const plan = planShots({ runId: "r", channels: ["amazon"], specs, templates });
    expect(plan.assets.map((a) => a.shot).sort()).toEqual(["claim_card", "hero", "lifestyle"]);
  });
  it("sends deterministic shots straight to rendering, with no generation", () => {
    const plan = planShots({ runId: "r", channels: ["amazon"], specs, templates });
    expect(plan.assets.find((a) => a.shot === "hero")).toMatchObject({ state: "compositing", sceneKey: null });
    expect(plan.generations).toHaveLength(1);
  });
  it("shares a scene between channels with the same ratio", () => {
    const plan = planShots({ runId: "r", channels: ["amazon", "walmart", "verda"], specs, templates });
    expect(plan.generations.map((g) => g.ratio).sort()).toEqual(["2048:2048", "2752:1536"]);
    expect(plan.credits).toBe(36);
  });
  it("has the model place the pack in Lifestyle and In-use, and leaves other shots alone", () => {
    const plan = planShots({ runId: "r", channels: ["amazon"], specs, templates });
    expect(plan.generations[0]).toMatchObject({ shot: "lifestyle", model: "gpt_image_2_5_sunburst", modelPlaced: true, credits: 18 });
  });
  it("reuses a finished scene instead of paying for it again", () => {
    const plan = planShots({ runId: "r", channels: ["walmart"], specs, templates, reusableScenes: new Map([["lifestyle:2048:2048", "old-scene"]]) });
    expect(plan.generations).toHaveLength(0);
    expect(plan.assets.find((a) => a.shot === "lifestyle")?.sceneKey).toBe("old-scene");
  });
  it("skips assets that already exist", () => {
    const plan = planShots({ runId: "r", channels: ["amazon"], specs, templates, existing: new Set(["amazon:lifestyle"]) });
    expect(plan.generations).toHaveLength(0);
    expect(plan.assets.map((a) => a.shot).sort()).toEqual(["claim_card", "hero"]);
  });
  it("works for a second SKU from the same config, with no code change", () => {
    const a = planShots({ runId: "a", channels: ["amazon"], specs, templates });
    const b = planShots({ runId: "b", channels: ["amazon"], specs, templates });
    expect(b.assets.map((x) => x.shot)).toEqual(a.assets.map((x) => x.shot));
  });
});
