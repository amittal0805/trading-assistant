import { NextResponse } from "next/server";
import { nseFetchJson, num } from "@/lib/nse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Most active equities from NSE (https://www.nseindia.com/market-data/most-active-equities),
// by traded volume and by traded value. We fetch both lists in parallel.

interface RawActive {
  symbol?: string;
  lastPrice?: number | string;
  change?: number | string;
  pChange?: number | string;
  open?: number | string;
  dayHigh?: number | string;
  dayLow?: number | string;
  previousClose?: number | string;
  yearHigh?: number | string;
  yearLow?: number | string;
  totalTradedVolume?: number | string;
  totalTradedValue?: number | string;
  quantityTraded?: number | string;
  lastUpdateTime?: string;
}

export interface ActiveRow {
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
  volume: number; // shares
  valueCr: number; // ₹ crore
}

function normalize(raw: RawActive[]): ActiveRow[] {
  return raw
    .filter((r) => r.symbol)
    .map((r) => ({
      symbol: r.symbol ?? "",
      last: num(r.lastPrice),
      change: num(r.change),
      pctChange: num(r.pChange),
      open: num(r.open),
      high: num(r.dayHigh),
      low: num(r.dayLow),
      prevClose: num(r.previousClose),
      yearHigh: num(r.yearHigh),
      yearLow: num(r.yearLow),
      volume: num(r.totalTradedVolume),
      valueCr: num(r.totalTradedValue) / 1e7,
    }));
}

const API = (by: "volume" | "value") =>
  `https://www.nseindia.com/api/live-analysis-most-active-securities?index=${by}`;

let payload: { data: unknown; ts: number } = { data: null, ts: 0 };
const TTL = 15_000;

export async function GET() {
  if (payload.data && Date.now() - payload.ts < TTL) {
    return NextResponse.json(payload.data);
  }
  try {
    const [vol, val] = await Promise.all([
      nseFetchJson<{ data?: RawActive[]; timestamp?: string }>(API("volume")),
      nseFetchJson<{ data?: RawActive[]; timestamp?: string }>(API("value")),
    ]);
    const out = {
      byVolume: normalize(vol.data ?? []),
      byValue: normalize(val.data ?? []),
      timestamp: vol.timestamp ?? val.timestamp ?? new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    };
    payload = { data: out, ts: Date.now() };
    return NextResponse.json(out);
  } catch {
    if (payload.data) return NextResponse.json(payload.data);
    return NextResponse.json(
      { error: "Couldn't reach NSE. This endpoint only works when the app runs on a machine that can reach nseindia.com." },
      { status: 502 }
    );
  }
}
