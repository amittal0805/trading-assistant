import { Exchange } from "./charges";

export interface Quote {
  price: number;
  prevClose: number | null;
  changePct: number | null;
}

export function yahooSymbol(symbol: string, exchange: Exchange) {
  if (exchange === "NSE") return `${symbol.toUpperCase()}.NS`;
  if (exchange === "BSE") return `${symbol.toUpperCase()}.BO`;
  return symbol.toUpperCase();
}

/** Fetch live quotes for a list of instruments. Returns map of yahooSymbol → Quote. */
export async function fetchQuotes(
  items: { symbol: string; exchange: Exchange }[]
): Promise<Record<string, Quote>> {
  const syms = Array.from(new Set(items.map((i) => yahooSymbol(i.symbol, i.exchange))));
  if (syms.length === 0) return {};
  const res = await fetch(`/api/quote?symbols=${encodeURIComponent(syms.join(","))}`);
  if (!res.ok) throw new Error("Quote fetch failed");
  return res.json();
}
