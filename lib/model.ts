// Token Radar — the value model (radar-5).
//
// One frozen snapshot in, one ranked board out. Every number below is
// derived from the snapshot's own figures; no protocol name is ever
// special-cased and no row is ever hand-picked. The dashboard in
// dashboard/ recomputes each row's value from the same figures, so the
// page and board.json always tell the same story.
//
// # What a pre-token protocol is worth
//
// The market already prices listed protocols, so the model learns the
// price of size from them and applies it to the ones still waiting:
//
//   implied = round( curveValue(tvl) x growth x maturity x breadth )
//
//   curveValue — one log-log line for every protocol, fitted on the
//     listed protocols that sit in categories the board prices (81 comps
//     on this snapshot). Each comp's market cap is capped at 0.75x its
//     TVL before fitting: a token priced far above the value it secures
//     is a freak quote, not a price. The fit is
//     log10(mcap) = 2.646 + 0.540 x log10(TVL), R-squared 0.281. The
//     slope is below one, so the implied multiple falls with size —
//     about 0.13x at $50M of TVL, 0.04x at $500M, 0.02x at $2B. Small
//     protocols trade rich, big ones trade near fundamentals; that shape
//     comes from the market, not from us.
//   category offset — each category's mean residual off the line,
//     shrunk toward zero with weight 6, so a category with a single
//     comp barely moves its price and a category with many comps earns
//     its offset. Offsets run 0.52x-1.71x across the board.
//   growth — concave momentum: the 7-day TVL change, clamped to
//     -60%..+120%, raised to 0.6. +120% scores 1.60x, -60% scores
//     0.58x, a missing change counts as zero. One hot week cannot crown
//     a protocol.
//   maturity — a hump, not a ladder: 0.55 for a fresh listing, 1.00 at
//     730 days, fading slowly after. Surviving longer with no token
//     first proves staying power, then starts to look like a protocol
//     that will never launch. A missing listing date scores at 180 days.
//   breadth — 1 + 0.03 per extra chain, up to +15% at six chains.
//     Distribution is worth something.
//
// # What radar-5 changes: the band is per category now
//
// radar-4 judged every verdict at one global band, implied / 2.85,
// where 2.85 is the leave-one-out median error against the comps'
// true market caps. But the curve is not equally good everywhere:
// held out one by one, RWA comps land within x1.90 of the curve while
// Dexs comps land within x7.02 — and the global band covers 8 of 9 RWA
// comps but only 3 of 11 Dexs comps. One band pretends every category
// is equally predictable; the snapshot says they are not.
//
// So each category now carries its own band: its leave-one-out median
// error on true caps, shrunk toward the global x2.85 in log space with
// weight 6 — the same shrinkage the offsets already use, so a category
// with one comp (whose single error can be a freak like x1261) is
// pulled most of the way back to the global band, while a category
// with 9-15 comps keeps most of its own evidence. RWA's band tightens
// to x2.24, Dexs' widens to x5.11. Verdicts are judged at the
// category band's low end, never at the point estimate, because a plan
// should survive the curve being wrong about its own category. The
// ranks do not move — the band changes verdicts, not values — but 25
// of the 198 verdicts do: 23 Farm fall to Thin, 2 Thin rise to Farm,
// leaving 60 Farm / 122 Thin / 16 Later. Overall coverage of true caps
// stays near half (51.9%), as a median band should.
//
// # The verdict, netted to the dollar
//
// A farm is assumed to earn 0.005% of supply — the share the median
// row needs to break even at its band low. Net = band low x 0.005% -
// (capital + gas): "Farm" when the plan pays at the band's low end,
// "Thin" when it pays only at the point estimate, "Later" when it
// pays at neither. The break-even share, (capital + gas) / band low,
// sits beside every verdict so the reader can re-net the plan at any
// share they like. A prioritisation, not a promise: the snapshot
// cannot say whether a token launches, or what share a farmer earns.
//
// # Who is ranked, who is set aside
//
// Only protocols that could plausibly launch a token of their own:
// pre-token (no market cap, no Gecko id, no symbol) and not a wrapped,
// staked or bridged product of a token that already trades — the same
// exclusion the watchlist rule uses (CEX, Bridge, Canonical Bridge,
// Liquid Staking, Liquid Restaking, Restaked BTC, versioned names,
// wrapped/staked names, exchange-prefixed names). All 40 watchlist
// slugs pass it, so coverage is automatic; the other 158 rows are the
// early finds below the $50M floor. The 144 pre-token protocols left
// out are counted in the dashboard's set-aside panel, not hidden, and
// the audit lists every one of the 342 with its disposition.
//
// Live-token protocols are ranked by the market, not by this model:
// the dashboard shows the top 30 by market cap with their mcap/TVL
// ratio, so the reader can see the market the curve is fitted on.
// "Records no token" is DefiLlama's record, never a claim the
// protocol has none.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

