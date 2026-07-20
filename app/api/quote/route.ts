import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface QuoteData {
  price: number;
  prevClose: number | null;
  changePct: number | null;
}

// Proxies Yahoo Finance quotes (avoids CORS in the browser).
// NSE symbols use .NS suffix, BSE use .BO, US symbols are plain.
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60);

  const out: Record<string, QuoteData> = {};

  await Promise.all(
    symbols.map(async (s) => {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1d`,
          {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
            cache: "no-store",
          }
        );
        if (!r.ok) return;
        const j = await r.json();
        const meta = j?.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
        if (typeof price === "number" && isFinite(price)) {
          out[s] = {
            price,
            prevClose: typeof prev === "number" && isFinite(prev) ? prev : null,
            changePct:
              typeof prev === "number" && prev > 0 ? ((price - prev) / prev) * 100 : null,
          };
        }
      } catch {
        // symbol failed — leave it out; UI keeps the manual price
      }
    })
  );

  return NextResponse.json(out);
}
