// Property vs staying in stocks — an apples-to-apples comparison on the SAME
// cash outflows. Two strategies are supported:
//
//  1. Buy & hold: pay the construction-linked plan in full, register (stamp
//     duty + GST), and hold the flat. You end owning an asset worth its market
//     value at the horizon.
//
//  2. Flip before possession: pay installments as the building progresses, then
//     SELL / assign the allotment a bit before possession — so you never
//     register (no stamp duty), never pay the final installments, and capture
//     the appreciation on the flat's FULL value while having deployed only the
//     installments paid so far. The new buyer assumes the outstanding balance.
//
// The flip is pure leverage: the flat appreciates on its whole value, you tie
// up only part of it, and you skip registration cost. The trade-off is
// liquidity/exit risk near possession and a builder transfer fee.

import { xirr } from "./projection";

export interface PropInput {
  rateNow: number; // ₹ / sqft today
  rateExit: number; // ₹ / sqft when you sell (or at possession, if holding)
  size: number; // sqft
  years: number; // delivery / holding horizon
  extraCostPct: number; // stamp + registration + GST as % of base price (buy & hold)
  payments: { year: number; amount: number }[]; // construction-linked plan (₹ per year)
  stockReturnPct: number; // your assumed stock return
  // Flip mode:
  flip?: boolean; // sell the allotment before possession
  sellYear?: number; // year you exit (flip). Defaults to years.
  transferCostPct?: number; // builder transfer/assignment + brokerage, as % of sale value
}

export interface PropResult {
  mode: "flip" | "hold";
  horizon: number; // effective years to the exit
  purchase: number; // base price = rate × size
  endValue: number; // rate at exit × size (market value of the flat at exit)
  paidSoFar: number; // installments actually paid by the exit
  outstanding: number; // balance the new buyer assumes (flip) / 0 if held
  extraCost: number; // stamp/reg/GST you bear (0 in flip)
  transferCost: number; // sale-side cost (flip)
  totalCommitted: number; // cash you actually put in
  scheduleSum: number; // sum of all CLP payments entered (full plan)
  // Property outcome
  propertyEnd: number; // cash in hand at exit (flip) or asset value (hold)
  propertyGain: number;
  propertyXirr: number; // money-weighted return on cash deployed
  // Stock alternative (same cash, same timing, same horizon)
  stockEnd: number;
  stockGain: number;
  // Head to head
  winner: "property" | "stocks" | "tie";
  edge: number;
  crossoverPct: number; // stock return at which the two tie
}

export function compareProperty(i: PropInput): PropResult {
  const purchase = i.rateNow * i.size;
  const endValue = i.rateExit * i.size;
  const scheduleSum = i.payments.reduce((a, p) => a + p.amount, 0);
  const r = i.stockReturnPct / 100;
  const flip = !!i.flip;
  const horizon = flip ? Math.min(i.sellYear ?? i.years, i.years) : i.years;

  // Only installments due on/before the exit are actually paid.
  const paid = i.payments.filter((p) => p.year <= horizon);
  const paidSoFar = paid.reduce((a, p) => a + p.amount, 0);

  // Costs differ by strategy.
  const extraCost = flip ? 0 : purchase * (i.extraCostPct / 100); // no registration when flipping
  const transferCost = flip ? endValue * ((i.transferCostPct ?? 0) / 100) : 0;

  // Outstanding balance the new buyer takes over (flip). In buy & hold you pay
  // the full price, so there's nothing outstanding.
  const outstanding = flip ? Math.max(0, purchase - paidSoFar) : 0;

  // Cash you actually deploy.
  const totalCommitted = flip ? paidSoFar + extraCost : scheduleSum + extraCost;

  // Property outcome at exit.
  //  - Flip: you receive the market value minus the balance the buyer assumes,
  //    minus transfer/brokerage. That's cash in hand.
  //  - Hold: you own an asset worth its market value.
  const propertyEnd = flip ? endValue - outstanding - transferCost : endValue;
  const propertyGain = propertyEnd - totalCommitted;

  // Property XIRR on the cash actually deployed.
  const flows: { t: number; amt: number }[] = paid.map((p) => ({ t: p.year, amt: -p.amount }));
  if (extraCost > 0) flows.push({ t: 0, amt: -extraCost });
  flows.push({ t: horizon, amt: propertyEnd });
  const propertyXirr = xirr(flows) * 100;

  // Stock alternative: invest the SAME outflows at the SAME times, valued at the
  // same horizon.
  const stockOf = (ret: number) =>
    paid.reduce((a, p) => a + p.amount * Math.pow(1 + ret, Math.max(0, horizon - p.year)), 0) +
    extraCost * Math.pow(1 + ret, horizon);
  const stockEnd = stockOf(r);

  const edge = propertyEnd - stockEnd;
  const winner = Math.abs(edge) < totalCommitted * 0.01 ? "tie" : edge > 0 ? "property" : "stocks";

  // Crossover: the stock return at which stocks would exactly match the property
  // outcome (bisection). This is the hurdle rate your trading must clear.
  let lo = 0,
    hi = 1; // 0%..100%
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (stockOf(mid) < propertyEnd) lo = mid;
    else hi = mid;
  }
  const crossoverPct = ((lo + hi) / 2) * 100;

  return {
    mode: flip ? "flip" : "hold",
    horizon,
    purchase,
    endValue,
    paidSoFar,
    outstanding,
    extraCost,
    transferCost,
    totalCommitted,
    scheduleSum,
    propertyEnd,
    propertyGain,
    propertyXirr,
    stockEnd,
    stockGain: stockEnd - totalCommitted,
    winner,
    edge,
    crossoverPct,
  };
}

