import { NextRequest, NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/server";

export const dynamic = "force-dynamic";

export interface CachedHolding {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
}

// Server-side cache of holdings so the EOD job can compute snapshots
// without a browser being open. Updated whenever the Dashboard loads.
export async function GET() {
  return NextResponse.json(await readJson("portfolio.json", { holdings: [], updatedAt: null }));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const holdings: CachedHolding[] = Array.isArray(body.holdings) ? body.holdings : [];
  await writeJson("portfolio.json", { holdings, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, count: holdings.length });
}
