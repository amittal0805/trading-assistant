// A rule-based "desk agent" that issues a trading call for a sector basket —
// the same reasoning applied to the Auto exit, generalised: it weighs the live
// sector verdict, each stock's breakout/trend/RSI, your P&L and alpha vs the
// index, and whether the basket is held or already booked. Deterministic, no
// network — descriptive process guidance, not investment advice.

export type Stance =
  | "Accumulate leaders"
  | "Hold & trail"
  | "Trim & prune"
  | "Reduce / de-risk"
  | "Re-enter on dip"
  | "Rebuild"
  | "Stay out"
  | "Hold & be selective";

export type ActionKind = "Add" | "Hold" | "Trim" | "Exit" | "Reduce" | "Re-enter" | "Watch";

export interface AgentStock {
  symbol: string;
  name?: string;
  heldQty: number;
  avg: number;
  price: number;
  dayPct: number | null;
  breakoutScore: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  high52: number | null;
  low52: number | null;
  booked: number; // realized P&L already taken
  exited: boolean; // no longer held but was traded
}

export interface AgentInput {
  name: string;
  verdict: string | null; // sector verdict label (Good buy / Avoid / …)
  indexMom1M: number | null;
  basketPnlPct: number;
  alphaPct: number | null; // basket return minus index since baseline
  stocks: AgentStock[];
}

export interface StockAction {
  symbol: string;
  action: ActionKind;
  tone: "gain" | "amber" | "loss" | "muted";
  note: string;
}

export interface SectorCall {
  stance: Stance;
  tone: "gain" | "amber" | "loss" | "muted";
  headline: string;
  rationale: string[];
  actions: StockAction[];
}

const rupee = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function trend(price: number, s50: number | null, s200: number | null): "up" | "down" | "mixed" | "unknown" {
  if (s50 == null || s200 == null) return "unknown";
  if (price > s50 && s50 >= s200) return "up";
  if (price < s50 && s50 <= s200) return "down";
  return "mixed";
}

function stockAction(s: AgentStock, verdictWeak: boolean): StockAction {
  const t = trend(s.price, s.sma50, s.sma200);
  const rangePct =
    s.high52 != null && s.low52 != null && s.high52 > s.low52
      ? ((s.price - s.low52) / (s.high52 - s.low52)) * 100
      : null;
  const plPct = s.avg > 0 ? ((s.price - s.avg) / s.avg) * 100 : 0;

  // Already sold — re-entry logic (mirrors the Auto plan).
  if (s.exited) {
    if (verdictWeak)
      return { symbol: s.symbol, action: "Watch", tone: "muted", note: `booked ${rupee(s.booked)} — sector weak, stay out until it turns` };
    if ((s.breakoutScore ?? 0) >= 55) {
      const dipHi = s.price * 0.99;
      const dipLo = s.price * 0.98;
      const stop = s.price * 0.96;
      const trig = s.price * 1.02;
      return {
        symbol: s.symbol,
        action: "Re-enter",
        tone: "gain",
        note: `re-entry: buy a dip to ${rupee(dipLo)}–${rupee(dipHi)} that holds VWAP (stop ${rupee(stop)}), or add on a 15-min close above ${rupee(trig)}`,
      };
    }
    return { symbol: s.symbol, action: "Watch", tone: "amber", note: `booked ${rupee(s.booked)} — no fresh setup yet, wait for a base` };
  }

  // Currently held.
  if ((s.breakoutScore ?? 0) >= 70 && t === "up")
    return { symbol: s.symbol, action: "Add", tone: "gain", note: `leader (score ${s.breakoutScore}) — pyramid on strength, trail stop under the 50DMA ${s.sma50 ? rupee(s.sma50) : ""}` };
  if (s.sma200 != null && s.price < s.sma200 && plPct < 0)
    return { symbol: s.symbol, action: "Exit", tone: "loss", note: `${pct(plPct)} and below the 200DMA — set an exit near the 50DMA ${s.sma50 ? rupee(s.sma50) : ""}, don't average down` };
  if (s.rsi != null && s.rsi >= 75 && plPct > 0)
    return { symbol: s.symbol, action: "Trim", tone: "amber", note: `overbought (RSI ${s.rsi.toFixed(0)}) and in profit — book part into strength` };
  if (rangePct != null && rangePct <= 15)
    return { symbol: s.symbol, action: "Reduce", tone: "amber", note: `near its 52-week low — weak; cut if the thesis is broken` };
  if (t === "up" && plPct > 0)
    return { symbol: s.symbol, action: "Hold", tone: "gain", note: `working (${pct(plPct)}, uptrend) — hold and trail` };
  return { symbol: s.symbol, action: "Hold", tone: "muted", note: `no clear edge — hold, watch the 50DMA ${s.sma50 ? rupee(s.sma50) : ""}` };
}

