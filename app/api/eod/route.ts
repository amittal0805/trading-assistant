import { NextResponse } from "next/server";
import { readJson, upsertSnapshot, yahooPrice, Snapshot } from "@/lib/server";
import { CachedHolding } from "../portfolio/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function yahooSymbol(symbol: string, exchange: string) {
  if (exchange === "NSE") return `${symbol}.NS`;
  if (exchange === "BSE") return `${symbol}.BO`;
  return symbol;
}

// End-of-day snapshot. Hit this from an external scheduler (e.g. cron-job.org)
// at ~15:35 IST on weekdays: GET /api/eod?key=<APP_PASSWORD>
// Uses the server-cached holdings + live Yahoo prices, so no browser needed.
export async function GET() {
  const cache = await readJson<{ holdings: CachedHolding[]; updatedAt: string | null }>(
    "portfolio.json",
    { holdings: [], updatedAt: null }
  );
  const inr = cache.holdings.filter((h) => h.exchange === "NSE" || h.exchange === "BSE");
  if (inr.length === 0) {
    return NextResponse.json({ ok: false, error: "No cached holdings — open the Dashboard once first." }, { status: 400 });
  }

  let invested = 0;
  let value = 0;
  let fetched = 0;
  await Promise.all(
    inr.map(async (h) => {
      invested += h.qty * h.avgPrice;
      const p = await yahooPrice(yahooSymbol(h.symbol, h.exchange));
      if (p) fetched++;
      value += h.qty * (p ?? h.currentPrice);
    })
  );

  const nifty = await yahooPrice("^NSEI");
  const snap: Snapshot = {
    date: new Date().toISOString().slice(0, 10),
    invested,
    value,
    pl: value - invested,
    realizedToday: 0, // preserved from any dashboard-written snapshot via merge
    chargesToday: 0,
    nifty,
    savedAt: new Date().toISOString(),
  };
  const count = await upsertSnapshot(snap, true);
  return NextResponse.json({ ok: true, holdings: inr.length, pricesFetched: fetched, value, count });
}
