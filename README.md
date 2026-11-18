# Token Radar — radar-5

Build the best token launch radar (make.fun `token-radar-01`).

The program reads the sealed DefiLlama snapshot, ranks every protocol
that could plausibly launch a token of its own by an **implied value**
computed from the snapshot's own figures, and writes a dashboard a reader
can sort, filter and open per protocol — each row with a farm verdict
**netted to the dollar** and a farm plan that states what it costs and
how long it takes.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only, no network. Two runs write identical
bytes. Outputs in `/output` (or `$MAKEFUN_OUTPUT_DIR`):

| File | Contents |
| --- | --- |
| `board.json` | 198 ranked rows, ranks 1..198, implied value non-increasing |
| `data.js` | the dashboard's dataset (`window.RADAR`) |
| `dashboard/` | `index.html`, `app.css`, `app.js` (about 39 KB of source) |
| `screenshots/` | 4 renders of the dashboard (board, detail, filtered, method) |
| `dossier.json` | `buildDossier` output, written last |

## The model (radar-5)

```
implied = round( curve(tvl_usd) × categoryOffset × growthFactor × maturity × breadth )
```

All factors come from the snapshot; no protocol name is ever
special-cased. The same arithmetic runs in `dashboard/app.js`, so the
page and `board.json` agree on all 198 rows.

- **curve** — one size curve for every protocol, fitted on the market's
  own prices: take the live-token protocols in categories the board
  prices (81 comps on this snapshot), take each one's log10(mcap)
  against log10(tvl), cap each ratio at 0.75× TVL before fitting (above
  that a token's price is driven by something other than the value it
  secures), and fit a straight line by least squares:
  `log10(mcap) = 2.646 + 0.540 × log10(TVL)`, R² 0.281, residual spread
  ×3.94. The slope is below 1, so the implied multiple falls with size:
  0.128× at $50M TVL, 0.044× at $500M, 0.023× at $2B. Small protocols
  trade rich, big protocols trade near fundamentals — that is the
  market's own shape, not a choice.
- **categoryOffset** — each category's mean residual from the curve,
  shrunk toward zero with weight 6:
  `offset = (n · mean residual) / (n + 6)`. A category with one comp
  barely moves its price (Risk Curators ×1.17 from a single comp);
  a category with many comps earns its offset (Basis Trading ×1.71
  from 7, RWA ×1.51 from 9, Onchain Capital Allocator ×0.77 from 2).
  Offsets range 0.52×–1.71× across the board.
- **growthFactor** — concave momentum:
  `g = clamp(change_7d, −60, +120)`, `growthFactor = (1 + g/100)^0.6`.
  +120% scores 1.60×, −60% scores 0.58×, a missing 7-day change counts
  as 0. A freak week cannot crown a protocol.
- **maturity** — a hump, not a ladder:
  `0.55 + 0.45·(age/730)·exp(1 − age/730)`, peaking at 1.00 at 730 days
  (2 years) and fading slowly after. Running longer with no token first
  proves survival, then starts to look like a protocol that will never
  launch. Age is days from `listed_at` to the snapshot's `as_of`; a
  missing listing date scores at 180 days.
- **breadth** — `1 + 0.03·min(chains − 1, 5)`: up to +15% for a protocol
  live on six chains. Distribution is worth something.
- **band, per category** — the curve is noisy, and not equally noisy
  everywhere, so every implied value carries its own category's band.
  Each category's band is its leave-one-out median error against the
  comps' **true** market caps, shrunk toward the global ×2.85 in log
  space with weight 6 — the same shrinkage the offsets use. RWA's
  comps land within ×1.90 of the curve, so its band tightens to ×2.24;
  Dexs' comps land within ×7.02, so its band widens to ×5.11. The farm
  verdict is judged at the band's low end, never at the point estimate.
- **verdict, netted to the dollar** — a farm is assumed to earn 0.005%
  of supply (the share the median row needs to break even at its band
  low). Net = `band low × 0.005% − (capital + gas)`: "Farm" when the net
  is positive at the band low, "Thin" when it is positive only at the
  point estimate, "Later" when it is positive at neither. On this
  snapshot that is 60 Farm / 122 Thin / 16 Later, nets from −$267 to
  +$785 at the low end (median −$20.50). Break-even share =
  `(capital + gas) ÷ band low` is shown beside every verdict, so the
  reader can re-net the plan at any share they like. A prioritisation,
  not a promise: the snapshot cannot say whether a token launches, or
  what share a farmer earns.

