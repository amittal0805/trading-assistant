// BTST (Buy Today, Sell Tomorrow) analysis.
//
// Two halves:
//  1) Your history — from the tradebook round-trips, find trades held exactly
//     one trading session (bought day T, sold T+1) and score how that style did.
//  2) Tomorrow's candidates — a stock that closes strong (near the day's high, on
//     rising volume, with a bullish daily candle) tends to follow through the next
//     morning; that's the classic BTST setup, scored on the daily bar.

import type { RoundTrip } from "./tradebook";
import { netPnl, Broker, Exchange } from "./charges";
import { requiredExitPrice } from "./calc";

/** Whole trading days between two YYYY-MM-DD dates (weekends excluded). */
export function tradingDaysBetween(a: string, b: string): number {
  const start = new Date(a + "T00:00:00Z");
  const end = new Date(b + "T00:00:00Z");
  if (!(end > start)) return 0;
  let days = 0;
  const d = new Date(start);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return days;
}

export interface BtstStats {
  trades: RoundTrip[];
  n: number;
  wins: number;
  winRate: number;
  net: number;
  gross: number;
  charges: number;
  avgPct: number; // average % move captured
  best: RoundTrip | null;
  worst: RoundTrip | null;
  bySymbol: { symbol: string; n: number; net: number; winRate: number }[];
}

/** Round-trips that were bought and sold one trading session apart (BTST). */
export function btstFromRoundTrips(rts: RoundTrip[]): BtstStats {
  const trades = rts.filter(
    (r) => r.openDate !== r.closeDate && r.direction === "buy-first" && tradingDaysBetween(r.openDate, r.closeDate) === 1
  );
  const n = trades.length;
  const wins = trades.filter((r) => r.net > 0).length;
  const net = trades.reduce((a, r) => a + r.net, 0);
  const gross = trades.reduce((a, r) => a + r.gross, 0);
  const charges = trades.reduce((a, r) => a + r.charges, 0);
  const avgPct = n ? trades.reduce((a, r) => a + ((r.closePx - r.openPx) / r.openPx) * 100, 0) / n : 0;
  const sorted = [...trades].sort((a, b) => b.net - a.net);

  const map = new Map<string, { n: number; net: number; wins: number }>();
  for (const r of trades) {
    const g = map.get(r.symbol) ?? { n: 0, net: 0, wins: 0 };
    g.n++;
    g.net += r.net;
    if (r.net > 0) g.wins++;
    map.set(r.symbol, g);
  }
  const bySymbol = Array.from(map.entries())
    .map(([symbol, g]) => ({ symbol, n: g.n, net: g.net, winRate: (g.wins / g.n) * 100 }))
    .sort((a, b) => b.net - a.net);

  return {
    trades,
    n,
    wins,
    winRate: n ? (wins / n) * 100 : 0,
    net,
    gross,
    charges,
    avgPct,
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
    bySymbol,
  };
}

// --- Candidate scoring (uses the daily-candle snapshot in /api/indicators) ---

export interface BtstDaily {
  closePosPct: number; // where the close sat in the day's range (100 = at the high)
  dayChangePct: number;
  volSurge: number; // today's volume ÷ 20-day average
  bullish: boolean; // bullish daily candle pattern today
}

export interface BtstScore {
  score: number; // 0–100
  verdict: "strong" | "watch" | "weak";
  reasons: string[];
}

// --- "Sell tomorrow" plan for an overnight hold (CNC position) ---

export type CloseStrength = "strong" | "neutral" | "weak";

export interface SellPlan {
  breakeven: number; // price that nets ₹0 after delivery charges
  target: number; // suggested limit sell
  stop: number; // exit level if it opens weak
  netAtTarget: number; // net profit if filled at target
  targetPct: number;
  action: string;
}

export function strengthFrom(d: BtstDaily | null | undefined): CloseStrength {
  if (!d) return "neutral";
  if (d.closePosPct >= 78 && d.dayChangePct >= 1) return "strong";
  if (d.closePosPct <= 45 || d.dayChangePct < 0) return "weak";
  return "neutral";
}

export function btstSellPlan(
  entry: number,
  qty: number,
  ltp: number,
  strength: CloseStrength,
  broker: Broker,
  exchange: Exchange
): SellPlan {
  const be = requiredExitPrice({ buyPrice: entry, qty, targetNet: 0, broker, exchange, segment: "delivery" })?.exitPrice ?? entry;
  const targetPct = strength === "strong" ? 2.2 : strength === "weak" ? 0.8 : 1.5;
  let target = entry * (1 + targetPct / 100);
  if (target <= be) target = be * 1.004; // never below breakeven
  const stop = Math.min(entry, isFinite(ltp) && ltp > 0 ? ltp : entry) * 0.99;
  const netAtTarget = netPnl({ buyPrice: entry, sellPrice: target, qty, exchange, segment: "delivery" }, broker).net;

  let action: string;
  if (isFinite(ltp) && ltp >= target) action = "Already at/above target — sell into the open or trail a stop.";
  else if (isFinite(ltp) && ltp <= stop) action = "Opened/closed weak — exit near the open, don't hold for a bounce.";
  else if (strength === "weak") action = "Weak close — book near breakeven at the open, keep it small.";
  else action = `Place a sell limit at ${target.toFixed(2)} (stop ${stop.toFixed(2)}).`;

  return { breakeven: be, target, stop, netAtTarget, targetPct, action };
}

export function btstScore(d: BtstDaily, trendAligned: boolean): BtstScore {
  let score = 0;
  const reasons: string[] = [];
  if (d.closePosPct >= 80) {
    score += 30;
    reasons.push(`closed near the day's high (${d.closePosPct.toFixed(0)}% of range)`);
  } else if (d.closePosPct >= 65) {
    score += 18;
    reasons.push(`firm close (${d.closePosPct.toFixed(0)}% of range)`);
  }
  if (d.dayChangePct >= 3) {
    score += 22;
    reasons.push(`strong day (${d.dayChangePct >= 0 ? "+" : ""}${d.dayChangePct.toFixed(1)}%)`);
  } else if (d.dayChangePct >= 1) {
    score += 12;
    reasons.push(`up ${d.dayChangePct.toFixed(1)}% today`);
  } else if (d.dayChangePct < 0) {
    score -= 10;
  }
  if (d.volSurge >= 2) {
    score += 22;
    reasons.push(`volume ${d.volSurge.toFixed(1)}× the 20-day average`);
  } else if (d.volSurge >= 1.4) {
    score += 12;
    reasons.push(`rising volume (${d.volSurge.toFixed(1)}×)`);
  }
  if (d.bullish) {
    score += 14;
    reasons.push("bullish daily candle");
  }
  if (trendAligned) {
    score += 12;
    reasons.push("in an uptrend");
  }
  score = Math.max(0, Math.min(100, score));
  return { score, verdict: score >= 65 ? "strong" : score >= 45 ? "watch" : "weak", reasons };
}