// ---------------------------------------------------------------------------
// Combined portfolio: fund the flat's installments out of a corpus (e.g. 2.5
// Cr), and keep the rest of the corpus working — a slice in FD, the rest in the
// market. Answers "what does my whole 2.5 Cr do?", and whether diverting cash
// into the flat beats simply investing the entire corpus 30/70.
// ---------------------------------------------------------------------------

export interface CombinedInput {
  corpus: number; // total money you have (e.g. 2.5 Cr)
  fdPct: number; // % of the idle corpus kept in FD
  fdReturnPct: number; // FD rate
  marketReturnPct: number; // your market/trading return on the rest
  payments: { year: number; amount: number }[]; // the flat's installment plan
  flipCash: number; // property outcome at exit (PropResult.propertyEnd)
  horizon: number; // exit year (PropResult.horizon)
}

export interface CombinedYear {
  year: number;
  openingCorpus: number; // money in hand at the start of the year
  installment: number; // that year's 15% payment to the builder
  invested: number; // what's left after paying, which you deploy
  fdStart: number; // FD slice of the invested amount
  mktStart: number; // market slice of the invested amount
  fdGain: number; // FD return earned that year
  mktGain: number; // market return earned that year
  gain: number; // total return earned that year
  corpusEnd: number; // invested + returns → carried to next year
}

export interface CombinedResult {
  blendedPct: number; // blended return on the leftover corpus
  horizon: number;
  installmentsPaid: number; // total installments paid by exit
  affordable: boolean; // corpus never runs dry
  rows: CombinedYear[];
  // Strategy A — buy the flat, invest the rest 30/70
  restEnd: number; // leftover corpus grown to the exit
  flipCash: number;
  totalWealth: number; // restEnd + flipCash
  totalGain: number;
  cagr: number; // return on the whole corpus with the flat
  // Strategy B — no flat, invest the ENTIRE corpus 30/70
  investAllEnd: number;
  investAllCagr: number;
  // Verdict
  edge: number; // totalWealth − investAllEnd
  better: "property" | "invest" | "tie";
  flatAlphaPct: number; // cagr − investAllCagr (extra % per year from the flat)
}

export function combinedReturn(i: CombinedInput): CombinedResult {
  const blendedPct = (i.fdPct / 100) * i.fdReturnPct + (1 - i.fdPct / 100) * i.marketReturnPct;
  const g = blendedPct / 100;
  const h = i.horizon;
  const paid = i.payments.filter((p) => p.year <= h);
  const installmentsPaid = paid.reduce((a, p) => a + p.amount, 0);

  // Year-by-year, exactly as it plays out: pay the year's installment first,
  // then split what's left — a slice into FD, the rest into the market — and
  // each earns its return over the year. The closing balance carries forward.
  const byYear = new Map(paid.map((p) => [p.year, p.amount]));
  const fdW = i.fdPct / 100;
  const mktW = 1 - fdW;
  let corpus = i.corpus;
  let affordable = true;
  const rows: CombinedYear[] = [];
  for (let y = 1; y <= h; y++) {
    const opening = corpus;
    const inst = byYear.get(y) ?? 0;
    const invested = opening - inst; // remaining after paying the builder
    if (invested < 0) affordable = false;
    const fdStart = invested * fdW;
    const mktStart = invested * mktW;
    const fdGain = fdStart * (i.fdReturnPct / 100);
    const mktGain = mktStart * (i.marketReturnPct / 100);
    corpus = invested + fdGain + mktGain;
    rows.push({
      year: y,
      openingCorpus: opening,
      installment: inst,
      invested,
      fdStart,
      mktStart,
      fdGain,
      mktGain,
      gain: fdGain + mktGain,
      corpusEnd: corpus,
    });
  }
  const restEnd = corpus;
  const totalWealth = restEnd + i.flipCash;
  const investAllEnd = i.corpus * Math.pow(1 + g, h);

  const cagr = (Math.pow(totalWealth / i.corpus, 1 / h) - 1) * 100;
  const investAllCagr = blendedPct;
  const edge = totalWealth - investAllEnd;
  const better = Math.abs(edge) < i.corpus * 0.01 ? "tie" : edge > 0 ? "property" : "invest";

  return {
    blendedPct,
    horizon: h,
    installmentsPaid,
    affordable,
    rows,
    restEnd,
    flipCash: i.flipCash,
    totalWealth,
    totalGain: totalWealth - i.corpus,
    cagr,
    investAllEnd,
    investAllCagr,
    edge,
    better,
    flatAlphaPct: cagr - investAllCagr,
  };
}

/** A construction-linked schedule paying a flat % of the base price each year. */
export function linearSchedule(purchase: number, years: number, pctPerYear: number): { year: number; amount: number }[] {
  const rows: { year: number; amount: number }[] = [];
  let remaining = purchase;
  for (let y = 1; y <= years; y++) {
    const raw = purchase * (pctPerYear / 100);
    const amt = y === years ? remaining : Math.min(raw, remaining);
    rows.push({ year: y, amount: Math.round(amt / 1000) * 1000 });
    remaining -= amt;
  }
  return rows;
}

/** Front-light, back-heavy default (booking + slabs, big slug near possession). */
export function defaultSchedule(purchase: number, years: number): { year: number; amount: number }[] {
  const weights = years >= 5 ? [0.1, 0.14, 0.18, 0.18, 0.4] : [0.15, 0.2, 0.25, 0.4];
  const w = weights.slice(0, years);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x, idx) => ({ year: idx + 1, amount: Math.round((purchase * x) / total / 1000) * 1000 }));
}
