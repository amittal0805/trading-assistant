// Flexible parser for a Zerodha Console P&L statement (Excel/CSV).
//
// Console P&L exports vary (tradewise, scrip-wise, combined), so we detect the
// header row and match columns by fuzzy name rather than fixed positions. We aim
// to pull, per row: symbol, realized P&L, quantity, buy/sell value, and (when
// present) entry/exit dates or a holding period — which lets us split realized
// P&L into same-day vs held.

export interface PnlTrade {
  symbol: string;
  qty: number;
  buyValue: number;
  sellValue: number;
  realized: number;
  entryDate?: string;
  exitDate?: string;
  holdingDays?: number;
}

export interface PnlSummary {
  trades: PnlTrade[];
  totalRealized: number;
  intradayNet: number; // realized on same-day (0-day) exits
  swingNet: number; // realized on multi-day holds
  hasSplit: boolean; // dates/holding available to split intraday vs swing
  charges: number | null;
  bySymbol: { symbol: string; realized: number; n: number }[];
  matchedColumns: string[];
  detectedHeader: string[]; // for diagnostics when parsing fails
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

const num = (v: unknown): number => {
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  // handle "1,234.50", "(1,234)" negatives, "₹1,234", "-"
  let s = String(v ?? "").trim();
  if (!s || s === "-") return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[₹,\s]/g, "");
  const n = Number(s);
  if (!isFinite(n)) return NaN;
  return neg ? -n : n;
};

function excelDate(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
  }
  const s = String(v).trim();
  const p = Date.parse(s);
  return isFinite(p) ? new Date(p).toISOString().slice(0, 10) : s.slice(0, 10) || undefined;
}

// Column matchers: first predicate that matches a header cell wins.
const COLS = {
  symbol: (h: string) => h === "symbol" || h.includes("symbol") || h === "scrip" || h.includes("tradingsymbol"),
  qty: (h: string) => h === "quantity" || h === "qty" || h === "qty." || h.includes("quantity"),
  buyValue: (h: string) => h.includes("buy value") || h.includes("buy amount") || h === "buy value",
  sellValue: (h: string) => h.includes("sell value") || h.includes("sell amount"),
  realized: (h: string) =>
    h.includes("realized p&l") ||
    h.includes("realised p&l") ||
    h.includes("realized profit") ||
    h.includes("realised profit") ||
    h === "profit" ||
    h === "net p&l" ||
    h === "p&l" ||
    h === "pnl",
  profitFallback: (h: string) => h.includes("profit") || h.includes("p&l") || h.includes("pnl"),
  entryDate: (h: string) => h.includes("entry date") || h.includes("buy date"),
  exitDate: (h: string) => h.includes("exit date") || h.includes("sell date"),
  holding: (h: string) => h.includes("period of holding") || (h.includes("holding") && h.includes("day")) || h === "days",
};

function findHeader(rows: unknown[][]): { idx: number; header: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = (rows[i] ?? []).map(norm);
    const hasSymbol = r.some((c) => COLS.symbol(c));
    const hasPnl = r.some((c) => COLS.realized(c) || COLS.profitFallback(c));
    const hasValues = r.some((c) => COLS.buyValue(c) || COLS.sellValue(c) || COLS.qty(c));
    if (hasSymbol && (hasPnl || hasValues)) return { idx: i, header: (rows[i] ?? []).map((c) => String(c ?? "")) };
  }
  return null;
}

function pickIndex(header: string[], match: (h: string) => boolean): number {
  return header.findIndex((h) => match(norm(h)));
}