/** One listed comp, as the curve sees it. */
export interface CurvePoint {
  tvl_usd: number;
  mcap_usd: number;
}

/** The fitted size curve, its blind tests, and the per-category bands. */
export interface CurveFit {
  /** Intercept of log10(mcap) = a + b * log10(tvl). */
  a: number;
  /** Slope of log10(mcap) = a + b * log10(tvl). */
  b: number;
  /** Comps the curve was fitted on. */
  n: number;
  /** R-squared of the fit, in log space. */
  r2: number;
  /** Residual spread, in dex (x10^sd). */
  resid_sd_dex: number;
  /** Leave-one-out median error against the capped comps, as a multiple. */
  loo_x: number;
  /** Leave-one-out median error against the comps' true market caps, as a multiple. */
  loo_true_x: number;
  /** 5-fold out-of-sample median error against the capped comps, as a multiple. */
  fivefold_x: number;
  /** 5-fold out-of-sample median error against the comps' true market caps, as a multiple. */
  fivefold_true_x: number;
  /** Time-split median error, fitted on earlier-listed comps, tested on later-listed ones (true caps). */
  timesplit_early_late_x: number;
  /** Time-split median error, fitted on later-listed comps, tested on earlier-listed ones (true caps). */
  timesplit_late_early_x: number;
  /** Bootstrap slope: median over 2,000 resamples of the comps. */
  bootstrap_slope_median: number;
  /** Bootstrap slope: 5th percentile over 2,000 resamples. */
  bootstrap_slope_lo: number;
  /** Bootstrap slope: 95th percentile over 2,000 resamples. */
  bootstrap_slope_hi: number;
  /** The curve's implied multiple at three sizes, for the method panel. */
  multiple_at: { tvl_50m: number; tvl_500m: number; tvl_2b: number };
  /** Shrunk category offsets, in dex: added to log10(mcap) before exponentiating. */
  offsets: Record<string, number>;
  /** Comps behind each category's offset. */
  offset_comps: Record<string, number>;
  /** Each category's own held-out (leave-one-out) median error, as a multiple (true caps). */
  category_loo: Record<string, number>;
  /** Comps behind each category's held-out error. */
  category_loo_n: Record<string, number>;
  /** Each category's band: its held-out error, shrunk toward the global leave-one-out error with weight 6 (log space). */
  category_band: Record<string, number>;
  /** Each category's comps whose true cap falls inside the global band. */
  category_in_global_band: Record<string, number>;
  /** Each category's comps whose true cap falls inside its own band. */
  category_in_own_band: Record<string, number>;
}

/** One audited pre-token protocol: ranked, or set aside with its reason. */
export interface AuditRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  rank: number | null;
  reason: string | null;
}

export interface Settings {
  ratio_cap: number;
  growth_floor: number;
  growth_cap: number;
  growth_exponent: number;
  maturity_base: number;
  maturity_peak_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_extra: number;
  live_rows: number;
  /** The farm's assumed share of supply, as a fraction (0.005% = 0.00005). */
  farm_share: number;
  /** Shrinkage weight for category offsets and category bands. */
  shrink_weight: number;
}

/** radar-5's constants. Change them here and the dashboard's method panel follows. */
export const SETTINGS: Settings = {
  ratio_cap: 0.75,
  growth_floor: -60,
  growth_cap: 120,
  growth_exponent: 0.6,
  maturity_base: 0.55,
  maturity_peak_days: 730,
  unknown_age_days: 180,
  breadth_step: 0.03,
  breadth_max_extra: 5,
  live_rows: 30,
  farm_share: 0.00005,
  shrink_weight: 6,
};

export const MODEL_VERSION = 'radar-5';

