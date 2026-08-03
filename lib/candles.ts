// Candlestick anatomy + pattern recognition over 15-minute bars, with
// plain-language teaching notes — built for learning to read the tape.

import type { Bar } from "@/app/api/intraday/route";

export interface CandleInfo {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  bull: boolean;
  range: number; // high - low
  bodyPct: number; // body as % of range
  upperPct: number; // upper wick as % of range
  lowerPct: number; // lower wick as % of range
  patterns: PatternHit[];
}

export interface PatternHit {
  name: string;
  bias: "bullish" | "bearish" | "neutral";
  note: string; // what it means / what to learn
}

const body = (b: Bar) => Math.abs(b.c - b.o);
const range = (b: Bar) => Math.max(b.h - b.l, 1e-9);
const upperWick = (b: Bar) => b.h - Math.max(b.o, b.c);
const lowerWick = (b: Bar) => Math.min(b.o, b.c) - b.l;
const bull = (b: Bar) => b.c >= b.o;

/** Single-candle patterns. */
function singlePatterns(b: Bar): PatternHit[] {
  const hits: PatternHit[] = [];
  const r = range(b);
  const bd = body(b) / r;
  const up = upperWick(b) / r;
  const lo = lowerWick(b) / r;

  if (bd <= 0.1) {
    if (lo >= 0.6 && up <= 0.15) {
      hits.push({
        name: "Dragonfly Doji",
        bias: "bullish",
        note: "Tiny body at the top with a long lower wick — sellers drove it down but buyers reclaimed everything. A bullish rejection of lower prices.",
      });
    } else if (up >= 0.6 && lo <= 0.15) {
      hits.push({
        name: "Gravestone Doji",
        bias: "bearish",
        note: "Tiny body at the bottom with a long upper wick — buyers drove it up but sellers erased it all. A bearish rejection of higher prices.",
      });
    } else {
      hits.push({
        name: "Doji",
        bias: "neutral",
        note: "Open ≈ close — indecision. Buyers and sellers fought to a draw; the next candle usually decides the direction.",
      });
    }
  } else if (bd >= 0.85) {
    hits.push({
      name: bull(b) ? "Bullish Marubozu" : "Bearish Marubozu",
      bias: bull(b) ? "bullish" : "bearish",
      note: bull(b)
        ? "Almost all body, no wicks — buyers controlled the entire 15 minutes. Strong conviction candle."
        : "Almost all body, no wicks — sellers controlled the entire 15 minutes. Strong selling conviction.",
    });
  } else if (lo >= 0.6 && bd <= 0.35 && up <= 0.15) {
    hits.push({
      name: "Hammer",
      bias: "bullish",
      note: "Long lower wick — sellers pushed price down but buyers bought it all back. After a dip, this often marks the low.",
    });
  } else if (up >= 0.6 && bd <= 0.35 && lo <= 0.15) {
    hits.push({
      name: "Shooting Star",
      bias: "bearish",
      note: "Long upper wick — buyers pushed up but sellers slammed it back. After a rise, this often marks the top.",
    });
  } else if (bd <= 0.3 && up >= 0.25 && lo >= 0.25) {
    hits.push({
      name: "Spinning Top",
      bias: "neutral",
      note: "Small body, wicks both sides — a tug of war. Momentum is stalling; watch for the breakout candle.",
    });
  }
  return hits;
}

/** Two- and three-candle patterns (checked at candle i). */
function multiPatterns(bars: Bar[], i: number): PatternHit[] {
  const hits: PatternHit[] = [];
  const b = bars[i];
  const p = bars[i - 1];
  if (!p) return hits;

  const pBody = body(p);
  const bBody = body(b);

  // Engulfing: current body swallows previous body, opposite colors.
  if (pBody > 0 && bBody > pBody * 1.1) {
    const engulfs = Math.max(b.o, b.c) >= Math.max(p.o, p.c) && Math.min(b.o, b.c) <= Math.min(p.o, p.c);
    if (engulfs && bull(b) && !bull(p)) {
      hits.push({
        name: "Bullish Engulfing",
        bias: "bullish",
        note: "A green body that swallows the prior red body — buyers overwhelmed the sellers. Stronger after a decline.",
      });
    } else if (engulfs && !bull(b) && bull(p)) {
      hits.push({
        name: "Bearish Engulfing",
        bias: "bearish",
        note: "A red body that swallows the prior green body — sellers overwhelmed the buyers. Stronger after a rally.",
      });
    }
  }

  // Harami: current body inside previous (large) body.
  if (pBody > 0 && bBody < pBody * 0.5) {
    const inside = Math.max(b.o, b.c) <= Math.max(p.o, p.c) && Math.min(b.o, b.c) >= Math.min(p.o, p.c);
    if (inside && pBody / range(p) > 0.5) {
      hits.push({
        name: bull(b) ? "Bullish Harami" : "Bearish Harami",
        bias: bull(b) ? "bullish" : "bearish",
        note: "A small candle inside the prior big one — momentum pausing. Often precedes a reversal of the prior move.",
      });
    }
  }

  // Three-candle: morning/evening star (simplified).
  const p2 = bars[i - 2];
  if (p2) {
    const smallMid = body(p) / range(p) <= 0.3;
    if (!bull(p2) && smallMid && bull(b) && b.c > (p2.o + p2.c) / 2) {
      hits.push({
        name: "Morning Star",
        bias: "bullish",
        note: "Down candle → indecision → strong up candle reclaiming the drop. A classic bottoming sequence.",
      });
    }
    if (bull(p2) && smallMid && !bull(b) && b.c < (p2.o + p2.c) / 2) {
      hits.push({
        name: "Evening Star",
        bias: "bearish",
        note: "Up candle → indecision → strong down candle giving it back. A classic topping sequence.",
      });
    }
  }

  // Three soldiers / crows.
  if (p2 && i >= 2) {
    const three = [p2, p, b];
    const decentBodies = three.every((x) => body(x) / range(x) >= 0.5);
    if (decentBodies && three.every(bull) && p.c > p2.c && b.c > p.c) {
      hits.push({
        name: "Three White Soldiers",
        bias: "bullish",
        note: "Three solid green candles, each closing higher — persistent buying. Trend continuation signal.",
      });
    }
    if (decentBodies && three.every((x) => !bull(x)) && p.c < p2.c && b.c < p.c) {
      hits.push({
        name: "Three Black Crows",
        bias: "bearish",
        note: "Three solid red candles, each closing lower — persistent selling. Trend continuation signal.",
      });
    }
  }
  return hits;
}

export function analyzeCandles(bars: Bar[]): CandleInfo[] {
  return bars.map((b, i) => {
    const r = range(b);
    const patterns = [...singlePatterns(b), ...multiPatterns(bars, i)];
    return {
      t: b.t,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.v,
      bull: bull(b),
      range: r,
      bodyPct: (body(b) / r) * 100,
      upperPct: (upperWick(b) / r) * 100,
      lowerPct: (lowerWick(b) / r) * 100,
      patterns,
    };
  });
}

/** Distinct patterns spotted in the session, most recent first. */
export function patternsSpotted(candles: CandleInfo[]): { time: number; hit: PatternHit }[] {
  const out: { time: number; hit: PatternHit }[] = [];
  for (const c of candles) for (const hit of c.patterns) out.push({ time: c.t, hit });
  return out.reverse();
}