/** Parse one sheet (as array-of-arrays) into P&L trades. */
export function parsePnlSheet(rows: unknown[][]): { trades: PnlTrade[]; header: string[]; matched: string[] } {
  const hdr = findHeader(rows);
  if (!hdr) return { trades: [], header: [], matched: [] };
  const header = hdr.header;

  const iSymbol = pickIndex(header, COLS.symbol);
  const iQty = pickIndex(header, COLS.qty);
  const iBuy = pickIndex(header, COLS.buyValue);
  const iSell = pickIndex(header, COLS.sellValue);
  let iPnl = pickIndex(header, COLS.realized);
  if (iPnl === -1) iPnl = pickIndex(header, COLS.profitFallback);
  const iEntry = pickIndex(header, COLS.entryDate);
  const iExit = pickIndex(header, COLS.exitDate);
  const iHold = pickIndex(header, COLS.holding);

  const matched = Object.entries({ symbol: iSymbol, qty: iQty, buy: iBuy, sell: iSell, pnl: iPnl, entry: iEntry, exit: iExit, holding: iHold })
    .filter(([, v]) => v >= 0)
    .map(([k]) => k);

  const trades: PnlTrade[] = [];
  for (let i = hdr.idx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const symbol = iSymbol >= 0 ? String(r[iSymbol] ?? "").trim().toUpperCase() : "";
    if (!symbol || norm(symbol).includes("total")) continue;
    const buyValue = iBuy >= 0 ? num(r[iBuy]) : NaN;
    const sellValue = iSell >= 0 ? num(r[iSell]) : NaN;
    let realized = iPnl >= 0 ? num(r[iPnl]) : NaN;
    if (!isFinite(realized) && isFinite(buyValue) && isFinite(sellValue)) realized = sellValue - buyValue;
    if (!isFinite(realized)) continue;
    const entryDate = iEntry >= 0 ? excelDate(r[iEntry]) : undefined;
    const exitDate = iExit >= 0 ? excelDate(r[iExit]) : undefined;
    let holdingDays = iHold >= 0 ? num(r[iHold]) : NaN;
    if (!isFinite(holdingDays) && entryDate && exitDate) {
      holdingDays = Math.round((Date.parse(exitDate) - Date.parse(entryDate)) / 86400000);
    }
    trades.push({
      symbol,
      qty: iQty >= 0 ? num(r[iQty]) : NaN,
      buyValue,
      sellValue,
      realized,
      entryDate,
      exitDate,
      holdingDays: isFinite(holdingDays) ? holdingDays : undefined,
    });
  }
  return { trades, header, matched };
}

/** Parse a workbook's sheets, choosing the one with the most P&L rows. */
export function summarizePnl(sheets: { name: string; rows: unknown[][] }[]): PnlSummary {
  let best: { trades: PnlTrade[]; header: string[]; matched: string[] } = { trades: [], header: [], matched: [] };
  for (const s of sheets) {
    const parsed = parsePnlSheet(s.rows);
    if (parsed.trades.length > best.trades.length) best = parsed;
  }
  const trades = best.trades;

  // Optional charges: a sheet/row mentioning total charges.
  let charges: number | null = null;
  for (const s of sheets) {
    for (const row of s.rows.slice(0, 80)) {
      const cells = (row ?? []).map(norm);
      const idx = cells.findIndex((c) => c.includes("total charges") || c === "charges" || c.includes("total tax") );
      if (idx >= 0) {
        for (let j = idx + 1; j < (row ?? []).length; j++) {
          const v = num((row as unknown[])[j]);
          if (isFinite(v) && v !== 0) {
            charges = Math.abs(v);
            break;
          }
        }
      }
      if (charges != null) break;
    }
    if (charges != null) break;
  }

  const totalRealized = trades.reduce((a, t) => a + t.realized, 0);
  const dated = trades.filter((t) => t.holdingDays != null);
  const hasSplit = dated.length > 0 && dated.length >= trades.length * 0.5;
  const intradayNet = trades.filter((t) => t.holdingDays === 0).reduce((a, t) => a + t.realized, 0);
  const swingNet = trades.filter((t) => (t.holdingDays ?? 1) > 0).reduce((a, t) => a + t.realized, 0);

  const symMap = new Map<string, { realized: number; n: number }>();
  for (const t of trades) {
    const g = symMap.get(t.symbol) ?? { realized: 0, n: 0 };
    g.realized += t.realized;
    g.n++;
    symMap.set(t.symbol, g);
  }
  const bySymbol = Array.from(symMap.entries())
    .map(([symbol, g]) => ({ symbol, ...g }))
    .sort((a, b) => b.realized - a.realized);

  return {
    trades,
    totalRealized,
    intradayNet,
    swingNet,
    hasSplit,
    charges,
    bySymbol,
    matchedColumns: best.matched,
    detectedHeader: best.header,
  };
}
