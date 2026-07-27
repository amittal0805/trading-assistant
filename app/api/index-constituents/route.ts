import { NextRequest, NextResponse } from "next/server";
import { nseFetchJson, num } from "@/lib/nse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Constituent stocks of an NSE index, via https://www.nseindia.com/api/equity-stockIndices?index=<NAME>
// The first row NSE returns is the index itself (symbol === index name); we drop it.

interface RawStock {
  priority?: number;
  symbol?: string;
  open?: number | string;
  dayHigh?: number | string;
  dayLow?: number | string;
  lastPrice?: number | string;
  previousClose?: number | string;
  change?: number | string;
  pChange?: number | string;
  totalTradedVolume?: number | string;
  totalTradedValue?: number | string;
  yearHigh?: number | string;
  yearLow?: number | string;
  perChange30d?: number | string;
  perChange365d?: number | string;
  meta?: { companyName?: string; industry?: string };
}

export interface StockRow {
  symbol: string;
  company: string;
  industry: string;
  last: number;
  change: number;
  pctChange: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  valueCr: number; // traded value in ₹ crore
  yearHigh: number;
  yearLow: number;
  pct30d: number;
  pct365d: number;
}

// Cache a handful of indices for a short window.
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 15_000;

function normalize(raw: RawStock[], indexName: string): StockRow[] {
  return raw
    .filter((r) => r.symbol && r.symbol.toUpperCase() !== indexName.toUpperCase())
    .map((r) => ({
      symbol: r.symbol ?? "",
      company: r.meta?.companyName ?? r.symbol ?? "",
      industry: r.meta?.industry ?? "",
      last: num(r.lastPrice),
      change: num(r.change),
      pctChange: num(r.pChange),
      open: num(r.open),
      high: num(r.dayHigh),
      low: num(r.dayLow),
      prevClose: num(r.previousClose),
      volume: num(r.totalTradedVolume),
      valueCr: num(r.totalTradedValue) / 1e7, // rupees → crore
      yearHigh: num(r.yearHigh),
      yearLow: num(r.yearLow),
      pct30d: num(r.perChange30d),
      pct365d: num(r.perChange365d),
    }));
}

export async function GET(req: NextRequest) {
  const index = req.nextUrl.searchParams.get("index")?.trim();
  if (!index) return NextResponse.json({ error: "index query param required" }, { status: 400 });

  const cached = cache.get(index);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  try {
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(index)}`;
    const json = await nseFetchJson<{ data?: RawStock[]; timestamp?: string; advance?: unknown }>(url);
    const stocks = normalize(json.data ?? [], index);
    const out = {
      index,
      stocks,
      timestamp: json.timestamp ?? new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    };
    cache.set(index, { data: out, ts: Date.now() });
    return NextResponse.json(out);
  } catch {
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { error: `Couldn't load constituents for ${index}. NSE may be rate-limiting — try again shortly.` },
      { status: 502 }
    );
  }
}
