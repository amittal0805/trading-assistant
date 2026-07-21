import { NextRequest, NextResponse } from "next/server";
import { readSnapshots, upsertSnapshot, yahooPrice, Snapshot } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readSnapshots());
}

// Upserts today's snapshot (one per calendar day). Also records Nifty 50 for benchmarking.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const date = typeof body.date === "string" ? body.date : new Date().toISOString().slice(0, 10);
  const nifty = await yahooPrice("^NSEI");
  const snap: Snapshot = {
    date,
    invested: Number(body.invested) || 0,
    value: Number(body.value) || 0,
    pl: Number(body.pl) || 0,
    realizedToday: Number(body.realizedToday) || 0,
    chargesToday: Number(body.chargesToday) || 0,
    nifty,
    savedAt: new Date().toISOString(),
  };
  const count = await upsertSnapshot(snap, true);
  return NextResponse.json({ ok: true, count });
}