/** The per-row breakdown the dashboard shows next to the implied value. */
export interface ModelBreakdown {
  /** The size curve's value for this TVL, before growth, maturity and breadth. */
  curve_value: number;
  /** The shrunk category offset applied to the curve, as a multiplier (1.00 when the category has no comps). */
  category_offset: number;
  /** The same offset in dex, so the dashboard re-runs the curve's exact arithmetic. */
  category_offset_dex: number;
  /** Comps behind the category offset. */
  offset_comps: number;
  growth_pct: number;
  growth_factor: number;
  maturity: number;
  breadth: number;
  age_days: number | null;
  /** The category band applied to this row (shrunk leave-one-out error, as a multiple). */
  band_factor: number;
  /** The category's raw held-out error before shrinkage, as a multiple (the global error when the category has no comps). */
  band_raw: number;
  /** Low end of the band: implied / band_factor. */
  band_low: number;
  /** High end of the band: implied x band_factor. */
  band_high: number;
  /** Break-even airdrop share: (capital + gas) / band_low, as a fraction of supply. */
  break_even_pct: number;
  /** The plan's net in dollars at the band's low end, at the assumed farm share. */
  net_low_usd: number;
  /** The plan's net in dollars at the point estimate, at the assumed farm share. */
  net_point_usd: number;
}

/** What to do first, netted to the dollar at the assumed farm share. */
export type Verdict = 'farm' | 'thin' | 'later';

/** A farm plan's money and time, summed from its steps. */
export interface FarmBudget {
  capital_usd: number;
  gas_per_tx_usd: number;
  hold_days: number;
  actions_per_week: number;
  est_gas_usd: number;
  setup_minutes: number;
  weekly_minutes: number;
}

