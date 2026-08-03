// Parser for the platform's "custom portfolio / tracker" CSV export.
// Layout: an "Investment Overview" preamble, then a table with headers
// Name, Ticker, Current Price (₹), Avg. Buy Price (₹), Returns (%), Weightage (%), Shares.

export interface ParsedStock {
  symbol: string;
  name: string;
  qty: number; // shares
  avg: number; // avg buy price
  current: number; // current price
}

export interface ParsedPortfolio {
  stocks: ParsedStock[];
  currentValue: number | null;
  currentInvestment: number | null;
  header: string[]; // for diagnostics
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

const num = (v: unknown): number => {
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  return isFinite(n) ? n : NaN;
};

function findLabelledValue(rows: unknown[][], label: string): number | null {
  for (const r of rows.slice(0, 12)) {
    const cells = (r ?? []).map(norm);
    const idx = cells.findIndex((c) => c === label);
    if (idx >= 0) {
      // value is usually on the next row, same column; scan a couple rows down.
    }
  }
  // The export puts "Current Value" on one row and its number on the next row.
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] ?? []).map(norm);
    if (cells.some((c) => c === label)) {
      const next = rows[i + 1] ?? [];
      for (const cell of next) {
        const v = num(cell);
        if (isFinite(v)) return v;
      }
    }
  }
  return null;
}

export function parsePortfolioCsv(rows: unknown[][]): ParsedPortfolio {
  // Locate the stock table header.
  let hi = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] ?? []).map(norm);
    if (r.includes("ticker") && r.includes("shares")) {
      hi = i;
      break;
    }
  }
  if (hi === -1) return { stocks: [], currentValue: null, currentInvestment: null, header: [] };

  const header = (rows[hi] ?? []).map((c) => String(c ?? ""));
  const H = header.map(norm);
  const col = (match: (h: string) => boolean) => H.findIndex(match);
  const iName = col((h) => h === "name" || h.includes("name"));
  const iTicker = col((h) => h === "ticker" || h.includes("ticker") || h.includes("symbol"));
  const iCur = col((h) => h.includes("current price"));
  const iAvg = col((h) => h.includes("avg") && h.includes("buy"));
  const iShares = col((h) => h === "shares" || h.includes("shares") || h.includes("qty"));

  const stocks: ParsedStock[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const symbol = iTicker >= 0 ? String(r[iTicker] ?? "").trim().toUpperCase() : "";
    if (!symbol || norm(symbol).includes("total")) continue;
    const qty = num(r[iShares]);
    const avg = num(r[iAvg]);
    const current = num(r[iCur]);
    if (!isFinite(qty) || qty <= 0) continue;
    stocks.push({
      symbol,
      name: iName >= 0 ? String(r[iName] ?? "").trim() : symbol,
      qty,
      avg: isFinite(avg) ? avg : current,
      current: isFinite(current) ? current : avg,
    });
  }

  return {
    stocks,
    currentValue: findLabelledValue(rows, "current value"),
    currentInvestment: findLabelledValue(rows, "current investment"),
    header,
  };
}

/** Turn a tracker filename into a readable basket name. */
export function basketNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.[a-z]+$/i, "") // extension
    .replace(/[_\s-]*\d{1,2}[_\-]\d{1,2}[_\-]\d{2,4}$/i, "") // trailing date
    .replace(/[_\s-]*(tracker|custom[_\s-]*portfolio|portfolio|quant|custom)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
