// Server-only helpers: file storage + Yahoo fetches. Do not import from client components.
import fs from "fs/promises";
import path from "path";

export const DATA_DIR = process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), "data");

export interface Snapshot {
  date: string; // YYYY-MM-DD
  invested: number;
  value: number;
  pl: number;
  realizedToday: number;
  chargesToday: number;
  nifty?: number | null;
  savedAt: string;
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export async function readSnapshots(): Promise<Snapshot[]> {
  const snaps = await readJson<Snapshot[]>("snapshots.json", []);
  snaps.sort((a, b) => a.date.localeCompare(b.date));
  return snaps;
}

/** Upsert by date; `merge` keeps existing fields the new snapshot leaves at 0/undefined. */
export async function upsertSnapshot(snap: Snapshot, merge = false) {
  const snaps = await readSnapshots();
  const existing = snaps.find((s) => s.date === snap.date);
  const rest = snaps.filter((s) => s.date !== snap.date);
  const finalSnap =
    merge && existing
      ? {
          ...snap,
          realizedToday: snap.realizedToday || existing.realizedToday,
          chargesToday: snap.chargesToday || existing.chargesToday,
          nifty: snap.nifty ?? existing.nifty,
        }
      : snap;
  rest.push(finalSnap);
  rest.sort((a, b) => a.date.localeCompare(b.date));
  await writeJson("snapshots.json", rest);
  return rest.length;
}

const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" };

export async function yahooChart(symbol: string, range = "1d", interval = "1d") {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      { headers: YAHOO_HEADERS, cache: "no-store" }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function yahooPrice(symbol: string): Promise<number | null> {
  const res = await yahooChart(symbol);
  const p = res?.meta?.regularMarketPrice;
  return typeof p === "number" && isFinite(p) ? p : null;
}
