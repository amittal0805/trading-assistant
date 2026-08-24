// In-app "learning" intelligence for the Action Board. It doesn't predict —
// it accumulates a daily price memory (see store.priceHistory) and, from that,
// (1) flags moves that are unusual for each stock's own recent behaviour,
// (2) writes a plain-language daily read, and (3) scores how the board's past
// buy/sell calls actually worked out (a real feedback loop). All descriptive,
// not investment advice.

import type { PricePoint, SignalRecord } from "./store";

export interface SeriesStats {
  n: number;
  last: number;
  dayChangePct: number | null;
  streak: number; // consecutive days same direction (+ up / − down)
  stdMove: number; // std dev of daily % moves over the window
  unusual: string | null; // reason today's move is unusual, else null
}

function pctMoves(series: PricePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1].p;
    const b = series[i].p;
    if (a > 0) out.push(((b - a) / a) * 100);
  }
  return out;
}

export function seriesStats(series: PricePoint[], window = 20): SeriesStats {
  const n = series.length;
  const last = n ? series[n - 1].p : 0;
  if (n < 2) return { n, last, dayChangePct: null, streak: 0, stdMove: 0, unusual: null };

  const moves = pctMoves(series);
  const dayChangePct = moves[moves.length - 1];

  // Direction streak.
  let streak = 0;
  for (let i = moves.length - 1; i >= 0; i--) {
    const s = Math.sign(moves[i]);
    if (s === 0) break;
    if (streak === 0 || Math.sign(streak) === s) streak += s;
    else break;
  }

  // Volatility of the window.
  const w = moves.slice(-window);
  const mean = w.reduce((a, x) => a + x, 0) / w.length;
  const stdMove = Math.sqrt(w.reduce((a, x) => a + (x - mean) ** 2, 0) / w.length) || 0;

  // Window high/low on price.
  const wp = series.slice(-window).map((x) => x.p);
  const hi = Math.max(...wp);
  const lo = Math.min(...wp);

  let unusual: string | null = null;
  if (n >= 8) {
    if (last >= hi && dayChangePct > 0) unusual = `new ${window}-day high`;
    else if (last <= lo && dayChangePct < 0) unusual = `new ${window}-day low`;
    else if (stdMove > 0 && Math.abs(dayChangePct) >= 2 * stdMove && Math.abs(dayChangePct) >= 2)
      unusual = `${dayChangePct > 0 ? "jumped" : "dropped"} ${Math.abs(dayChangePct).toFixed(1)}% — ~${Math.round(Math.abs(dayChangePct) / stdMove)}× its normal daily move`;
    else if (Math.abs(streak) >= 4) unusual = `${streak > 0 ? "up" : "down"} ${Math.abs(streak)} days in a row`;
  }

  return { n, last, dayChangePct, streak, stdMove, unusual };
}

export interface CallScore {
  n: number;
  wins: number;
  winRate: number;
}
export interface Scorecard {
  buys: CallScore;
  sells: CallScore;
  overall: CallScore;
  resolved: number;
  pending: number;
}

const empty = (): CallScore => ({ n: 0, wins: 0, winRate: 0 });

// Resolve each logged call against the next available price after it was made.
export function scoreSignals(log: SignalRecord[], history: Record<string, PricePoint[]>): Scorecard {
  const buys = empty();
  const sells = empty();
  let resolved = 0;
  let pending = 0;

  for (const r of log) {
    const pts = history[r.symbol];
    const nxt = pts?.find((p) => p.d > r.date);
    if (!nxt) {
      pending++;
      continue;
    }
    resolved++;
    const win =
      r.kind === "buy"
        ? nxt.p > r.refPrice
        : r.target != null
        ? nxt.p >= r.target // sell target was reachable
        : nxt.p < r.refPrice; // exit call: good if it then fell
    const bucket = r.kind === "buy" ? buys : sells;
    bucket.n++;
    if (win) bucket.wins++;
  }

  buys.winRate = buys.n ? (buys.wins / buys.n) * 100 : 0;
  sells.winRate = sells.n ? (sells.wins / sells.n) * 100 : 0;
  const overall: CallScore = {
    n: buys.n + sells.n,
    wins: buys.wins + sells.wins,
    winRate: buys.n + sells.n ? ((buys.wins + sells.wins) / (buys.n + sells.n)) * 100 : 0,
  };
  return { buys, sells, overall, resolved, pending };
}

export interface Flag {
  symbol: string;
  reason: string;
  pct: number;
}
export interface MarketRead {
  days: number; // longest memory depth
  symbols: number;
  up: number;
  down: number;
  flat: number;
  flags: Flag[];
  lines: string[];
}

export function marketRead(history: Record<string, PricePoint[]>, symbols: string[]): MarketRead {
  let up = 0,
    down = 0,
    flat = 0,
    days = 0,
    tracked = 0;
  let topG: Flag | null = null;
  let topL: Flag | null = null;
  const flags: Flag[] = [];

  for (const sym of symbols) {
    const s = history[sym];
    if (!s || s.length === 0) continue;
    tracked++;
    days = Math.max(days, s.length);
    const st = seriesStats(s);
    const chg = st.dayChangePct;
    if (chg == null) continue;
    if (chg > 0.2) up++;
    else if (chg < -0.2) down++;
    else flat++;
    if (!topG || chg > topG.pct) topG = { symbol: sym, reason: "top gainer", pct: chg };
    if (!topL || chg < topL.pct) topL = { symbol: sym, reason: "top loser", pct: chg };
    if (st.unusual) flags.push({ symbol: sym, reason: st.unusual, pct: chg });
  }
  flags.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const lines: string[] = [];
  lines.push(`Tracking ${tracked} stock${tracked === 1 ? "" : "s"} with up to ${days} day${days === 1 ? "" : "s"} of price memory.`);
  if (up + down + flat > 0) lines.push(`Latest session: ${up} up, ${down} down${flat ? `, ${flat} flat` : ""}.`);
  if (topG && topL && topG.symbol !== topL.symbol)
    lines.push(`Biggest moves: ${topG.symbol} ${topG.pct >= 0 ? "+" : ""}${topG.pct.toFixed(1)}%, ${topL.symbol} ${topL.pct.toFixed(1)}%.`);
  if (flags.length) lines.push(`${flags.length} stock${flags.length === 1 ? "" : "s"} moving unusually vs their own history — see below.`);
  if (days < 3) lines.push("Memory is still shallow — open the board daily and the reads sharpen as history builds.");

  return { days, symbols: tracked, up, down, flat, flags: flags.slice(0, 10), lines };
}