/** One board.json row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  signal: 'heating' | 'steady' | 'cooling';
  verdict: Verdict;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm: FarmBudget;
  farm_steps: string[];
}

/** A live-token protocol, priced by the market. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_per_tvl: number;
}

/** Everything dashboard/data.js carries. */
export interface RadarBundle {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  settings: Settings;
  curve: CurveFit;
  /** The 81 comps the curve was fitted on, for the chart. */
  comps: CurvePoint[];
  /** Every pre-token protocol, ranked or set aside with its reason. */
  audit: AuditRow[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside: { total: number; by_reason: Record<string, number> };
  /** Rows per verdict, netted at the assumed farm share. */
  verdict_counts: { farm: number; thin: number; later: number };
  rows: BoardRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const SET_ASIDE_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The middle value of a sorted copy; null for an empty list. */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[mid]!;
  return (ordered[mid - 1]! + ordered[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`; null when the listing date is missing or unparsable. */
export function daysSinceListed(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** True when the record carries no token at all: no market cap, no Gecko id, no symbol. */
export function recordsNoToken(p: Proto): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Why a pre-token protocol cannot launch a token of its own, or null when it can. */
export function exclusionReason(p: Proto): string | null {
  if (p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (VERSIONED_NAME.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked name';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange-prefixed name';
  return null;
}

/** True when the protocol belongs on the ranked board. */
export function isRankable(p: Proto): boolean {
  return recordsNoToken(p) && exclusionReason(p) === null;
}

/** The categories the board prices: the categories its rankable protocols belong to. */
function pricedCategories(snapshot: Snap): Set<string> {
  return new Set(snapshot.protocols.filter(isRankable).map((p) => p.category ?? 'Uncategorised'));
}

/** The comps the curve is fitted on: live-token protocols in priced categories. */
function curveComps(snapshot: Snap): Proto[] {
  const cats = pricedCategories(snapshot);
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && isNum(p.mcap_usd) && p.mcap_usd > 0 && p.tvl_usd > 0 && cats.has(p.category ?? 'Uncategorised'),
  );
}

/** Least squares on log10(mcap) against log10(tvl). Returns intercept, slope and R-squared. */
function leastSquares(points: Array<readonly [number, number]>): { a: number; b: number; r2: number } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) * (x - mx);
    syy += (y - my) * (y - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { a, b, r2 };
}

/** A comp's point in log space, its ratio capped at ratio_cap before fitting. */
function cappedPoint(p: Proto, settings: Settings): [number, number] {
  const x = Math.log10(p.tvl_usd);
  const y = Math.min(Math.log10(p.mcap_usd!), x + Math.log10(settings.ratio_cap));
  return [x, y];
}

/** A small deterministic generator (mulberry32), so the 5-fold split and the bootstrap agree on every run. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded shuffle, so the 5-fold split is the same on every run. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Shrunk category offsets from a fit's residuals: each category's mean
 * residual, shrunk toward zero with the shrinkage weight, so a category
 * with one comp barely moves its price and a category with many comps
 * earns its offset. */
function shrunkOffsets(
  points: Array<readonly [number, number]>,
  categories: string[],
  fit: { a: number; b: number },
  weight: number,
): { offsets: Record<string, number>; counts: Record<string, number> } {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  points.forEach(([x, y], i) => {
    const cat = categories[i]!;
    sums[cat] = (sums[cat] ?? 0) + (y - (fit.a + fit.b * x));
    counts[cat] = (counts[cat] ?? 0) + 1;
  });
  const offsets: Record<string, number> = {};
  for (const cat of Object.keys(sums)) {
    const n = counts[cat]!;
    offsets[cat] = (n * (sums[cat]! / n)) / (n + weight);
  }
  return { offsets, counts };
}

/** Shrink a category's raw band toward the global band in log space:
 * a category with few comps is pulled most of the way home, a category
 * with many comps keeps most of its own evidence. */
function shrinkBand(raw: number, n: number, global: number, weight: number): number {
  return Math.exp((n * Math.log(raw) + weight * Math.log(global)) / (n + weight));
}

/**
 * The size curve, fitted on the snapshot's own listed comps, with its
 * blind tests: leave-one-out and 5-fold out-of-sample median errors,
 * each on two targets — the capped comps the curve was fitted on, and
 * the comps' true market caps — plus a time-split test in both
 * directions and a bootstrap of the slope. Every blind test is run on
 * the model as it scores: curve plus shrunk category offset, each test
 * fold refitting both from its training comps. The leave-one-out loop
 * also collects each category's own held-out error, which becomes its
 * band: the raw median per category, shrunk toward the global
 * leave-one-out error in log space.
 */
export function fitSizeCurve(snapshot: Snap, settings: Settings = SETTINGS): CurveFit {
  const comps = curveComps(snapshot);
  const points = comps.map((p) => cappedPoint(p, settings));
  const cats = comps.map((p) => p.category ?? 'Uncategorised');
  const trueY = comps.map((p) => Math.log10(p.mcap_usd!));
  const { a, b, r2 } = leastSquares(points);
  const { offsets, counts: offsetCounts } = shrunkOffsets(points, cats, { a, b }, settings.shrink_weight);
  const resid = points.map(([x, y], i) => y - (a + b * x + (offsets[cats[i]!] ?? 0)));
  const residSd = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / Math.max(1, points.length - 2));
  // Leave-one-out: predict each comp from the curve and offset fitted on the other comps.
  const looErrs: number[] = [];
  const looTrueErrs: number[] = [];
  const perCatTrueErrs: Record<string, number[]> = {};
  const looPredTrue: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const rest = points.filter((_, j) => j !== i);
    const restCats = cats.filter((_, j) => j !== i);
    const f = leastSquares(rest);
    const off = shrunkOffsets(rest, restCats, f, settings.shrink_weight);
    const pred = f.a + f.b * points[i]![0] + (off.offsets[cats[i]!] ?? 0);
    looPredTrue.push(pred);
    looErrs.push(Math.abs(points[i]![1] - pred));
    looTrueErrs.push(Math.abs(trueY[i]! - pred));
    (perCatTrueErrs[cats[i]!] ??= []).push(Math.abs(trueY[i]! - pred));
  }
  const looX = 10 ** (medianOf(looErrs) ?? 0);
  const looTrueX = 10 ** (medianOf(looTrueErrs) ?? 0);
  // Per-category bands from the same held-out errors.
  const categoryLoo: Record<string, number> = {};
  const categoryLooN: Record<string, number> = {};
  const categoryBand: Record<string, number> = {};
  const categoryInGlobal: Record<string, number> = {};
  const categoryInOwn: Record<string, number> = {};
  for (const cat of Object.keys(perCatTrueErrs)) {
    const errs = perCatTrueErrs[cat]!;
    const raw = 10 ** (medianOf(errs) ?? 0);
    categoryLoo[cat] = raw;
    categoryLooN[cat] = errs.length;
    categoryBand[cat] = shrinkBand(raw, errs.length, looTrueX, settings.shrink_weight);
    categoryInGlobal[cat] = errs.filter((e) => e <= Math.log10(looTrueX)).length;
    categoryInOwn[cat] = errs.filter((e) => e <= Math.log10(categoryBand[cat]!)).length;
  }
  // 5-fold, repeated 10 times with different seeded splits: a single
  // split's median moves a lot with the split (x2.59-x3.22 across seeds),
  // so the reported number is the median of the ten repeats' medians.
  // Each repeat: five disjoint held-out sets, each predicted from the
  // other four.
  const foldMediansTrue: number[] = [];
  const foldMediansCapped: number[] = [];
  for (let rep = 0; rep < 10; rep++) {
    const order = seededShuffle(points.map((_, i) => i), 20261114 + rep * 7919);
    const folds: number[][] = [[], [], [], [], []];
    order.forEach((idx, k) => folds[k % 5]!.push(idx));
    const foldErrs: number[] = [];
    const foldTrueErrs: number[] = [];
    for (let f = 0; f < 5; f++) {
      const test = new Set(folds[f]);
      const train = points.filter((_, i) => !test.has(i));
      const trainCats = cats.filter((_, i) => !test.has(i));
      const fit = leastSquares(train);
      const off = shrunkOffsets(train, trainCats, fit, settings.shrink_weight);
      for (const i of folds[f]!) {
        const pred = fit.a + fit.b * points[i]![0] + (off.offsets[cats[i]!] ?? 0);
        foldErrs.push(Math.abs(points[i]![1] - pred));
        foldTrueErrs.push(Math.abs(trueY[i]! - pred));
      }
    }
    foldMediansCapped.push(10 ** (medianOf(foldErrs) ?? 0));
    foldMediansTrue.push(10 ** (medianOf(foldTrueErrs) ?? 0));
  }
  const fivefoldX = medianOf(foldMediansCapped) ?? 0;
  const fivefoldTrueX = medianOf(foldMediansTrue) ?? 0;
  // Time-split: fit on the earlier-listed half, test on the later-listed
  // half, and the other way round. A curve that only fits one cohort is
  // not a curve to trust. Errors are against true market caps.
  const fitOn = (trainIdx: number[], testIdx: number[]): number => {
    const train = trainIdx.map((i) => points[i]!);
    const trainCats = trainIdx.map((i) => cats[i]!);
    const fit = leastSquares(train);
    const off = shrunkOffsets(train, trainCats, fit, settings.shrink_weight);
    const errs = testIdx.map((i) => Math.abs(trueY[i]! - (fit.a + fit.b * points[i]![0] + (off.offsets[cats[i]!] ?? 0))));
    return 10 ** (medianOf(errs) ?? 0);
  };
  const dated = comps
    .map((p, i) => ({ i, age: daysSinceListed(snapshot.as_of, p.listed_at) }))
    .filter((d): d is { i: number; age: number } => d.age !== null)
    .sort((x, y) => y.age - x.age);
  const half = Math.floor(dated.length / 2);
  const earlyIdx = dated.slice(0, half).map((d) => d.i);
  const lateIdx = dated.slice(half).map((d) => d.i);
  const timesplitEarlyLateX = fitOn(earlyIdx, lateIdx);
  const timesplitLateEarlyX = fitOn(lateIdx, earlyIdx);
  // Bootstrap: resample the comps with replacement 2,000 times (seeded, so
  // every run agrees) and refit the slope each time. The 5th-95th range
  // says how much the slope depends on which comps happen to be in the set.
  const rand = mulberry32(987654321);
  const bootSlopes: number[] = [];
  for (let r = 0; r < 2000; r++) {
    const sample: Array<readonly [number, number]> = [];
    for (let k = 0; k < points.length; k++) sample.push(points[Math.floor(rand() * points.length)]!);
    bootSlopes.push(leastSquares(sample).b);
  }
  bootSlopes.sort((x, y) => x - y);
  const quantile = (q: number): number => bootSlopes[Math.min(bootSlopes.length - 1, Math.max(0, Math.floor(q * bootSlopes.length)))]!;
  const multipleAt = (tvl: number): number => 10 ** a * tvl ** (b - 1);
  return {
    a,
    b,
    n: comps.length,
    r2,
    resid_sd_dex: residSd,
    loo_x: looX,
    loo_true_x: looTrueX,
    fivefold_x: fivefoldX,
    fivefold_true_x: fivefoldTrueX,
    timesplit_early_late_x: timesplitEarlyLateX,
    timesplit_late_early_x: timesplitLateEarlyX,
    bootstrap_slope_median: quantile(0.5),
    bootstrap_slope_lo: quantile(0.05),
    bootstrap_slope_hi: quantile(0.95),
    multiple_at: { tvl_50m: multipleAt(50_000_000), tvl_500m: multipleAt(500_000_000), tvl_2b: multipleAt(2_000_000_000) },
    offsets,
    offset_comps: offsetCounts,
    category_loo: categoryLoo,
    category_loo_n: categoryLooN,
    category_band: categoryBand,
    category_in_global_band: categoryInGlobal,
    category_in_own_band: categoryInOwn,
  };
}

/** What the size curve says a protocol of this TVL is worth, before the other factors. */
export function curveValue(tvlUsd: number, curve: CurveFit, category: string | null = null): number {
  const offset = curve.offsets[category ?? 'Uncategorised'] ?? 0;
  return 10 ** (curve.a + curve.b * Math.log10(tvlUsd) + offset);
}

/** The band a row is judged at: its category's shrunk band, or the global error when the category has no comps. */
export function bandFor(curve: CurveFit, category: string | null): number {
  return curve.category_band[category ?? 'Uncategorised'] ?? curve.loo_true_x;
}

/** The concave momentum factor for a 7-day TVL change in percent. */
export function growthFactor(change7d: number | null, settings: Settings = SETTINGS): { pct: number; factor: number } {
  const pct = clamp(isNum(change7d) ? change7d : 0, settings.growth_floor, settings.growth_cap);
  return { pct, factor: (1 + pct / 100) ** settings.growth_exponent };
}

/** The hump: 0.55 for a fresh listing, 1.00 at 730 days, fading slowly after. */
export function maturityFactor(ageDays: number | null, settings: Settings = SETTINGS): number {
  const age = ageDays ?? settings.unknown_age_days;
  const x = Math.max(0, age) / settings.maturity_peak_days;
  return settings.maturity_base + (1 - settings.maturity_base) * x * Math.exp(1 - x);
}

/** Distribution across chains: +3% per extra chain, up to +15%. */
export function breadthFactor(chains: string[], settings: Settings = SETTINGS): number {
  return 1 + settings.breadth_step * Math.min(Math.max(chains.length - 1, 0), settings.breadth_max_extra);
}

export interface Scored {
  implied: number;
  breakdown: ModelBreakdown;
}

/** Score one protocol. The same arithmetic runs in the dashboard. */
export function scoreProtocol(
  p: Proto,
  asOf: string,
  curve: CurveFit,
  settings: Settings = SETTINGS,
): Scored {
  const age = daysSinceListed(asOf, p.listed_at);
  const curveVal = curveValue(p.tvl_usd, curve, p.category);
  const offsetDex = curve.offsets[p.category ?? 'Uncategorised'] ?? 0;
  const offsetMult = 10 ** offsetDex;
  const { pct, factor: growth } = growthFactor(p.change_7d, settings);
  const maturity = maturityFactor(age, settings);
  const breadth = breadthFactor(p.chains, settings);
  const implied = Math.max(1, Math.round(curveVal * growth * maturity * breadth));
  const band = bandFor(curve, p.category);
  const rawBand = curve.category_loo[p.category ?? 'Uncategorised'] ?? curve.loo_true_x;
  return {
    implied,
    breakdown: {
      curve_value: curveVal,
      category_offset: offsetMult,
      category_offset_dex: offsetDex,
      offset_comps: curve.offset_comps[p.category ?? 'Uncategorised'] ?? 0,
      growth_pct: pct,
      // Full precision, not rounded: the dashboard re-runs this exact
      // arithmetic from these fields, and a rounded factor would make its
      // recomputed value differ from the board's by a few dollars.
      growth_factor: growth,
      maturity,
      breadth,
      age_days: age,
      band_factor: band,
      band_raw: rawBand,
      band_low: Math.max(1, Math.round(implied / band)),
      band_high: Math.round(implied * band),
      // Filled in by buildBoard once the farm budget is known.
      break_even_pct: 0,
      net_low_usd: 0,
      net_point_usd: 0,
    },
  };
}

function signalFor(change7d: number | null): 'heating' | 'steady' | 'cooling' {
  if (isNum(change7d) && change7d > 5) return 'heating';
  if (isNum(change7d) && change7d < -5) return 'cooling';
  return 'steady';
}

// ---------------------------------------------------------------- farm plan

/** The first chain the record names, or a neutral fallback. */
function mainChain(p: Proto): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: Proto): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long the position must be held, from the protocol's age. */
function holdFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Qualifying actions a week, from the protocol's 7-day growth. */
function cadenceFor(change7d: number | null): number {
  if (isNum(change7d) && change7d > 10) return 3;
  if (isNum(change7d) && change7d > 0) return 2;
  return 1;
}

/**
 * What one transaction costs on the protocol's main chain: a rough, stated
 * heuristic, not a quote. Ethereum mainnet is the expensive tier, the big
 * low-fee chains the cheap tier, everything else sits in the middle.
 */
function gasPerTx(chain: string): number {
  if (chain === 'Ethereum') return 8;
  if (['Solana', 'Base', 'Arbitrum', 'Optimism', 'Unichain', 'Binance', 'Polygon'].includes(chain)) return 0.25;
  return 1.5;
}

interface ActionPair {
  primary: string;
  secondary: string;
}

/** The two qualifying actions for a category, in plain farmer's language. */
function actionsFor(p: Proto, capital: number, chain: string): ActionPair {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  const fallback = `Put $${capital} of USDC to work in ${n} on ${chain} and leave the position open`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      primary: `Lend $${capital} in USDC through ${n} on ${chain} and leave the supply earning`,
      secondary: `Borrow $10 against that supply on ${n}, then pay it back within the week`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('leveraged farm')) {
    return {
      primary: `Add $${capital} of liquidity to ${n}'s main pool on ${chain} and leave the position open`,
      secondary: `Trade $10 through ${n} on ${chain} so the wallet shows trading activity as well`,
    };
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('farm')) {
    return {
      primary: `Place $${capital} in a ${n} vault on ${chain} and keep the vault shares`,
      secondary: `Shift $10 between two ${n} vaults so the wallet shows a second deposit`,
    };
  }
  if (c.includes('rwa') || c.includes('basis trading')) {
    return {
      primary: `Mint $${capital} of the yield-bearing asset on ${n} (${chain}) and hold it`,
      secondary: `Add another $10 mint on ${n} so the wallet shows repeat activity`,
    };
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options vault')) {
    return {
      primary: `Post $${capital} of USDC as margin on ${n} and open one small hedged trade`,
      secondary: `Close and reopen a $10 hedge on ${n} so the wallet shows trading activity`,
    };
  }
  if (c.includes('prediction')) {
    return {
      primary: `Fund $${capital} and take one market position on ${n}`,
      secondary: `Take a second $10 position on a different ${n} market in the same week`,
    };
  }
  if (c.includes('restak') || c.includes('staking pool')) {
    return {
      primary: `Stake $${capital} of the chain's staking asset through ${n} and keep the receipt token`,
      secondary: `Stake $10 more through ${n} so the wallet shows a repeat stake`,
    };
  }
  if (c.includes('stable')) {
    return {
      primary: `Mint or deposit $${capital} of the stable asset through ${n} on ${chain}`,
      secondary: `Move $10 of the stable asset through ${n} to show a second use`,
    };
  }
  if (c.includes('insurance')) {
    return {
      primary: `Buy $${capital} of cover from ${n} on ${chain} and keep the policy live`,
      secondary: `Extend $10 of cover on ${n} so the wallet shows repeat cover`,
    };
  }
  if (c.includes('chain')) {
    return {
      primary: `Bridge $${capital} of USDC to ${chain} and put it to work in ${n}'s own apps`,
      secondary: `Make one $10 transaction in an app on ${chain} after bridging through ${n}`,
    };
  }
  return { primary: fallback, secondary: `Use ${n} a second time the same week with a $10 deposit, swap or vote, whichever its app offers` };
}

interface RawStep {
  text: string;
  cost: string;
  time: string;
}

/** One step as a single string, always carrying its cost and its time. */
export function joinStep(step: RawStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: eight steps, each with a cost and a time, all
 * derived from the protocol's own record (category, main chain, TVL, age,
 * 7-day growth). No name is ever special-cased.
 */
export function farmPlan(p: Proto, age: number | null): { steps: string[]; budget: FarmBudget } {
  const chain = mainChain(p);
  const capital = capitalFor(p);
  const hold = holdFor(age);
  const weekly = cadenceFor(p.change_7d);
  const gas = gasPerTx(chain);
  const { primary, secondary } = actionsFor(p, capital, chain);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const budget: FarmBudget = {
    capital_usd: capital,
    gas_per_tx_usd: gas,
    hold_days: hold,
    actions_per_week: weekly,
    est_gas_usd: round2(2 * gas + weeks * weekly * gas),
    setup_minutes: 35,
    weekly_minutes: 10,
  };
  const steps: RawStep[] = [
    {
      text: 'Set up a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline',
      cost: `$0 to set up, about $${gas} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: primary,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondary,
      cost: `about $${gas} of gas${capital >= 150 ? ` and $10 of capital` : ''}`,
      time: '10 minutes',
    },
    {
      text: `Do one qualifying action ${weekly} time${weekly === 1 ? '' : 's'} a week, such as a deposit, a swap or a vote, while the position is open`,
      cost: `about $${round2(weekly * gas)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity is counted in more than one snapshot`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `On day 14, re-check ${p.name}'s TVL and 7-day growth; if TVL has fallen more than 20% since you entered, halve the position and note why`,
      cost: `about $${gas} of gas to trim the position`,
      time: '10 minutes',
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: 'Record the wallet, the dates and every transaction hash in a farm log, then unwind in small steps so fees and slippage stay low',
      cost: `about $${gas} of gas to exit`,
      time: '5 minutes to log, 15 minutes to unwind',
    },
  ];
  return { steps: steps.map(joinStep), budget };
}

// ---------------------------------------------------------------- board

/** The live-token protocols, by market cap, priced by the market. */
export function liveTable(snapshot: Snap, settings: Settings = SETTINGS): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !recordsNoToken(p) && p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd)
    .slice(0, settings.live_rows)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      mcap_per_tvl: round2(p.mcap_usd! / p.tvl_usd),
    }));
}

