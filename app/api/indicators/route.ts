import { NextRequest, NextResponse } from "next/server";
import { yahooChart } from "@/lib/server";
import { sma, rsi } from "@/lib/indicators";
import { analyzeCandles } from "@/lib/candles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Daily technical indicators for a set of instruments (Yahoo symbols, e.g. TCS.NS).
// Returns 50/200-day moving averages, RSI(14), 52-week high/low, last price, and a
// breakout study computed on daily candles using the standard screening criteria:
// proximity to the 52-week high, consolidation tightness (20d), volume surge vs
// the 50d average, trend alignment, an RSI 50–70 band, and recent bullish
// daily candle patterns.

export interface Indicator {
  price: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  high52: number | null;
  low52: number | null;
  breakout: BreakoutStudy | null;
}

export interface BreakoutStudy {
  score: number; // 0–100
  verdict: "setup" | "watch" | "none";
  distHighPct: number; // % below 52-week high
  tightnessPct: number; // 20-day range as % of price
  volSurge: number; // 5d avg volume ÷ 50d avg volume
  trendAligned: boolean; // price > 50DMA > 200DMA
  patterns: string[]; // bullish daily patterns in the last 3 candles
  signals: string[]; // human-readable reasons
}

const cache = new Map<string, { data: Indicator; ts: number }>();
const TTL = 15 * 60_000; // 15 minutes — DMAs move slowly

const clean = (arr: (number | null)[] | undefined) =>
  (arr ?? []).filter((v): v is number => typeof v === "number" && isFinite(v));

function breakoutStudy(
  price: number,
  sma50v: number | null,
  sma200v: number | null,
  rsiV: number | null,
  high52: number,
  highs: number[],
  lows: number[],
  closes: number[],
  opens: number[],
  volumes: number[],
  times: number[]
): BreakoutStudy {
  const signals: string[] = [];
  let score = 0;

  // 1) Proximity to the 52-week high (standard screens use within ~3–5%).
  const distHighPct = high52 > 0 ? ((high52 - price) / high52) * 100 : 100;
  if (distHighPct <= 3) {
    score += 30;
    signals.push(`within ${distHighPct.toFixed(1)}% of its 52-week high`);
  } else if (distHighPct <= 7) {
    score += 20;
    signals.push(`${distHighPct.toFixed(1)}% below its 52-week high`);
  } else if (distHighPct <= 12) {
    score += 10;
  }

  // 2) Consolidation tightness: 20-day range as % of price (tight base ≤ ~8%).
  const h20 = highs.slice(-20);
  const l20 = lows.slice(-20);
  const tightnessPct =
    h20.length >= 10 && price > 0 ? ((Math.max(...h20) - Math.min(...l20)) / price) * 100 : 100;
  if (tightnessPct <= 8) {
    score += 20;
    signals.push(`tight ${tightnessPct.toFixed(1)}% consolidation over 20 days`);
  } else if (tightnessPct <= 12) {
    score += 10;
    signals.push(`consolidating in a ${tightnessPct.toFixed(1)}% band`);
  }

  // 3) Volume surge: 5-day avg vs 50-day avg (breakouts need volume).
  const v = volumes.filter((x) => isFinite(x) && x > 0);
  const v5 = v.slice(-5);
  const v50 = v.slice(-50);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const volSurge = avg(v50) > 0 ? avg(v5) / avg(v50) : 0;
  if (volSurge >= 1.5) {
    score += 15;
    signals.push(`volume ${volSurge.toFixed(1)}× its 50-day average`);
  } else if (volSurge >= 1.2) {
    score += 8;
    signals.push(`volume picking up (${volSurge.toFixed(1)}×)`);
  }

  // 4) Trend alignment: price above the 50DMA above the 200DMA.
  const trendAligned = sma50v != null && sma200v != null && price > sma50v && sma50v > sma200v;
  if (trendAligned) {
    score += 20;
    signals.push("uptrend intact (price > 50DMA > 200DMA)");
  } else if (sma50v != null && price > sma50v) {
    score += 10;
  }

  // 5) RSI in the 50–70 strength band (not yet overbought).
  if (rsiV != null) {
    if (rsiV >= 55 && rsiV <= 70) {
      score += 10;
      signals.push(`RSI ${rsiV.toFixed(0)} — strong but not overbought`);
    } else if (rsiV >= 50 && rsiV < 55) score += 5;
    else if (rsiV > 75) signals.push(`RSI ${rsiV.toFixed(0)} — already overbought`);
  }

  // 6) Bullish daily candle patterns over the last 3 sessions.
  const n = closes.length;
  const start = Math.max(0, n - 6);
  const bars = [];
  for (let i = start; i < n; i++) {
    if ([opens[i], highs[i], lows[i], closes[i]].every((x) => isFinite(x))) {
      bars.push({ t: times[i] ?? i, o: opens[i], h: highs[i], l: lows[i], c: closes[i], v: volumes[i] ?? 0 });
    }
  }
  const candles = analyzeCandles(bars);
  const patterns = candles
    .slice(-3)
    .flatMap((c) => c.patterns.filter((p) => p.bias === "bullish").map((p) => p.name));
  if (patterns.length) {
    score += 5;
    signals.push(`bullish candle: ${Array.from(new Set(patterns)).join(", ")}`);
  }

  score = Math.min(100, score);
  return {
    score,
    verdict: score >= 70 ? "setup" : score >= 50 ? "watch" : "none",
    distHighPct,
    tightnessPct,
    volSurge,
    trendAligned,
    patterns: Array.from(new Set(patterns)),
    signals,
  };
}

async function computeOne(symbol: string): Promise<Indicator> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const res = await yahooChart(symbol, "1y", "1d");
  const quote = res?.indicators?.quote?.[0] ?? {};
  const closes = clean(quote.close);
  const highs = clean(quote.high);
  const lows = clean(quote.low);
  const opens = clean(quote.open);
  const volumes = (quote.volume ?? []).map((x: number | null) => (typeof x === "number" && isFinite(x) ? x : 0));
  const times: number[] = (res?.timestamp ?? []).map((t: number) => t * 1000);
  const meta = res?.meta ?? {};

  const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1] ?? null;
  const sma50v = sma(closes, 50);
  const sma200v = sma(closes, 200);
  const rsiV = rsi(closes, 14);
  const high52 = highs.length ? Math.max(...highs) : closes.length ? Math.max(...closes) : null;

  const data: Indicator = {
    price,
    sma50: sma50v,
    sma200: sma200v,
    rsi: rsiV,
    high52,
    low52: lows.length ? Math.min(...lows) : closes.length ? Math.min(...closes) : null,
    breakout:
      price != null && high52 != null && closes.length >= 30
        ? breakoutStudy(price, sma50v, sma200v, rsiV, high52, highs, lows, closes, opens, volumes, times)
        : null,
  };
  cache.set(symbol, { data, ts: Date.now() });
  return data;
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 120);
  if (symbols.length === 0) return NextResponse.json({ data: {} });

  const out: Record<string, Indicator> = {};
  // Limit concurrency so we don't hammer Yahoo.
  const BATCH = 8;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const chunk = symbols.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map((s) => computeOne(s).catch(() => null)));
    chunk.forEach((s, j) => {
      if (results[j]) out[s] = results[j] as Indicator;
    });
  }
  return NextResponse.json({ data: out });
}
