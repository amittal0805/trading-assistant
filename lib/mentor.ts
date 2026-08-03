// A rules-based "trading mentor" — turns a position's numbers + technicals into
// a candid read: what's going right, what went wrong, and what to watch. Pure
// heuristics over your actual data (no network, deterministic).

export interface MentorInput {
  symbol: string;
  qty: number;
  avg: number; // your average cost
  ltp: number; // current price
  prevClose?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  rsi?: number | null;
  high52?: number | null;
  low52?: number | null;
  sector?: string | null; // basket/sector membership
  positionValue?: number; // ₹ in this name
  portfolioValue?: number; // ₹ total equity (for concentration)
}

export type Trend = "uptrend" | "downtrend" | "sideways" | "unknown";

export interface MentorRead {
  headline: string;
  trend: Trend;
  pl: number;
  plPct: number;
  dayPct: number | null;
  rangePct: number | null; // position in 52-week range
  rights: string[];
  wrongs: string[];
  watch: string[];
  summary: string;
}

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

function trendOf(ltp: number, sma50?: number | null, sma200?: number | null): Trend {
  if (sma50 == null || sma200 == null) return "unknown";
  if (ltp > sma50 && sma50 >= sma200) return "uptrend";
  if (ltp < sma50 && sma50 <= sma200) return "downtrend";
  return "sideways";
}

export function mentor(i: MentorInput): MentorRead {
  const pl = (i.ltp - i.avg) * i.qty;
  const plPct = i.avg ? ((i.ltp - i.avg) / i.avg) * 100 : 0;
  const dayPct = i.prevClose && i.prevClose > 0 ? ((i.ltp - i.prevClose) / i.prevClose) * 100 : null;
  const trend = trendOf(i.ltp, i.sma50, i.sma200);
  const rangePct =
    i.high52 != null && i.low52 != null && i.high52 > i.low52
      ? ((i.ltp - i.low52) / (i.high52 - i.low52)) * 100
      : null;
  const concPct = i.portfolioValue && i.positionValue ? (i.positionValue / i.portfolioValue) * 100 : null;
  const vs200 = i.sma200 ? ((i.ltp - i.sma200) / i.sma200) * 100 : null;

  const rights: string[] = [];
  const wrongs: string[] = [];
  const watch: string[] = [];

  const winning = plPct > 0;
  const losing = plPct < 0;

  // Trend alignment — the core of the read.
  if (winning && trend === "uptrend")
    rights.push(
      `You're up ${plPct.toFixed(1)}% and ${i.symbol} is in a clean uptrend (above both the 50 & 200 DMA). Holding a winner that the trend supports is exactly right — let it run and trail a stop rather than booking early.`
    );
  if (losing && trend === "downtrend")
    wrongs.push(
      `You're down ${plPct.toFixed(1)}% and price is below both the 50 & 200 DMA — you're holding a downtrend. This is where losses compound; the chart isn't backing the position. Decide on an exit level instead of hoping for a reversal.`
    );
  if (losing && vs200 != null && vs200 < 0)
    wrongs.push(
      `${i.symbol} is ${Math.abs(vs200).toFixed(0)}% below its 200-day average. Averaging down into a stock under its long-term trend is what usually deepens drawdowns — add only with a fresh, specific thesis.`
    );
  if (winning && trend === "sideways")
    watch.push(`Up ${plPct.toFixed(1)}%, but the trend is sideways (price between the 50 & 200 DMA) — momentum is unconfirmed; keep expectations modest.`);

  // Drawdown discipline.
  if (plPct <= -15)
    wrongs.push(
      `A ${Math.abs(plPct).toFixed(0)}% unrealised loss (${inr(pl)}) suggests the stop was too loose or missing. Define your exit before the next entry so one position can't do this much damage.`
    );
  else if (plPct >= 20 && trend === "uptrend")
    rights.push(`Sitting on a ${plPct.toFixed(0)}% gain in an uptrend — good trade selection. Protect it with a trailing stop so a reversal doesn't erase the win.`);

  // RSI.
  if (i.rsi != null) {
    if (i.rsi >= 75 && winning)
      watch.push(`RSI is ${i.rsi.toFixed(0)} (overbought) while you're in profit — consider booking part of the position; sharp pullbacks are common from here.`);
    else if (i.rsi <= 28)
      watch.push(`RSI is ${i.rsi.toFixed(0)} (oversold). A technical bounce is possible, but don't add without a reversal signal — oversold can stay oversold in a downtrend.`);
  }

  // 52-week range.
  if (rangePct != null) {
    if (rangePct >= 85 && winning)
      rights.push(`Trading near its 52-week high (${rangePct.toFixed(0)}% of range) with you onside — momentum is on your side.`);
    if (rangePct <= 15)
      watch.push(`Near its 52-week low (${rangePct.toFixed(0)}% of range) — this is a weak chart; only hold if your fundamental thesis is genuinely intact.`);
  }

  // Concentration / sizing.
  if (concPct != null && concPct >= 15)
    watch.push(`${i.symbol} is ${concPct.toFixed(0)}% of your equity — that's concentrated; a single-stock shock would move your whole book. Size with that in mind.`);

  // Extension.
  if (vs200 != null && vs200 > 40 && winning)
    watch.push(`Price is ${vs200.toFixed(0)}% above the 200 DMA — stretched. Mean-reversion risk is elevated; this is a place to take some off, not add.`);

  // Day move context.
  if (dayPct != null && Math.abs(dayPct) >= 4)
    watch.push(`${dayPct >= 0 ? "Up" : "Down"} ${Math.abs(dayPct).toFixed(1)}% today — an outsized move; avoid reacting emotionally to a single session.`);

  // Fallbacks so each column says something useful.
  if (rights.length === 0) {
    if (winning) rights.push(`You're in profit on ${i.symbol} (${inr(pl)}). Keeping a positive position is the easy part — the discipline is deciding where you'd exit.`);
    else rights.push(`No obvious process errors flagged from the data — the setup itself may just need more time or a tighter plan.`);
  }
  if (wrongs.length === 0 && losing)
    wrongs.push(`You're down ${Math.abs(plPct).toFixed(1)}% but the trend isn't broken — watch your 50-DMA as the line that would confirm a real problem.`);
  if (watch.length === 0) watch.push(`Set a clear invalidation level and a target, and write down why you're in the trade — that's what turns this into a repeatable process.`);

  const trendWord =
    trend === "uptrend" ? "in an uptrend" : trend === "downtrend" ? "in a downtrend" : trend === "sideways" ? "trending sideways" : "with no clear trend";
  const headline = `${i.symbol} — ${winning ? "up" : losing ? "down" : "flat"} ${plPct.toFixed(1)}%, ${trendWord}`;
  const summary =
    `${i.symbol}: ${i.qty} @ ${inr(i.avg)} vs ${inr(i.ltp)} → ${inr(pl)} (${plPct.toFixed(1)}%). ` +
    `${trend === "uptrend" ? "Trend supports the position." : trend === "downtrend" ? "Trend is against you." : "Trend is unclear."}` +
    (i.sector ? ` Part of your ${i.sector} basket.` : "");

  return { headline, trend, pl, plPct, dayPct, rangePct, rights, wrongs, watch, summary };
}
