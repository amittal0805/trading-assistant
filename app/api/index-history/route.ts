import { NextRequest, NextResponse } from "next/server";
import { yahooChart } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Historical closing level of an NSE index on (or just before) a given date.
// Used to baseline basket-vs-benchmark comparisons at the basket's entry date.

const YAHOO_INDEX: Record<string, string> = {
  "NIFTY 50": "^NSEI",
  "NIFTY BANK": "^NSEBANK",
  "NIFTY AUTO": "^CNXAUTO",
  "NIFTY PHARMA": "^CNXPHARMA",
  "NIFTY METAL": "^CNXMETAL",
  "NIFTY REALTY": "^CNXREALTY",
  "NIFTY ENERGY": "^CNXENERGY",
  "NIFTY IT": "^CNXIT",
  "NIFTY FMCG": "^CNXFMCG",
  "NIFTY HEALTHCARE INDEX": "NIFTY_HEALTHCARE.NS",
  "NIFTY FINANCIAL SERVICES": "NIFTY_FIN_SERVICE.NS",
  "NIFTY MICROCAP 250": "NIFTY_MICROCAP250.NS",
};

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60_000; // 1h — historical closes don't change

export async function GET(req: NextRequest) {
  const index = req.nextUrl.searchParams.get("index")?.trim();
  const date = req.nextUrl.searchParams.get("date")?.trim(); // YYYY-MM-DD
  if (!index || !date) return NextResponse.json({ error: "index and date required" }, { status: 400 });

  const sym = YAHOO_INDEX[index.toUpperCase()];
  if (!sym) return NextResponse.json({ error: `No Yahoo mapping for "${index}"` }, { status: 404 });

  const key = `${sym}:${date}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  try {
    const res = await yahooChart(sym, "6mo", "1d");
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    // End of the requested day in IST.
    const cutoff = Date.parse(`${date}T23:59:59+05:30`) / 1000;
    let level: number | null = null;
    let usedDate: string | null = null;
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (ts[i] <= cutoff && typeof c === "number" && isFinite(c)) {
        level = c;
        usedDate = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      }
    }
    if (level == null) return NextResponse.json({ error: "No close found before that date" }, { status: 404 });
    const out = { index, level, date: usedDate };
    cache.set(key, { data: out, ts: Date.now() });
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Couldn't load index history." }, { status: 502 });
  }
}
