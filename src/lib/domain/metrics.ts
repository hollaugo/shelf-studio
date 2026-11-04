const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type MetricsInput = {
  products: { id: string; sku: string; name: string; created_at: string }[];
  /** Every PDP version. */
  pdps: { product_id: string; channel: string; status: string; live_at: string | null }[];
  spend: { product_id: string; credits: number }[];
  reviews: { product_id: string; channel: string; decision: "approve" | "reject"; created_at: string }[];
  baselineDays: number | null;
};

type Rollup = { publishMs: number | null; credits: number; rounds: number | null; firstPass: number | null };

const average = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

function rollup(input: MetricsInput, ids: Set<string>): Rollup {
  const createdAt = new Map(input.products.map((p) => [p.id, Date.parse(p.created_at)]));
  // From a product being added to the first time each of its channels' PDPs went live.
  const firstLive = new Map<string, number>();
  for (const pdp of input.pdps) {
    if (!ids.has(pdp.product_id) || !pdp.live_at) continue;
    const key = `${pdp.product_id}|${pdp.channel}`;
    firstLive.set(key, Math.min(firstLive.get(key) ?? Infinity, Date.parse(pdp.live_at) - createdAt.get(pdp.product_id)!));
  }
  const publishTimes = [...firstLive.values()];
  // Every decision on a channel's PDP counts, so changes requested followed by an approval is two rounds.
  const slots = new Map<string, MetricsInput["reviews"]>();
  for (const review of input.reviews) {
    if (!ids.has(review.product_id)) continue;
    const key = `${review.product_id}|${review.channel}`;
    slots.set(key, [...(slots.get(key) ?? []), review]);
  }
  const reviewed = [...slots.values()];
  const firstDecision = (rows: MetricsInput["reviews"]) => rows.reduce((first, r) => (Date.parse(r.created_at) < Date.parse(first.created_at) ? r : first)).decision;
  return {
    publishMs: average(publishTimes),
    credits: input.spend.filter((s) => ids.has(s.product_id)).reduce((sum, s) => sum + s.credits, 0),
    rounds: average(reviewed.map((rows) => rows.length)),
    firstPass: reviewed.length ? reviewed.filter((rows) => firstDecision(rows) === "approve").length / reviewed.length : null,
  };
}

export function computeMetrics(input: MetricsInput) {
  const ids = new Set(input.products.map((p) => p.id));
  const all = rollup(input, ids);
  const spending = new Set(input.spend.filter((s) => s.credits > 0 && ids.has(s.product_id)).map((s) => s.product_id));
  return {
    publishMs: all.publishMs,
    creditsPerSku: spending.size ? all.credits / spending.size : null,
    rounds: all.rounds,
    firstPass: all.firstPass,
    savedDays: input.baselineDays != null && all.publishMs != null ? input.baselineDays - all.publishMs / DAY : null,
    rows: input.products.map((p) => {
      const mine = input.pdps.filter((d) => d.product_id === p.id);
      return { ...p, ...rollup(input, new Set([p.id])), live: new Set(mine.filter((d) => d.status === "live").map((d) => d.channel)).size, started: new Set(mine.map((d) => d.channel)).size };
    }),
  };
}

export function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60_000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export const formatPercent = (share: number | null) => (share == null ? "—" : `${Math.round(share * 100)}%`);
export const formatRounds = (rounds: number | null) => (rounds == null ? "—" : rounds.toFixed(1));
