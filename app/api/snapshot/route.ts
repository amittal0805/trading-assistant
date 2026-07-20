import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

// SNAPSHOT_DIR lets hosted deployments (e.g. a Render persistent disk at
// /var/data) survive restarts; defaults to ./data locally.
const DIR = process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), "data");
const FILE = path.join(DIR, "snapshots.json");

export interface Snapshot {
  date: string; // YYYY-MM-DD
  invested: number;
  value: number;
  pl: number;
  realizedToday: number;
  chargesToday: number;
  savedAt: string;
}

async function readAll(): Promise<Snapshot[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return [];
  }
}

export async function GET() {
  const snaps = await readAll();
  snaps.sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json(snaps);
}

// Upserts today's snapshot (one per calendar day, latest write wins).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const date = typeof body.date === "string" ? body.date : new Date().toISOString().slice(0, 10);
  const snap: Snapshot = {
    date,
    invested: Number(body.invested) || 0,
    value: Number(body.value) || 0,
    pl: Number(body.pl) || 0,
    realizedToday: Number(body.realizedToday) || 0,
    chargesToday: Number(body.chargesToday) || 0,
    savedAt: new Date().toISOString(),
  };
  const snaps = (await readAll()).filter((s) => s.date !== date);
  snaps.push(snap);
  snaps.sort((a, b) => a.date.localeCompare(b.date));
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(snaps, null, 2));
  return NextResponse.json({ ok: true, count: snaps.length });
}
