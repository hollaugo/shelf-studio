import { describe, expect, it } from "vitest";
import { computeMetrics, formatDuration, formatPercent, formatRounds, type MetricsInput } from "./metrics";

const review = (product_id: string, channel: string, decision: "approve" | "reject", created_at: string) => ({ product_id, channel, decision, created_at });

const input: MetricsInput = {
  products: [
    { id: "a", sku: "A-1", name: "A", created_at: "2026-01-01T00:00:00Z" },
    { id: "b", sku: "B-1", name: "B", created_at: "2026-01-01T00:00:00Z" },
    { id: "c", sku: "C-1", name: "C", created_at: "2026-01-01T00:00:00Z" },
  ],
  pdps: [
    { product_id: "a", channel: "amazon", status: "replaced", live_at: "2026-01-01T01:00:00Z" },
    { product_id: "a", channel: "amazon", status: "live", live_at: "2026-01-01T05:00:00Z" },
    { product_id: "a", channel: "walmart", status: "live", live_at: "2026-01-01T03:00:00Z" },
    { product_id: "a", channel: "verda", status: "draft", live_at: null },
    { product_id: "b", channel: "amazon", status: "in_review", live_at: null },
  ],
  spend: [{ product_id: "a", credits: 100 }, { product_id: "a", credits: 40 }, { product_id: "b", credits: 60 }],
  // Listed out of order on purpose: Amazon had changes requested first.
  reviews: [review("a", "amazon", "approve", "2026-01-01T02:00:00Z"), review("a", "amazon", "reject", "2026-01-01T01:00:00Z"), review("a", "walmart", "approve", "2026-01-01T01:00:00Z")],
  baselineDays: 3,
};

describe("computeMetrics", () => {
  const metrics = computeMetrics(input);

  it("averages time to each channel's first live version", () => {
    expect(metrics.publishMs).toBe(2 * 3_600_000);
  });

  it("divides credits by the products that have spent any", () => {
    expect(metrics.creditsPerSku).toBe(100);
  });

  it("leaves out spend on products that aren't listed", () => {
    expect(computeMetrics({ ...input, spend: [...input.spend, { product_id: "hidden", credits: 500 }] }).creditsPerSku).toBe(100);
  });

  it("counts changes requested and a re-review as two rounds of one PDP", () => {
    expect(metrics.rounds).toBe(1.5);
    expect(metrics.firstPass).toBe(0.5);
  });

  it("measures time saved against the baseline", () => {
    expect(metrics.savedDays).toBeCloseTo(3 - 2 / 24);
    expect(computeMetrics({ ...input, baselineDays: null }).savedDays).toBeNull();
  });

  it("rolls up each product on its own", () => {
    const [a, b, c] = metrics.rows;
    expect(a).toMatchObject({ live: 2, started: 3, credits: 140, rounds: 1.5, firstPass: 0.5 });
    expect(b).toMatchObject({ live: 0, started: 1, credits: 60, rounds: null, firstPass: null, publishMs: null });
    expect(c).toMatchObject({ live: 0, started: 0, credits: 0 });
  });

  it("shows nothing rather than zero when there's no data", () => {
    const empty = computeMetrics({ ...input, pdps: [], spend: [], reviews: [] });
    expect([empty.publishMs, empty.creditsPerSku, empty.rounds, empty.firstPass, empty.savedDays]).toEqual([null, null, null, null, null]);
  });
});

describe("formatting", () => {
  it("formats values, and a dash for no data", () => {
    expect(formatDuration(90 * 60_000)).toBe("1:30");
    expect(formatDuration(60_000 * 3005)).toBe("50:05");
    expect(formatPercent(0.666)).toBe("67%");
    expect(formatRounds(1.25)).toBe("1.3");
    expect([formatDuration(null), formatPercent(null), formatRounds(null)]).toEqual(["—", "—", "—"]);
  });
});
