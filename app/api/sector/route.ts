import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Index list framed on the official NSE sectoral indices page:
// https://www.niftyindices.com/indices/equity/sectoral-indices
// Each entry lists candidate Yahoo Finance symbols — the first that returns
// data wins; indices with no Yahoo coverage are dropped from the response.

type Group = "Broad Market" | "Sectoral" | "Thematic";

const INDICES: { name: string; group: Group; candidates: string[] }[] = [
  // Broad market
  { name: "Nifty 50", group: "Broad Market", candidates: ["^NSEI"] },
  { name: "Sensex", group: "Broad Market", candidates: ["^BSESN"] },
  { name: "Nifty Midcap 100", group: "Broad Market", candidates: ["NIFTY_MIDCAP_100.NS", "^NSEMDCP50"] },
  { name: "Nifty Smallcap 100", group: "Broad Market", candidates: ["^CNXSC", "NIFTY_SMLCAP_100.NS"] },

  // Official sectoral indices (niftyindices.com)
  { name: "Nifty Auto", group: "Sectoral", candidates: ["^CNXAUTO"] },
  { name: "Nifty Bank", group: "Sectoral", candidates: ["^NSEBANK"] },
  { name: "Nifty Financial Services", group: "Sectoral", candidates: ["NIFTY_FIN_SERVICE.NS"] },
  { name: "Nifty Private Bank", group: "Sectoral", candidates: ["NIFTY_PVT_BANK.NS", "^NIFTYPVTBANK"] },
  { name: "Nifty PSU Bank", group: "Sectoral", candidates: ["^CNXPSUBANK"] },
  { name: "Nifty IT", group: "Sectoral", candidates: ["^CNXIT"] },
  { name: "Nifty FMCG", group: "Sectoral", candidates: ["^CNXFMCG"] },
  { name: "Nifty Pharma", group: "Sectoral", candidates: ["^CNXPHARMA"] },
  { name: "Nifty Healthcare", group: "Sectoral", candidates: ["NIFTY_HEALTHCARE.NS"] },
  { name: "Nifty Metal", group: "Sectoral", candidates: ["^CNXMETAL"] },
  { name: "Nifty Realty", group: "Sectoral", candidates: ["^CNXREALTY"] },
  { name: "Nifty Media", group: "Sectoral", candidates: ["^CNXMEDIA"] },
  { name: "Nifty Oil & Gas", group: "Sectoral", candidates: ["NIFTY_OIL_AND_GAS.NS"] },
  { name: "Nifty Consumer Durables", group: "Sectoral", candidates: ["NIFTY_CONSR_DURBL.NS"] },
  { name: "Nifty Power", group: "Sectoral", candidates: ["^CNXPOWER", "NIFTY_POWER.NS"] },
  { name: "Nifty Capital Goods", group: "Sectoral", candidates: ["NIFTY_CAPITAL_GOODS.NS", "^CNXCAPGOODS"] },
  { name: "Nifty Chemicals", group: "Sectoral", candidates: ["NIFTY_CHEMICALS.NS"] },
  { name: "Nifty Telecommunications", group: "Sectoral", candidates: ["NIFTY_TELECOM.NS", "NIFTY_TELECOMMUNICATIONS.NS"] },

  // Thematic (useful, tracked on niftyindices.com under thematic)
  { name: "Nifty Energy", group: "Thematic", candidates: ["^CNXENERGY"] },
  { name: "Nifty Infrastructure", group: "Thematic", candidates: ["^CNXINFRA"] },
  { name: "Nifty PSE", group: "Thematic", candidates: ["^CNXPSE"] },
  { name: "Nifty Commodities", group: "Thematic", candidates: ["^CNXCMDT"] },
  { name: "Nifty India Consumption", group: "Thematic", candidates: ["^CNXCONSUM"] },
  { name: "Nifty MNC", group: "Thematic", candidates: ["^CNXMNC"] },
  { name: "Nifty Services Sector", group: "Thematic", candidates: ["^CNXSERVICE"] },
];

export interface SectorRow {
  name: string;
  group: Group;
  symbol: string;
  last: number;
  d1: number | null;
  w1: number | null;
  m1: number | null;
}

function pctChange(from: number | undefined, to: number | undefined) {
  if (!from || !to || !isFinite(from) || !isFinite(to) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

async function fetchIndex(symbol: string) {
  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2mo`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      cache: "no-store",
    }
  );
  if (!r.ok) return null;
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(
    (c: number | null): c is number => typeof c === "number" && isFinite(c)
  );
  if (closes.length < 2) return null;
  const live = result?.meta?.regularMarketPrice;
  return { closes, live: typeof live === "number" && isFinite(live) ? live : null };
}

export async function GET() {
  const rows: SectorRow[] = [];
  const seen = new Set<string>();

  await Promise.all(
    INDICES.map(async ({ name, group, candidates }) => {
      if (seen.has(name)) return;
      for (const symbol of candidates) {
        try {
          const data = await fetchIndex(symbol);
          if (!data) continue;
          if (seen.has(name)) return;
          seen.add(name);

          const { closes, live } = data;
          const last = live ?? closes[closes.length - 1];
          const n = closes.length;
          const prevIdx = Math.abs(closes[n - 1] - last) < 1e-6 ? n - 2 : n - 1;

          rows.push({
            name,
            group,
            symbol,
            last,
            d1: pctChange(closes[prevIdx], last),
            w1: pctChange(closes[Math.max(prevIdx - 4, 0)], last),
            m1: pctChange(closes[Math.max(prevIdx - 21, 0)], last),
          });
          return;
        } catch {
          // try next candidate
        }
      }
    })
  );

  rows.sort((a, b) => (b.d1 ?? -999) - (a.d1 ?? -999));
  return NextResponse.json(rows);
}