export function sectorCall(input: AgentInput): SectorCall {
  const v = (input.verdict ?? "").toLowerCase();
  const verdictWeak = v === "avoid";
  const verdictStrong = v === "good buy" || v === "buy on dips" || v === "turning up";

  const actions = input.stocks.map((s) => stockAction(s, verdictWeak));
  const held = input.stocks.filter((s) => !s.exited && s.heldQty > 0);
  const allExited = input.stocks.length > 0 && held.length === 0;

  const adds = actions.filter((a) => a.action === "Add").length;
  const cuts = actions.filter((a) => a.action === "Exit" || a.action === "Reduce" || a.action === "Trim").length;

  let stance: Stance;
  let tone: SectorCall["tone"];
  if (allExited) {
    stance = verdictStrong ? "Re-enter on dip" : verdictWeak ? "Stay out" : "Rebuild";
    tone = verdictStrong ? "gain" : verdictWeak ? "loss" : "amber";
  } else if (verdictWeak) {
    stance = "Reduce / de-risk";
    tone = "loss";
  } else if (adds >= 1 && verdictStrong && cuts <= adds) {
    stance = "Accumulate leaders";
    tone = "gain";
  } else if (cuts > adds) {
    stance = "Trim & prune";
    tone = "amber";
  } else if (verdictStrong) {
    stance = "Hold & trail";
    tone = "gain";
  } else {
    stance = "Hold & be selective";
    tone = "amber";
  }

  // Rationale.
  const rationale: string[] = [];
  if (input.verdict)
    rationale.push(
      `Sector verdict is "${input.verdict}"${input.indexMom1M != null ? ` (index ${pct(input.indexMom1M)} over 1M)` : ""}.`
    );
  if (input.alphaPct != null)
    rationale.push(
      input.alphaPct >= 0.3
        ? `Your picks are beating the index by ${pct(input.alphaPct)} — selection is adding value, lean into the leaders.`
        : input.alphaPct <= -0.3
        ? `Your picks lag the index by ${pct(input.alphaPct)} — if this persists, holding the sector leaders (or the ETF) may beat stock-picking here.`
        : `Your picks are tracking the index (${pct(input.alphaPct)} alpha) — no selection edge yet.`
    );
  const booked = input.stocks.reduce((a, s) => a + s.booked, 0);
  if (booked !== 0) rationale.push(`${rupee(booked)} already booked in this sector.`);
  const leader = [...input.stocks]
    .filter((s) => !s.exited)
    .sort((a, b) => (b.breakoutScore ?? 0) - (a.breakoutScore ?? 0))[0];
  const laggard = actions.find((a) => a.action === "Exit" || a.action === "Reduce");
  if (leader && (leader.breakoutScore ?? 0) >= 55) rationale.push(`Strongest setup: ${leader.symbol} (score ${leader.breakoutScore}).`);
  if (laggard) rationale.push(`Weakest link: ${laggard.symbol} — has a defined exit, don't let it offset winners.`);

  const headline =
    stance === "Accumulate leaders"
      ? "Sector is in gear — add to your strongest names, keep laggards on a leash."
      : stance === "Hold & trail"
      ? "Trend is with you — hold and trail stops, don't add blindly."
      : stance === "Trim & prune"
      ? "Mixed tape — book strength, cut the laggards, tighten the basket."
      : stance === "Reduce / de-risk"
      ? "Sector is weak — reduce exposure and protect capital, no new buys."
      : stance === "Re-enter on dip"
      ? "Booked and flat — re-enter selectively on pullbacks that hold, not on gap-ups."
      : stance === "Stay out"
      ? "You're out and the sector is weak — stay out until it turns."
      : stance === "Rebuild"
      ? "Booked out — wait for fresh setups before rebuilding the basket."
      : "No clear edge — hold what's working, be selective.";

  return { stance, tone, headline, rationale, actions };
}
