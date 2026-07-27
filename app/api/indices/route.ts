import { NextResponse } from "next/server";
import { nseFetchJson, num } from "@/lib/nse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Live index data from NSE (https://www.nseindia.com/market-data/live-market-indices).
const NSE_API = "https://www.nseindia.com/api/allIndices";
const DATA_TTL = 15_000; // serve cached indices for 15s

let payload: { data: unknown; ts: number } = { data: null, ts: 0 };

interface RawIndex {
  key?: string;
  index?: string;
  indexSymbol?: string;
  last?: string | number;
  variation?: string | number;
  percentChange?: string | number;
  open?: string | number;
  high?: string | number;
  low?: string | number;
  previousClose?: string | number;
  yearHigh?: string | number;
  yearLow?: string | number;
  pe?: string | number;
  pb?: string | number;
  dy?: string | number;
  advances?: string | number;
  declines?: string | number;
  unchanged?: string | number;
  perChange30d?: string | number;
  perChange365d?: string | number;
}

export interface IndexRow {
  group: string;
  name: string;
  symbol: string;
  last: number;
  change: number;
  pctChange: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  yearHigh: number;
  yearLow: number;
  pe: number;
  pb: number;
  dy: number;
  advances: number;
  declines: number;
  unchanged: number;
  pct30d: number;
  pct365d: number;
}

function normalize(raw: RawIndex[]): IndexRow[] {
  return raw
    .filter((r) => r.indexSymbol || r.index)
    .map((r) => ({
      group: r.key ?? "OTHER",
      name: r.index ?? r.indexSymbol ?? "",
      symbol: r.indexSymbol ?? r.index ?? "",
      last: num(r.last),
      change: num(r.variation),
      pctChange: num(r.percentChange),
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      prevClose: num(r.previousClose),
      yearHigh: num(r.yearHigh),
      yearLow: num(r.yearLow),
      pe: num(r.pe),
      pb: num(r.pb),
      dy: num(r.dy),
      advances: num(r.advances),
      declines: num(r.declines),
      unchanged: num(r.unchanged),
      pct30d: num(r.perChange30d),
      pct365d: num(r.perChange365d),
    }));
}

export async function GET() {
  // Serve fresh-enough cache.
  if (payload.data && Date.now() - payload.ts < DATA_TTL) {
    return NextResponse.json(payload.data);
  }

  try {
    const json = await nseFetchJson<{ data?: RawIndex[]; timestamp?: string }>(NSE_API);
    const rows = normalize(json.data ?? []);
    const out = { rows, timestamp: json.timestamp ?? new Date().toISOString(), fetchedAt: new Date().toISOString() };
    payload = { data: out, ts: Date.now() };
    return NextResponse.json(out);
  } catch {
    // Fall back to last good payload if we have one.
    if (payload.data) return NextResponse.json(payload.data);
    return NextResponse.json(
      { error: "Couldn't reach NSE. This endpoint only works when the app runs on a machine that can reach nseindia.com." },
      { status: 502 }
    );
  }
}