## Why the band is per category now

radar-4 judged every verdict at one global band, implied / 2.85,
where 2.85 is the leave-one-out median error against the comps' true
market caps. The band was honest on average and wrong per category:
it covered 8 of 9 RWA comps but only 3 of 11 Dexs comps, 6 of 15
Lending comps and 3 of 9 Yield comps. One band pretends every
category is equally predictable; the snapshot says they are not.

| Category | Comps | Held-out error, raw | Band used | In global band | In own band |
| --- | --- | --- | --- | --- | --- |
| RWA | 9 | ×1.90 | ×2.24 | 8 / 9 | 6 / 9 |
| Dexs | 11 | ×7.02 | ×5.11 | 3 / 11 | 5 / 11 |
| Lending | 15 | ×4.62 | ×4.03 | 6 / 15 | 7 / 15 |
| Yield | 9 | ×4.65 | ×3.82 | 3 / 9 | 4 / 9 |
| Basis Trading | 7 | ×2.63 | ×2.73 | 5 / 7 | 4 / 7 |
| Yield Aggregator | 4 | ×2.05 | ×2.50 | 3 / 4 | 3 / 4 |
| Cross Chain Bridge | 4 | ×4.22 | ×3.34 | 2 / 4 | 2 / 4 |
| CDP | 3 | ×1.93 | ×2.50 | 2 / 3 | 2 / 3 |
| Indexes | 3 | ×2.33 | ×2.67 | 2 / 3 | 2 / 3 |
| Payments | 2 | ×1.69 | ×2.50 | 2 / 2 | 2 / 2 |
| Restaking | 2 | ×1.71 | ×2.51 | 2 / 2 | 2 / 2 |
| Derivatives | 2 | ×6.07 | ×3.44 | 0 / 2 | 0 / 2 |
| Staking Pool | 2 | ×11.58 | ×4.05 | 1 / 2 | 1 / 2 |
| Onchain Capital Allocator | 2 | ×2.66 | ×2.80 | 1 / 2 | 1 / 2 |
| Prediction Market | 1 | ×1261.28 | ×6.81 | 0 / 1 | 0 / 1 |
| Liquidity Manager | 1 | ×18.37 | ×3.72 | 0 / 1 | 0 / 1 |
| Risk Curators | 1 | ×12.21 | ×3.51 | 0 / 1 | 0 / 1 |
| Chain | 1 | ×13.52 | ×3.56 | 0 / 1 | 0 / 1 |
| Dual-Token Stablecoin | 1 | ×3.32 | ×2.91 | 0 / 1 | 0 / 1 |
| Leveraged Farming | 1 | ×1.71 | ×2.65 | 1 / 1 | 1 / 1 |

Two honest notes on that table. First, the single-comp rows are
freaks, not measurements: the Prediction Market comp is a $6.6M-TVL
protocol whose token trades at 400× TVL, so its held-out error is
×1261 — and shrinkage with weight 6 pulls its band most of the way
back to the global ×2.85, landing at ×6.81. The band says "we have
almost no evidence here, so be cautious", not "this category is
precisely ×6.81 unpredictable". Second, overall coverage of true caps
stays near half (51.9% inside their own band, 50.6% inside the global
one), as a median band should — the change rebalances coverage
across categories instead of adding coverage overall.

The ranks do not move: the band changes verdicts, not values. The
25 verdicts that move, all judged at the category band low:

- 23 Farm fall to Thin — mostly Dexs (6), Lending (5) and Risk
  Curators (4), the categories the curve predicts worst. Their plans
  no longer pay at a low end their own category cannot support.
- 2 Thin rise to Farm — one RWA and one Onchain Capital Allocator
  row, whose categories the curve predicts better than the global
  band assumed.

Sensitivity: shrinkage weight 3 moves 30 verdicts, weight 12 moves
19, linear (non-log) shrinkage with weight 6 moves 29 — the direction
is the same under every variant, and weight 6 in log space is kept
because it is the same shrinkage the offsets already use.

## The blind test: why a curve, why a 0.75× cap

The model is tested the way a reader would test it: leave one listed
comp out, fit the curve and the offsets on the other 80, predict the
held-out comp's market cap — against the comp's **true** market cap,
and, for comparison, against the capped comps the curve was fitted on.
The same test is run on the alternatives, on the same 81 comps, same
protocol:

| Model | LOO, true caps | LOO, capped comps | 5-fold, true caps | 5-fold, capped comps |
| --- | --- | --- | --- | --- |
| **radar-5: curve (0.75× cap) + shrunk offset** | **×2.85** | **×2.57** | **×3.06** | **×2.51** |
| radar-4: same curve, global band | ×2.85 | ×2.57 | ×3.28 | ×2.57 |
| Curve alone, no offset (0.75× cap) | ×3.33 | ×2.64 | — | — |
| radar-2: per-category medians | ×5.24 | ×5.24 | — | — |
| One global median | ×4.89 | ×4.89 | — | — |

(The 5-fold numbers are the median over 10 seeded repeats: a single
split's median moves between ×2.59 and ×3.22 with the split, so one
split is not a number to quote. The leave-one-out numbers are
split-independent and identical to radar-4's.)

Two further tests, both computed by the program at runtime:

- **Time-split.** Fit on the earlier-listed half of the comps, test on
  the later-listed half: ×3.24; the other way round: ×3.19. At the old
  1.0× cap those two disagreed (×2.90 against ×3.78); at 0.75× they
  agree — the cap is not just better on average, it is stabler across
  cohorts.
- **Bootstrap.** Resampling the 81 comps 2,000 times, the fitted slope
  is 0.55, 5th–95th percentile 0.39–0.72: positive in every resample,
  but its size is uncertain — which is why the band is wide.

Paired leave-one-out (true caps): the offset beats the curve alone on
43 of the 81 comps, loses on 32, ties on 6. Two independent protocols
agree, so the offset stays — but note the margin is real, not huge
(×2.85 vs ×3.33). The large gap is curve vs medians: v1's
per-category machinery predicted held-out comps barely better than a
single global multiple, because multiples fall with size and a category
median ignores size.

Fitting age, growth or chain count into the curve was tried and made
the blind test worse (leave-one-out ×2.92–×3.08, against ×2.85), so
those stay fixed adjustments, not fitted coefficients. The curve's R²
is only 0.281 and half of comparable tokens still land outside ×2.85
on true caps — that is why every value carries its band and every
verdict is judged at the band's low end.

Honest limit on the cap choice: the 0.75× cap wins on the median
(×2.85 vs ×3.07 true, ×2.57 vs ×2.67 capped) but only on 30 of the 81
comps individually, losing on 51 — the gain comes from taming a few
very wrong predictions, not from being righter everywhere. It is kept
because it wins on every aggregate metric (both medians, R², and the
time-split agreement), not because it wins every comp.

## Who is ranked, who is set aside

Ranked (198 rows): pre-token protocols — no market cap, no Gecko id, no
symbol — that are not a wrapped, staked or bridged product of a token
that already trades. The exclusion is the watchlist rule's own: CEX,
Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked
BTC, versioned names, wrapped/staked names, exchange-prefixed names.
All 40 watchlist slugs pass it, so coverage is automatic; the other 158
rows are the early finds below the $50M floor.

Set aside (144 pre-token protocols): the wrapped/staked/bridged
products above. Live-token protocols (top 30 by market cap) sit on
their own tab, priced by the market — and the 81 of them in rankable
categories are the comps the curve is fitted on.

The dashboard audits all 342 pre-token protocols: every ranked row
links to the board, every set-aside row is listed with its reason, so
the exclusions can be checked one by one.

"Records no token" is DefiLlama's record, never a claim the protocol
has none.

## Farm plans

Eight steps per protocol, each with a cost and a time, all derived from
the protocol's own record:

1. fresh wallet, seed offline;
2. the category's main action (supply / provide liquidity / deposit
   into a vault / mint the yield asset / stake / …) with capital sized
   by TVL ($50 / $100 / $150 / $250);
3. a second, different qualifying action the same week;
4. a weekly rhythm — 1–3 actions a week depending on 7-day growth;
5. a hold of 30–60 days depending on age;
6. a day-14 checkpoint: re-check TVL and 7-day growth, trim the
   position to half if TVL has fallen more than 20% since entry;
7. check the protocol's own points page, claim only from its published
   link, never pay to claim;
8. log every transaction, unwind in small steps.