function countsByReason(snapshot: Snap): { total: number; by_reason: Record<string, number> } {
  const by_reason: Record<string, number> = {};
  let total = 0;
  for (const p of snapshot.protocols) {
    if (!recordsNoToken(p)) continue;
    const reason = exclusionReason(p);
    if (reason !== null) {
      total += 1;
      by_reason[reason] = (by_reason[reason] ?? 0) + 1;
    }
  }
  return { total, by_reason };
}

/** Every pre-token protocol, ranked or set aside with its reason. */
export function auditTable(snapshot: Snap, board: BoardRow[]): AuditRow[] {
  const rankOf = new Map(board.map((r) => [r.slug, r.rank]));
  return snapshot.protocols
    .filter(recordsNoToken)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      rank: rankOf.get(p.slug) ?? null,
      reason: rankOf.has(p.slug) ? null : exclusionReason(p),
    }));
}

/** Build the ranked board: every rankable protocol, strongest implied value first. */
export function buildBoard(snapshot: Snap, settings: Settings = SETTINGS): BoardRow[] {
  const curve = fitSizeCurve(snapshot, settings);
  const watchlist = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isRankable);
  const scored = candidates.map((p) => {
    const { implied, breakdown } = scoreProtocol(p, snapshot.as_of, curve, settings);
    const { steps, budget } = farmPlan(p, breakdown.age_days);
    // Break-even airdrop share: the plan pays for itself when the farm
    // earns this fraction of supply, judged at the category band's low
    // end. The net is the same fact in dollars, at the assumed farm
    // share: the value of that share at the band low (or at the point
    // estimate), minus everything the plan costs.
    const totalCost = budget.capital_usd + budget.est_gas_usd;
    breakdown.break_even_pct = totalCost / breakdown.band_low;
    breakdown.net_low_usd = Math.round(breakdown.band_low * settings.farm_share - totalCost);
    breakdown.net_point_usd = Math.round(implied * settings.farm_share - totalCost);
    return { p, implied, breakdown, steps, budget };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Verdicts, netted to the dollar at the assumed farm share: the plan
  // "farms" when it pays at its category band's low end, is "thin" when
  // it pays only at the point estimate, and waits for "later" when it
  // pays at neither. A prioritisation, not a promise.
  const verdictOf = (s: (typeof scored)[number]): Verdict =>
    s.breakdown.net_low_usd > 0 ? 'farm' : s.breakdown.net_point_usd > 0 ? 'thin' : 'later';
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: watchlist.has(s.p.slug),
    age_days: s.breakdown.age_days,
    signal: signalFor(s.p.change_7d),
    verdict: verdictOf(s),
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm: s.budget,
    farm_steps: s.steps,
  }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildBundle(snapshot: Snap, settings: Settings = SETTINGS): { board: BoardRow[]; bundle: RadarBundle } {
  const curve = fitSizeCurve(snapshot, settings);
  const board = buildBoard(snapshot, settings);
  const live = liveTable(snapshot, settings);
  const early = board.filter((r) => !r.on_watchlist).length;
  const bundle: RadarBundle = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    settings,
    curve,
    comps: curveComps(snapshot).map((p) => ({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! })),
    audit: auditTable(snapshot, board),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    set_aside: countsByReason(snapshot),
    verdict_counts: {
      farm: board.filter((r) => r.verdict === 'farm').length,
      thin: board.filter((r) => r.verdict === 'thin').length,
      later: board.filter((r) => r.verdict === 'later').length,
    },
    rows: board,
    live,
  };
  return { board, bundle };
}

// ---------------------------------------------------------------- parsing + checks

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snap {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols: Proto[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || !isNum(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: isNum(p.change_7d) ? p.change_7d : null,
      mcap_usd: isNum(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null when it passes every row. */
export function boardProblem(board: BoardRow[], snapshot: Snap): string | null {
  const seen = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank slot ${i + 1} holds ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} (${board[i]!.slug}) is valued above row ${i}`;
    }
  }
  if (board.length >= 2 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return `all ${board.length} rows share implied value ${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    }
  }
  return null;
}

/** The dashboard's dataset as one script tag's worth of JavaScript, no fetch, no network. */
export function bundleScript(bundle: RadarBundle): string {
  return `window.RADAR=${JSON.stringify(bundle)};\n`;
}
