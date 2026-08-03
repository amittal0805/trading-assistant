// Turns 15-minute candles into a written intraday read — no chart, just words.

import type { Bar } from "@/app/api/intraday/route";

export interface Interval {
  label: string; // HH:MM (IST)
  close: number;
  changePct: number; // close vs previous bar close (or open for the first)
  dir: "up" | "down" | "flat";
  strong: boolean; // outsized move
  volSpike: boolean;
  note: string;
}

export interface IntradayRead {
  open: number;
  last: number;
  high: number;
  low: number;
  vwap: number;
  dayChangePct: number;
  fromVwapPct: number;
  trend: "up" | "down" | "choppy";
  summary: string[]; // narrative paragraphs
  intervals: Interval[];
  barCount: number;
}

const timeIST = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const rupee = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function analyzeIntraday(symbol: string, bars: Bar[], prevClose: number | null): IntradayRead | null {
  if (!bars || bars.length < 2) return null;

  const open = bars[0].o;
  const last = bars[bars.length - 1].c;
  const high = Math.max(...bars.map((b) => b.h));
  const low = Math.min(...bars.map((b) => b.l));
  const base = prevClose ?? open;
  const dayChangePct = base ? ((last - base) / base) * 100 : 0;

  // VWAP.
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3;
    const v = b.v || 0;
    pv += typical * v;
    vol += v;
  }
  const vwap = vol > 0 ? pv / vol : (high + low + last) / 3;
  const fromVwapPct = vwap ? ((last - vwap) / vwap) * 100 : 0;
  const avgVol = vol / bars.length;

  // Per-interval breakdown.
  const intervals: Interval[] = bars.map((b, i) => {
    const prev = i === 0 ? b.o : bars[i - 1].c;
    const changePct = prev ? ((b.c - prev) / prev) * 100 : 0;
    const dir: Interval["dir"] = changePct > 0.05 ? "up" : changePct < -0.05 ? "down" : "flat";
    const strong = Math.abs(changePct) >= 0.6;
    const volSpike = avgVol > 0 && (b.v || 0) >= avgVol * 1.6;
    const parts: string[] = [];
    parts.push(
      dir === "up"
        ? `${strong ? "jumped" : "rose"} ${pct(changePct)} to ${rupee(b.c)}`
        : dir === "down"
        ? `${strong ? "dropped" : "eased"} ${pct(changePct)} to ${rupee(b.c)}`
        : `held around ${rupee(b.c)}`
    );
    if (volSpike) parts.push("on heavy volume");
    return { label: timeIST(b.t), close: b.c, changePct, dir, strong, volSpike, note: parts.join(" ") };
  });

  // Trend classification.
  const ups = intervals.filter((x) => x.dir === "up").length;
  const downs = intervals.filter((x) => x.dir === "down").length;
  const netFromOpen = open ? ((last - open) / open) * 100 : 0;
  let trend: IntradayRead["trend"] = "choppy";
  if (netFromOpen > 0.3 && ups >= downs) trend = "up";
  else if (netFromOpen < -0.3 && downs >= ups) trend = "down";

  // Narrative.
  const summary: string[] = [];
  const gapTxt = prevClose ? ` (previous close ${rupee(prevClose)}, a ${pct(((open - prevClose) / prevClose) * 100)} ${open >= prevClose ? "gap-up" : "gap-down"} open)` : "";
  summary.push(`${symbol} opened at ${rupee(open)}${gapTxt}. Through the session it has traded between ${rupee(low)} and ${rupee(high)}, and is now at ${rupee(last)} — ${pct(dayChangePct)} on the day.`);

  const firstThird = intervals.slice(0, Math.max(1, Math.ceil(intervals.length / 3)));
  const morningNet = firstThird.length ? firstThird[firstThird.length - 1].close - open : 0;
  summary.push(
    `The first ${firstThird.length} candle${firstThird.length > 1 ? "s" : ""} (to ${firstThird[firstThird.length - 1].label}) ${
      morningNet > 0 ? "pushed higher" : morningNet < 0 ? "leaked lower" : "went sideways"
    }, setting the early tone. ${ups} of ${intervals.length} fifteen-minute candles closed up and ${downs} closed down.`
  );

  const lastFew = intervals.slice(-3);
  const recentNet = lastFew.length >= 2 ? lastFew[lastFew.length - 1].close - lastFew[0].close : 0;
  summary.push(
    `Most recently (${lastFew[0].label}–${lastFew[lastFew.length - 1].label}) it is ${
      recentNet > 0 ? "gaining momentum" : recentNet < 0 ? "losing steam" : "flat"
    }, and price is ${fromVwapPct >= 0 ? "above" : "below"} the session VWAP of ${rupee(vwap)} (${pct(fromVwapPct)}).`
  );

  const verdict =
    trend === "up"
      ? `Net read: an intraday uptrend — buyers in control, holding above VWAP is the sign to watch.`
      : trend === "down"
      ? `Net read: an intraday downtrend — sellers in control; reclaiming VWAP would be the first sign of a turn.`
      : `Net read: choppy / range-bound — no clear intraday edge; ${rupee(low)} and ${rupee(high)} are the levels to break.`;
  summary.push(verdict);

  return { open, last, high, low, vwap, dayChangePct, fromVwapPct, trend, summary, intervals, barCount: bars.length };
}
