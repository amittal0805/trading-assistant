// Detect NSE stocks mentioned in free feed text (titles + summaries), matched
// against STOCK_UNIVERSE. Pure/isomorphic — safe to import on server or client.
//
// Matching rules, tuned to avoid false positives on English prose:
//  - Mixed-case names/aliases (e.g. "Reliance", "Bharti Airtel") match
//    case-insensitively.
//  - All-caps acronyms and symbols (e.g. "SBI", "IEX", "AUROPHARMA") match
//    ONLY when they appear in upper-case in the text, so "sail"/"bob"/"rec" as
//    ordinary words don't trigger a hit.
//  - Boundaries are non-alphanumeric, so "Titan" won't match "titanium".

import { STOCK_UNIVERSE } from "./stockUniverse";

export interface Ticker {
  symbol: string;
  name: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasLower = (s: string) => /[a-z]/.test(s);

interface Term {
  re: RegExp;
  symbol: string;
  name: string;
}

function buildTerms(): Term[] {
  const terms: Term[] = [];
  for (const s of STOCK_UNIVERSE) {
    const raw = [s.name, ...(s.aliases ?? []), s.symbol];
    const seen = new Set<string>();
    for (const term of raw) {
      const t = term.trim();
      if (t.length < 2 || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      // Case-insensitive for mixed-case names; case-sensitive for acronyms.
      const flags = hasLower(t) ? "i" : "";
      const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(t)}(?![A-Za-z0-9])`, flags);
      terms.push({ re, symbol: s.symbol, name: s.name });
    }
  }
  // Longest terms first so a full name wins before a bare symbol.
  return terms.sort((a, b) => b.re.source.length - a.re.source.length);
}

const TERMS = buildTerms();

/** Return the distinct stocks mentioned in `text`, in first-seen order. */
export function extractTickers(text: string): Ticker[] {
  if (!text) return [];
  const found = new Map<string, Ticker>();
  for (const t of TERMS) {
    if (found.has(t.symbol)) continue;
    if (t.re.test(text)) found.set(t.symbol, { symbol: t.symbol, name: t.name });
  }
  return [...found.values()];
}