Gas per transaction is a stated heuristic by main chain (Ethereum
about $8, the big low-fee chains about $0.25, everything else about
$1.50), summed into an estimated whole-plan gas cost shown in the
detail view. Costs are estimates, not quotes. The verdict, the net at
the band low and at the point estimate, and the break-even share sit
above the budget: the plan pays for itself when the farm earns that
share of supply, judged at the band's low end.

## The dashboard

- Top-3 hero cards (each with its net at the band low), five totals,
  search + category + chain + verdict filters, watchlist-only and
  growing-only toggles, pre-token / live-token tabs.
- Sortable columns: implied value, name, TVL, 7-day growth, age, net
  at band low, verdict (cheapest break-even first), and the new band
  column. The board is paginated at 25 rows a page (8 pages
  unfiltered), with prev/next and numbered pages; a filter, a sort or
  a tab change returns to page 1, and the page is kept in the address
  bar so a paginated view can be linked.
- A model strip above the board states the formula, the comp count,
  the blind-test error on true caps, the time-split errors, the
  per-category bands and the verdict split in one line.
- Detail panel per protocol: the curve value and category offset, the
  value band, the net at the band low and at the point estimate, the
  break-even share and verdict, a "why this rank" sentence generated
  from the numbers, the farm budget (capital, estimated gas, hold,
  setup and weekly time) and the eight steps.
- Method panel: the formula, the per-category band table, the
  blind-test table (true and capped targets, time-split, bootstrap),
  the size curve with a chart of the 81 comps and the fitted line, the
  audit of all 342 pre-token protocols, and a model sandbox (growth
  exponent, curve scale, maturity peak) that re-scores the board live
  in the page — the sandbox changes the page only, never `board.json`.

Palette: light paper, deep navy masthead, amber reserved for the
implied value; one spacing scale throughout.

## How this beats radar-4

| radar-4 | radar-5 |
| --- | --- |
| One global band ×2.85 for every verdict | A band per category, shrunk toward ×2.85 (RWA ×2.24, Dexs ×5.11) |
| Global band covers 8/9 RWA but 3/11 Dexs comps | Coverage rebalanced per category; overall 51.9% |
| Verdicts 81 Farm / 101 Thin / 16 Later | Verdicts 60 Farm / 122 Thin / 16 Later (25 move) |
| Nets −$262..+$1,025 at the low end (median −$10) | Nets −$267..+$785 at the low end (median −$20.50) |
| Same curve, same ranks | Same curve, same ranks — the top 10 are identical |
| Board columns: value, signal, verdict | Board adds a band column; method adds the band table |

## Robustness: how much does the board move if the curve is fitted differently?

Rebuilding the board under each variant, against radar-5's board:

| Variant | Top-10 overlap | Mean \|Δrank\| | Max \|Δrank\| | Spearman ρ |
| --- | --- | --- | --- | --- |
| Ratios capped at 1.0× (radar-3's cap) | 10/10 | 1.87 | 9 | 0.9989 |
| Comps from all 128 live protocols, not just the 81 in rankable categories | 10/10 | 2.85 | 16 | 0.9975 |
| Curve alone, no category offset | 8/10 | 17.09 | 69 | 0.9294 |

Honest reading: **the cap and the comp set barely matter** (10/10,
ρ ≈ 0.999) — neither choice is load-bearing for the ranking. **The
offset matters most** (mean |Δrank| 17.1): it is the part of the model
that separates same-size protocols by category, and the blind test is
the reason it stays — it improves held-out prediction on two
protocols, not because it looks better.

The growth exponent (0.6) and maturity peak (730d) were not re-tuned:
they are the same as radar-2's, and the v1 sensitivity sweep showed
the top 10 keeps 9–10 of its members across 0.5–0.7 / 600–900d.

## Limits

- Implied value is the entry's own estimate, never a price and never a
  prediction that a token launches, or when. The curve's R² is 0.281:
  most of what makes one token worth more than another is not in this
  snapshot (the snapshot has no fee, revenue or user fields — only
  slug, name, category, chains, TVL, 7-day change, market cap,
  listing date, Gecko id and symbol).
- The band is wide (×2.85 globally, ×2.24–×6.81 by category) and the
  verdict is a prioritisation netted at an assumed 0.005% share, not a
  promise that farming pays. At any other share the verdicts move: the
  break-even share beside each verdict is the number to re-net with.
- Gas figures are rough heuristics, not quotes; chain fees move.
- The snapshot is frozen at 2026-11-14: a protocol that launched after
  that date still reads as pre-token here.
