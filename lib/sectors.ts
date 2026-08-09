// Shared sector helpers used by both the Sectoral Rotation page and the Action
// Board, so the two never drift: how to resolve a basket's benchmark index, and
// the "is this sector a good buy right now?" verdict from the live index.

import type { IndexRow } from "@/app/api/indices/route";
import type { Strategy } from "./store";
import { fmtPct } from "./format";

// Fallback benchmark index by sector, for baskets without an explicit indexSymbol.
export const SECTOR_INDEX: Record<string, string> = {
  pharma: "NIFTY PHARMA",
  "pharma & healthcare": "NIFTY PHARMA",
  healthcare: "NIFTY HEALTHCARE INDEX",
  energy: "NIFTY ENERGY",
  "real estate": "NIFTY REALTY",
  realty: "NIFTY REALTY",
  bank: "NIFTY BANK",
  banking: "NIFTY BANK",
  "banking & financials": "NIFTY BANK",
  financials: "NIFTY BANK",
  it: "NIFTY IT",
  auto: "NIFTY AUTO",
  fmcg: "NIFTY FMCG",
  metal: "NIFTY METAL",
  metals: "NIFTY METAL",
  microcap: "NIFTY MICROCAP 250",
  "financial services": "NIFTY FINANCIAL SERVICES",
};

export const resolveIndex = (s: Strategy): string | undefined =>
  s.indexSymbol || (s.sector ? SECTOR_INDEX[s.sector.trim().toLowerCase()] : undefined);

export type SectorLevel = "good" | "warn" | "bad";
export interface SectorSignal {
  label: string;
  level: SectorLevel;
  reason: string;
}

// Sector-level buy verdict from the live index: momentum (1M, 1Y) + 52-week
// range position. Answers "is this sector a good buy right now?"
export function sectorSignal(idx: IndexRow): SectorSignal | null {
  const m1 = idx.pct30d;
  const y1 = idx.pct365d;
  if (!isFinite(m1) || !isFinite(y1)) return null;
  const rangePct = idx.yearHigh > idx.yearLow ? ((idx.last - idx.yearLow) / (idx.yearHigh - idx.yearLow)) * 100 : null;
  const rangeTxt = rangePct != null ? `, ${rangePct.toFixed(0)}% of 52-wk range` : "";
  const reason = `1M ${fmtPct(m1)}, 1Y ${fmtPct(y1)}${rangeTxt}`;
  if (y1 > 0 && m1 > 0) {
    if (rangePct != null && rangePct >= 88) return { label: "Buy on dips", level: "warn", reason: `Strong sector but near its highs — ${reason}` };
    return { label: "Good buy", level: "good", reason: `Sector in an uptrend — ${reason}` };
  }
  if (y1 < 0 && m1 < 0) {
    if (rangePct != null && rangePct <= 12) return { label: "Oversold", level: "warn", reason: `Beaten-down but oversold — ${reason}` };
    return { label: "Avoid", level: "bad", reason: `Sector in a downtrend — ${reason}` };
  }
  if (m1 > 0 && y1 <= 0) return { label: "Turning up", level: "warn", reason: `Recovering — ${reason}` };
  return { label: "Neutral", level: "warn", reason: `Mixed momentum — ${reason}` };
}

export const SECTOR_LEVEL_CLASS: Record<SectorLevel, string> = {
  good: "bg-gain/15 text-gain border border-gain/30",
  warn: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  bad: "bg-loss/15 text-loss border border-loss/30",
};
