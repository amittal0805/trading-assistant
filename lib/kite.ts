// Parsers for Zerodha Kite CSV exports (holdings and positions).

function splitLine(l: string) {
  return l.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
}

function num(v: string) {
  const n = Number((v ?? "").replace(/,/g, ""));
  return isFinite(n) ? n : NaN;
}

/** Parse any Kite CSV into header-keyed rows (headers lowercased). */
export function parseKiteTable(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headerIdx = lines.findIndex((l) => l.toLowerCase().includes("instrument"));
  if (headerIdx === -1) return [];
  const header = splitLine(lines[headerIdx]).map((h) => h.toLowerCase());
  return lines.slice(headerIdx + 1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function pick(row: Record<string, string>, keys: string[]) {
  for (const k of keys) if (k in row && row[k] !== "") return row[k];
  return "";
}

export interface KiteRow {
  symbol: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  product?: string;
}

/** Works for both holdings (Avg. cost) and positions (Avg.) exports. */
export function parseKiteRows(text: string): KiteRow[] {
  return parseKiteTable(text)
    .map((r) => {
      const symbol = pick(r, ["instrument"]).toUpperCase();
      const qty = num(pick(r, ["qty.", "qty"]));
      const avgPrice = num(pick(r, ["avg. cost", "avg.", "avg"]));
      const ltp = num(pick(r, ["ltp"]));
      return {
        symbol,
        qty,
        avgPrice,
        currentPrice: isFinite(ltp) ? ltp : avgPrice,
        product: pick(r, ["product"]) || undefined,
      };
    })
    .filter((r) => r.symbol && isFinite(r.qty) && r.qty > 0 && isFinite(r.avgPrice));
}
