import { NextRequest, NextResponse } from "next/server";
import { yahooChart } from "@/lib/server";

export const dynamic = "force-dynamic";

// Daily history for one symbol — used by the watchlist to compute indicators.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const result = await yahooChart(symbol, "1y", "1d");
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });

  const quote = result?.indicators?.quote?.[0] ?? {};
  const clean = (arr: (number | null)[] | undefined) =>
    (arr ?? []).filter((v): v is number => typeof v === "number" && isFinite(v));

  const closes = clean(quote.close);
  const highs = clean(quote.high);
  const lows = clean(quote.low);
  const meta = result?.meta ?? {};

  return NextResponse.json({
    closes,
    high52: highs.length ? Math.max(...highs) : null,
    low52: lows.length ? Math.min(...lows) : null,
    price: typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1] ?? null,
    prevClose: typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : null,
  });
}
