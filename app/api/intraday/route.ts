import { NextRequest, NextResponse } from "next/server";
import { yahooChart } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 15-minute intraday candles for one instrument (Yahoo, latest session).

export interface Bar {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60_000; // 1 minute

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  try {
    // range=1d gives the latest trading session's 15-minute bars.
    const res = await yahooChart(symbol, "1d", "15m");
    const ts: number[] = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0] ?? {};
    const bars: Bar[] = ts
      .map((t: number, i: number) => ({
        t: t * 1000,
        o: q.open?.[i],
        h: q.high?.[i],
        l: q.low?.[i],
        c: q.close?.[i],
        v: q.volume?.[i],
      }))
      .filter((b: Bar) => [b.o, b.h, b.l, b.c].every((x) => typeof x === "number" && isFinite(x)));

    const meta = res?.meta ?? {};
    const out = {
      symbol,
      bars,
      prevClose:
        typeof meta.chartPreviousClose === "number"
          ? meta.chartPreviousClose
          : typeof meta.previousClose === "number"
          ? meta.previousClose
          : null,
      price: typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : bars[bars.length - 1]?.c ?? null,
      currency: meta.currency ?? "INR",
    };
    cache.set(symbol, { data: out, ts: Date.now() });
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Couldn't load intraday data." }, { status: 502 });
  }
}
