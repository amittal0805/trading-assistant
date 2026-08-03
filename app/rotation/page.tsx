"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useStore, Strategy, RotationStock } from "@/lib/store";
import { parsePortfolioCsv, basketNameFromFile } from "@/lib/portfolioCsv";
import { fetchQuotes, yahooSymbol, Quote } from "@/lib/quotes";
import { fmtMoney, fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { PageTitle, Field, NumInput, StatCard, Empty } from "@/components/ui";
import type { IndexRow } from "@/app/api/indices/route";
import type { Indicator } from "@/app/api/indicators/route";
import IntradayDrawer from "@/components/IntradayDrawer";
import { analyzeIntraday } from "@/lib/intraday";
import { RefreshCw, Trash2, Plus, X, RotateCcw, Activity, Upload } from "lucide-react";

type Quotes = Record<string, Quote>;
type Indicators = Record<string, Indicator>;
type SortKey = "name" | "price" | "pnl" | "value" | "weight" | "day";

// Fallback benchmark index by sector, for baskets without an explicit indexSymbol.
const SECTOR_INDEX: Record<string, string> = {
  pharma: "NIFTY PHARMA",
  "pharma & healthcare": "NIFTY PHARMA",
  healthcare: "NIFTY HEALTHCARE INDEX",
  energy: "NIFTY ENERGY",
  "real estate": "NIFTY REALTY",
  realty: "NIFTY REALTY",
  bank: "NIFTY BANK",
  banking: "NIFTY BANK",
  "banking & financials": "NIFTY BANK",
  financials: "NIFTY BANK",
  it: "NIFTY IT",
  auto: "NIFTY AUTO",
  fmcg: "NIFTY FMCG",
  metal: "NIFTY METAL",
  metals: "NIFTY METAL",
  microcap: "NIFTY MICROCAP 250",
  "financial services": "NIFTY FINANCIAL SERVICES",
};

const resolveIndex = (s: Strategy) =>
  s.indexSymbol || (s.sector ? SECTOR_INDEX[s.sector.trim().toLowerCase()] : undefined);

// Re-entry plans from the Mentor's read (Auto Stars exit, 3-Aug-2026).
// zone = pullback buy range, stop = invalidation, trigger = Zone B breakout add.
const RE_ENTRY_PLANS: Record<string, { exit: number; zone: [number, number]; stop: number; trigger: number }> = {
  SANSERA: { exit: 3443.82, zone: [3375, 3410], stop: 3340, trigger: 3460 },
  GABRIEL: { exit: 1512.39, zone: [1482, 1497], stop: 1467, trigger: 1520 },
  UNIPARTS: { exit: 735.14, zone: [720, 728], stop: 713, trigger: 738 },
};

function reEntrySignal(
  plan: { exit: number; zone: [number, number]; stop: number; trigger: number },
  price: number,
  vwap: number | null
): { label: string; tone: "gain" | "amber" | "loss" | "muted"; note: string } {
  if (!isFinite(price) || price <= 0) return { label: "No price", tone: "muted", note: "waiting for a live quote" };
  if (price >= plan.trigger)
    return {
      label: "Zone B — breakout",
      tone: "gain",
      note: `above ₹${plan.trigger} trigger — breakout re-entry valid; stop = trigger candle's low`,
    };
  if (price >= plan.zone[0] && price <= plan.zone[1]) {
    if (vwap != null && price >= vwap)
      return {
        label: "Zone A — holding VWAP",
        tone: "gain",
        note: `in the ₹${plan.zone[0]}–${plan.zone[1]} pullback zone and above VWAP — first-half buy setup; stop ₹${plan.stop}`,
      };
    if (vwap != null)
      return {
        label: "Zone A — below VWAP",
        tone: "amber",
        note: `in the zone but under VWAP — wait for a 15-min close back above it before buying`,
      };
    return {
      label: "In Zone A",
      tone: "amber",
      note: `in the ₹${plan.zone[0]}–${plan.zone[1]} zone (VWAP unknown — market may be closed); confirm with the 15-min read`,
    };
  }
  if (price < plan.zone[0])
    return price < plan.stop
      ? { label: "Below stop", tone: "loss", note: `under ₹${plan.stop} — setup invalidated, no trade` }
      : { label: "Under zone", tone: "amber", note: `between stop ₹${plan.stop} and the zone — knife-catching territory, wait` };
  return {
    label: "No setup",
    tone: "muted",
    note: `between ₹${plan.zone[1]} and the ₹${plan.trigger} trigger — no-man's land, do nothing`,
  };
}

export default function Rotation() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const {
    strategies,
    holdings,
    positions,
    restoreBaskets,
    setStrategyStocks,
    addStrategyWithStocks,
    addStrategy,
    updateStrategy,
    removeStrategy,
    addRotationStock,
    updateRotationStock,
    removeRotationStock,
  } = useStore();

  // Live link to the Kite book: quantity still held, and P&L already booked.
  const heldNow = useMemo(() => {
    const m: Record<string, number> = {};
    holdings.forEach((h) => (m[h.symbol] = (m[h.symbol] ?? 0) + h.qty));
    positions.filter((p) => p.status === "open").forEach((p) => (m[p.symbol] = (m[p.symbol] ?? 0) + p.qty));
    return m;
  }, [holdings, positions]);
  const realizedNow = useMemo(() => {
    const m: Record<string, number> = {};
    positions
      .filter((p) => p.status === "closed" && p.exitPrice != null)
      .forEach((p) => (m[p.symbol] = (m[p.symbol] ?? 0) + (p.exitPrice! - p.entryPrice) * p.qty));
    return m;
  }, [positions]);
  const csvRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState("");
  const [intraday, setIntraday] = useState<{ symbol: string; name?: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("weight");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const [quotes, setQuotes] = useState<Quotes>({});
  const [indices, setIndices] = useState<IndexRow[]>([]);
  const [indicators, setIndicators] = useState<Indicators>({});
  const [showInd, setShowInd] = useState(true);
  const [indLoading, setIndLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newStratOpen, setNewStratOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSector, setNewSector] = useState("");

  const allItems = useMemo(
    () => strategies.flatMap((s) => s.stocks.map((x) => ({ symbol: x.symbol, exchange: x.exchange }))),
    [strategies]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [q] = await Promise.all([
        allItems.length ? fetchQuotes(allItems) : Promise.resolve({} as Quotes),
        fetch("/api/indices", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j?.rows) setIndices(j.rows as IndexRow[]);
          })
          .catch(() => {}),
      ]);
      setQuotes(q);
    } catch {
      /* leave stale data */
    } finally {
      setLoading(false);
    }
  }, [allItems]);

  const indexBySymbol = useMemo(() => {
    const m: Record<string, IndexRow> = {};
    for (const r of indices) m[r.symbol] = r;
    return m;
  }, [indices]);

  const loadIndicators = useCallback(async () => {
    const syms = Array.from(new Set(strategies.flatMap((s) => s.stocks.map((x) => yahooSymbol(x.symbol, x.exchange)))));
    if (syms.length === 0) return;
    setIndLoading(true);
    try {
      const r = await fetch(`/api/indicators?symbols=${encodeURIComponent(syms.join(","))}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.data) setIndicators(j.data as Indicators);
    } catch {
      /* leave empty */
    } finally {
      setIndLoading(false);
    }
  }, [strategies]);

  const toggleIndicators = () => {
    const next = !showInd;
    setShowInd(next);
    if (next && Object.keys(indicators).length === 0) loadIndicators();
  };

  const guessIndexFromName = (name: string): string | undefined => {
    const n = name.toLowerCase();
    for (const [key, idx] of Object.entries(SECTOR_INDEX)) if (n.includes(key)) return idx;
    return undefined;
  };

  const onImportCsv = async (f: File) => {
    setImportMsg("");
    try {
      const XLSX = await import("xlsx");
      const isCsv = f.name.toLowerCase().endsWith(".csv");
      const wb = isCsv ? XLSX.read(await f.text(), { type: "string" }) : XLSX.read(await f.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true }) as unknown[][];
      const parsed = parsePortfolioCsv(aoa);
      if (parsed.stocks.length === 0) {
        setImportMsg(`No stock rows found. Detected header: ${parsed.header.filter(Boolean).join(", ") || "none"}.`);
        return;
      }
      const stocks: Omit<RotationStock, "id">[] = parsed.stocks.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        qty: s.qty,
        heldQty: s.qty,
        addedPrice: s.avg,
        lastPrice: s.current,
        exchange: "NSE" as const,
      }));

      // Match to an existing basket by ticker overlap; otherwise create new.
      const tickers = new Set(parsed.stocks.map((s) => s.symbol));
      let best: { st: Strategy; shared: number } | null = null;
      for (const st of strategies) {
        const shared = st.stocks.filter((x) => tickers.has(x.symbol)).length;
        if (shared > 0 && (!best || shared > best.shared)) best = { st, shared };
      }
      const derivedName = basketNameFromFile(f.name);

      if (best && best.shared >= Math.max(2, Math.ceil(Math.min(tickers.size, best.st.stocks.length) * 0.4))) {
        setStrategyStocks(best.st.id, stocks);
        setImportMsg(`Updated “${best.st.name}” with ${stocks.length} stocks from ${f.name}.`);
      } else {
        addStrategyWithStocks({
          name: derivedName || "Imported Basket",
          sector: derivedName,
          indexSymbol: guessIndexFromName(derivedName),
          stocks,
        });
        setImportMsg(`Created new basket “${derivedName}” with ${stocks.length} stocks.`);
      }
      if (showInd) loadIndicators();
    } catch {
      setImportMsg("Couldn't read that file. Export the tracker/portfolio as .csv or .xlsx.");
    }
  };

  useEffect(() => {
    if (mounted) refresh();
  }, [mounted, refresh]);

  // Auto-load technical indicators once on open so signals are shown by default.
  useEffect(() => {
    if (mounted && showInd && Object.keys(indicators).length === 0) loadIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Baseline each basket's benchmark at its entry/snapshot date using index
  // history (Yahoo), falling back to today's live level if history is missing.
  useEffect(() => {
    if (!mounted || indices.length === 0) return;
    let cancel = false;
    (async () => {
      for (const st of strategies) {
        if (st.benchmarkEntry) continue;
        const sym = resolveIndex(st);
        if (!sym) continue;
        const anchor = st.baselineDate ?? st.createdAt.slice(0, 10);
        let entry: { level: number; date: string } | null = null;
        try {
          const r = await fetch(`/api/index-history?index=${encodeURIComponent(sym)}&date=${anchor}`, { cache: "no-store" });
          if (r.ok) {
            const j = await r.json();
            if (typeof j.level === "number" && isFinite(j.level) && j.level > 0) {
              entry = { level: j.level, date: j.date ?? anchor };
            }
          }
        } catch {
          /* fall through to live level */
        }
        if (!entry) {
          const idx = indexBySymbol[sym];
          if (idx && isFinite(idx.last) && idx.last > 0) {
            entry = { level: idx.last, date: new Date().toISOString().slice(0, 10) };
          }
        }
        if (entry && !cancel) updateStrategy(st.id, { benchmarkEntry: entry });
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, indices]);

  if (!mounted) return null;

  const priceOf = (symbol: string, exchange: Strategy["stocks"][number]["exchange"], fallback?: number) => {
    const q = quotes[yahooSymbol(symbol, exchange)];
    if (q && isFinite(q.price)) return { price: q.price, changePct: q.changePct };
    return { price: fallback ?? NaN, changePct: null as number | null };
  };

  const portfolioTotal = strategies.reduce((tot, st) => {
    return (
      tot +
      st.stocks.reduce((a, x) => {
        const { price } = priceOf(x.symbol, x.exchange, x.addedPrice);
        return a + (isFinite(price) ? price * x.qty : 0);
      }, 0)
    );
  }, 0);

  const createStrategy = () => {
    if (!newName.trim()) return;
    addStrategy(newName.trim(), newSector.trim() || undefined);
    setNewName("");
    setNewSector("");
    setNewStratOpen(false);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle
          title="Sectoral Rotation"
          subtitle="Track the baskets you're rotating into — by sector, with live weights and P/L"
        />
        <div className="flex items-center gap-2">
          <button className="btn-ghost flex items-center gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Pricing…" : "Refresh prices"}
          </button>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportCsv(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            className="btn-ghost flex items-center gap-2"
            onClick={() => csvRef.current?.click()}
            title="Import a tracker / custom-portfolio CSV — updates a matching basket or creates a new one"
          >
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button
            className={`btn-ghost flex items-center gap-2 ${showInd ? "text-accent" : ""}`}
            onClick={toggleIndicators}
            disabled={indLoading}
            title="Show 50/200 DMA, RSI and 52-week range for each stock"
          >
            <Activity className={`w-4 h-4 ${indLoading ? "animate-pulse" : ""}`} />
            {indLoading ? "Loading…" : "Indicators"}
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={restoreBaskets} title="Re-add any missing default sector baskets">
            <RotateCcw className="w-4 h-4" /> Restore baskets
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setNewStratOpen((v) => !v)}>
            <Plus className="w-4 h-4" /> New Strategy
          </button>
        </div>
      </div>

      {importMsg && <p className="text-xs text-accent mb-3">{importMsg}</p>}

      {/* Sector breakout radar — daily-candle study across every basket */}
      {Object.keys(indicators).length > 0 && (
        <SectorBreakoutRadar strategies={strategies} indicators={indicators} indexBySymbol={indexBySymbol} resolve={resolveIndex} />
      )}

      {newStratOpen && (
        <div className="card mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Field label="Strategy name">
              <input className="input" value={newName} placeholder="e.g. Defence" onChange={(e) => setNewName(e.target.value)} />
            </Field>
          </div>
          <div className="min-w-[180px]">
            <Field label="Sector (optional)">
              <input className="input" value={newSector} placeholder="e.g. Capital Goods" onChange={(e) => setNewSector(e.target.value)} />
            </Field>
          </div>
          <button className="btn-primary" onClick={createStrategy}>Create</button>
          <button className="btn-ghost" onClick={() => setNewStratOpen(false)}>Cancel</button>
        </div>
      )}

      {strategies.length > 1 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Strategies" value={String(strategies.length)} />
          <StatCard label="Total planned value" value={fmtMoney(portfolioTotal)} sub="across all baskets" />
          <StatCard label="Total stocks" value={String(strategies.reduce((a, s) => a + s.stocks.length, 0))} />
        </div>
      )}

      {strategies.length === 0 ? (
        <Empty text="No strategies yet. Create one to start tracking a rotation basket." />
      ) : (
        <div className="space-y-6">
          {[...strategies]
            .map((st) => ({
              st,
              booked: st.stocks.reduce((a, x) => a + (realizedNow[x.symbol] ?? 0), 0),
            }))
            .sort((a, b) => (b.booked !== 0 ? 1 : 0) - (a.booked !== 0 ? 1 : 0) || Math.abs(b.booked) - Math.abs(a.booked))
            .map(({ st }) => st)
            .map((st) => (
            <StrategyCard
              key={st.id}
              strategy={st}
              priceOf={priceOf}
              benchmark={(() => {
                const sym = resolveIndex(st);
                return sym ? indexBySymbol[sym] : undefined;
              })()}
              benchmarkSymbol={resolveIndex(st)}
              indexOptions={indices}
              indicators={indicators}
              showInd={showInd}
              heldNow={heldNow}
              realizedNow={realizedNow}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              onOpenStock={(symbol, name) => setIntraday({ symbol, name })}
              onChangeIndex={(sym) => updateStrategy(st.id, { indexSymbol: sym })}
              onRebase={(level) =>
                updateStrategy(st.id, { benchmarkEntry: { level, date: new Date().toISOString().slice(0, 10) } })
              }
              onRemove={() => removeStrategy(st.id)}
              onAddStock={(s) => addRotationStock(st.id, s)}
              onUpdateStock={(id, patch) => updateRotationStock(st.id, id, patch)}
              onRemoveStock={(id) => removeRotationStock(st.id, id)}
            />
          ))}
        </div>
      )}

      <IntradayDrawer symbol={intraday?.symbol ?? null} name={intraday?.name} onClose={() => setIntraday(null)} />
    </div>
  );
}

interface ComputedRow {
  id: string;
  symbol: string;
  name?: string;
  qty: number;
  heldQty?: number;
  addedPrice?: number;
  price: number;
  changePct: number | null;
  value: number;
  pnl: number;
  change: number;
}

function SortTh({
  k,
  label,
  sortKey,
  sortDir,
  onSort,
  right,
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th className={`th cursor-pointer select-none hover:text-zinc-200 ${right ? "text-right" : ""}`} onClick={() => onSort(k)}>
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        <span className={active ? "text-accent" : "text-transparent"}>{sortDir === "asc" ? "▲" : "▼"}</span>
      </span>
    </th>
  );
}

function IndBadge({ label, value, price }: { label: string; value: number | null | undefined; price: number }) {
  if (value == null || !isFinite(value)) return null;
  const above = price >= value;
  const diff = value ? ((price - value) / value) * 100 : 0;
  return (
    <span
      className={`px-1.5 py-0.5 rounded ${above ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}
      title={`Price is ${above ? "above" : "below"} the ${label} (${fmtNum(value, 2)})`}
    >
      {label} {fmtNum(value, 0)} {above ? "▲" : "▼"}{Math.abs(diff).toFixed(1)}%
    </span>
  );
}

// Quick buy-signal verdict from price vs the 50/200 DMA and RSI.
function signalFor(price: number, ind?: Indicator): { label: string; tone: string; tip: string } | null {
  if (!ind || ind.sma50 == null || ind.sma200 == null) return null;
  const above50 = price >= ind.sma50;
  const above200 = price >= ind.sma200;
  const rsi = ind.rsi;
  const cls = {
    good: "bg-gain/15 text-gain border border-gain/30",
    warn: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    bad: "bg-loss/15 text-loss border border-loss/30",
  };
  if (above50 && above200) {
    if (rsi != null && rsi >= 75) return { label: "Overbought", tone: cls.warn, tip: "Uptrend but stretched — wait for a pullback to add" };
    return { label: "Buy zone", tone: cls.good, tip: "Uptrend — price above both the 50 & 200 DMA" };
  }
  if (!above50 && !above200) {
    if (rsi != null && rsi <= 30) return { label: "Oversold", tone: cls.warn, tip: "Downtrend but oversold — bounce possible, risky" };
    return { label: "Weak", tone: cls.bad, tip: "Downtrend — price below both the 50 & 200 DMA" };
  }
  return { label: "Neutral", tone: cls.warn, tip: "Between the 50 & 200 DMA — trend unconfirmed" };
}

function SignalChip({ price, ind }: { price: number; ind?: Indicator }) {
  const s = signalFor(price, ind);
  if (!s) return null;
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${s.tone}`} title={s.tip}>
      {s.label}
    </span>
  );
}

// Sector-level buy verdict from the live index: momentum (1M, 1Y) + 52-week
// range position. Answers "is this sector a good buy right now?"
function sectorSignal(idx: IndexRow): { label: string; tone: string; reason: string } | null {
  const m1 = idx.pct30d;
  const y1 = idx.pct365d;
  if (!isFinite(m1) || !isFinite(y1)) return null;
  const rangePct = idx.yearHigh > idx.yearLow ? ((idx.last - idx.yearLow) / (idx.yearHigh - idx.yearLow)) * 100 : null;
  const cls = {
    good: "bg-gain/15 text-gain border border-gain/30",
    warn: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    bad: "bg-loss/15 text-loss border border-loss/30",
  };
  const rangeTxt = rangePct != null ? `, ${rangePct.toFixed(0)}% of 52-wk range` : "";
  const reason = `1M ${fmtPct(m1)}, 1Y ${fmtPct(y1)}${rangeTxt}`;
  if (y1 > 0 && m1 > 0) {
    if (rangePct != null && rangePct >= 88)
      return { label: "Buy on dips", tone: cls.warn, reason: `Strong sector but near its highs — ${reason}` };
    return { label: "Good buy", tone: cls.good, reason: `Sector in an uptrend — ${reason}` };
  }
  if (y1 < 0 && m1 < 0) {
    if (rangePct != null && rangePct <= 12)
      return { label: "Oversold", tone: cls.warn, reason: `Beaten-down but oversold — ${reason}` };
    return { label: "Avoid", tone: cls.bad, reason: `Sector in a downtrend — ${reason}` };
  }
  if (m1 > 0 && y1 <= 0) return { label: "Turning up", tone: cls.warn, reason: `Recovering — ${reason}` };
  return { label: "Neutral", tone: cls.warn, reason: `Mixed momentum — ${reason}` };
}

function SectorVerdict({ idx, compact }: { idx: IndexRow; compact?: boolean }) {
  const s = sectorSignal(idx);
  if (!s) return null;
  if (compact)
    return (
      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${s.tone}`} title={s.reason}>
        {s.label}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 text-[11px]">
      <span className={`px-2 py-0.5 rounded font-medium ${s.tone}`}>{s.label}</span>
      <span className="text-muted">{s.reason}</span>
    </span>
  );
}

function IndicatorLine({ ind, price }: { ind?: Indicator; price: number }) {
  if (!ind) return <div className="text-[10px] text-zinc-600 mt-1">indicators —</div>;
  const rsiTone =
    ind.rsi == null ? "text-zinc-500" : ind.rsi >= 70 ? "text-loss" : ind.rsi <= 30 ? "text-gain" : "text-zinc-300";
  const range =
    ind.high52 != null && ind.low52 != null && ind.high52 > ind.low52
      ? ((price - ind.low52) / (ind.high52 - ind.low52)) * 100
      : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-mono">
      <IndBadge label="50D" value={ind.sma50} price={price} />
      <IndBadge label="200D" value={ind.sma200} price={price} />
      {ind.rsi != null && (
        <span className={`px-1.5 py-0.5 rounded bg-surface ${rsiTone}`} title="RSI(14)">
          RSI {ind.rsi.toFixed(0)}
        </span>
      )}
      {range != null && (
        <span className="px-1.5 py-0.5 rounded bg-surface text-zinc-400" title={`52W ${fmtNum(ind.low52!, 0)}–${fmtNum(ind.high52!, 0)}`}>
          52W {range.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function StockGroup({
  label,
  labelCls,
  rows,
  totalValue,
  indicators,
  showInd,
  exchange,
  showChange,
  exitedSet,
  realizedNow,
  onOpenStock,
  onUpdateStock,
  onRemoveStock,
}: {
  label: string;
  labelCls: string;
  rows: ComputedRow[];
  totalValue: number;
  indicators: Indicators;
  showInd: boolean;
  exchange: string;
  showChange: boolean;
  exitedSet: Set<string>;
  realizedNow: Record<string, number>;
  onOpenStock: (symbol: string, name?: string) => void;
  onUpdateStock: (id: string, patch: Partial<Strategy["stocks"][number]>) => void;
  onRemoveStock: (id: string) => void;
}) {
  return (
    <>
      {label && (
        <tr className="bg-surface/40">
          <td className={`td font-medium text-xs ${labelCls}`} colSpan={9}>
            {label}
          </td>
        </tr>
      )}
      {rows.map((r) => {
        const weight = totalValue > 0 && isFinite(r.value) ? (r.value / totalValue) * 100 : NaN;
        return (
          <tr key={r.id}>
            <td className="td">
              <div className="flex items-center gap-2">
                <button
                  className="text-sm text-accent hover:underline text-left"
                  onClick={() => onOpenStock(r.symbol, r.name)}
                  title="15-minute intraday read"
                >
                  {r.name || r.symbol}
                </button>
                {showInd && <SignalChip price={r.price} ind={indicators[yahooSymbol(r.symbol, exchange as never)]} />}
                {exitedSet.has(r.symbol) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Exited
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono">{r.symbol}</div>
              {showInd && <IndicatorLine ind={indicators[yahooSymbol(r.symbol, exchange as never)]} price={r.price} />}
            </td>
            <td className="td text-right font-mono">{isFinite(r.price) ? fmtNum(r.price, 2) : "—"}</td>
            <td className="td text-right">
              <input
                type="number"
                className="w-16 bg-surface border border-border rounded-md px-2 py-1 font-mono text-right text-zinc-100 outline-none focus:border-accent"
                value={r.qty}
                min={0}
                onChange={(e) => onUpdateStock(r.id, { qty: e.target.value === "" ? 0 : Number(e.target.value) })}
              />
            </td>
            {showChange && (
              <td className={`td text-right font-mono font-medium ${r.change > 0 ? "text-gain" : r.change < 0 ? "text-loss" : "text-zinc-500"}`}>
                {r.change > 0 ? "+" : ""}
                {fmtNum(r.change, 0)}
              </td>
            )}
            <td className="td text-right font-mono">
              {exitedSet.has(r.symbol) ? <span className="text-zinc-600">—</span> : isFinite(r.value) ? fmtMoney(r.value) : "—"}
            </td>
            {(() => {
              const exited = exitedSet.has(r.symbol);
              const booked = realizedNow[r.symbol];
              const shown = exited ? booked ?? 0 : r.pnl;
              return (
                <td className={`td text-right font-mono ${isFinite(shown) ? pnlClass(shown) : "text-zinc-600"}`}>
                  {isFinite(shown) ? fmtMoney(shown, "INR", 0) : "—"}
                  {exited && <span className="ml-1 text-[9px] text-amber-400">booked</span>}
                </td>
              );
            })()}
            <td className="td text-right font-mono">
              {isFinite(weight) ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="hidden sm:block h-1 w-10 rounded-full bg-surface overflow-hidden">
                    <span className="block h-full bg-accent/60" style={{ width: `${Math.min(100, weight)}%` }} />
                  </span>
                  {fmtNum(weight, 2)}
                </span>
              ) : (
                "—"
              )}
            </td>
            <td className={`td text-right font-mono text-xs ${r.changePct !== null ? pnlClass(r.changePct) : "text-zinc-600"}`}>
              {r.changePct !== null ? fmtPct(r.changePct) : "—"}
            </td>
            <td className="td text-right">
              <button className="text-zinc-600 hover:text-loss" onClick={() => onRemoveStock(r.id)} title="Remove">
                <X className="w-4 h-4" />
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// Live signals for the Mentor's-read re-entry plans (exited baskets).
function ReEntrySignals({
  strategy,
  priceOf,
  benchmark,
  onOpenStock,
}: {
  strategy: Strategy;
  priceOf: (s: string, e: Strategy["stocks"][number]["exchange"], f?: number) => { price: number; changePct: number | null };
  benchmark?: IndexRow;
  onOpenStock: (symbol: string, name?: string) => void;
}) {
  const planned = strategy.stocks.filter((x) => RE_ENTRY_PLANS[x.symbol]);
  const [vwaps, setVwaps] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      for (const x of planned) {
        try {
          const r = await fetch(`/api/intraday?symbol=${encodeURIComponent(x.symbol)}.NS`, { cache: "no-store" });
          if (!r.ok) continue;
          const j = await r.json();
          const a = analyzeIntraday(x.symbol, j.bars ?? [], j.prevClose ?? null);
          if (!cancel) setVwaps((m) => ({ ...m, [x.symbol]: a ? a.vwap : null }));
        } catch {
          /* leave unknown */
        }
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy.id]);

  if (planned.length === 0) return null;
  const sectorWeak = benchmark ? sectorSignal(benchmark)?.label === "Avoid" : false;
  const tones: Record<string, string> = {
    gain: "border-gain/40 bg-gain/5 text-gain",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-400",
    loss: "border-loss/40 bg-loss/5 text-loss",
    muted: "border-border bg-surface/40 text-zinc-400",
  };
  return (
    <div className="px-4 py-2.5 bg-surface/30 border-b border-border">
      <div className="text-[11px] text-muted mb-1.5">
        Re-entry signals <span className="text-zinc-600">· from the Mentor&apos;s read (3-Aug exit)</span>
        {sectorWeak && <span className="ml-2 text-loss font-medium">Sector verdict is Weak — plan paused, skip the day.</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {planned.map((x) => {
          const plan = RE_ENTRY_PLANS[x.symbol];
          const { price } = priceOf(x.symbol, x.exchange, x.lastPrice ?? x.addedPrice);
          const sig = reEntrySignal(plan, price, vwaps[x.symbol] ?? null);
          return (
            <button
              key={x.symbol}
              onClick={() => onOpenStock(x.symbol, x.name)}
              className={`text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:border-accent ${
                sectorWeak ? tones.muted : tones[sig.tone]
              }`}
              title={sig.note}
            >
              <span className="font-medium text-zinc-100">{x.symbol}</span>
              <span className="ml-1.5 font-mono text-zinc-300">{isFinite(price) ? fmtNum(price, 2) : "—"}</span>
              <span className="ml-1.5 font-medium">{sig.label}</span>
              <span className="block text-[10px] text-muted mt-0.5 max-w-[280px] truncate">{sig.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Sector-level breakout ranking: top stock scores + index 1-month momentum.
function SectorBreakoutRadar({
  strategies,
  indicators,
  indexBySymbol,
  resolve,
}: {
  strategies: Strategy[];
  indicators: Indicators;
  indexBySymbol: Record<string, IndexRow>;
  resolve: (s: Strategy) => string | undefined;
}) {
  const ranked = strategies
    .map((st) => {
      const scores = st.stocks
        .map((x) => indicators[yahooSymbol(x.symbol, x.exchange)]?.breakout?.score ?? 0)
        .sort((a, b) => b - a);
      if (!scores.length) return null;
      const top2 = scores.slice(0, 2);
      const stockScore = top2.reduce((a, b) => a + b, 0) / top2.length;
      const idx = resolve(st) ? indexBySymbol[resolve(st)!] : undefined;
      const momentum = idx && isFinite(idx.pct30d) ? Math.max(-10, Math.min(10, idx.pct30d)) : 0;
      const sectorScore = Math.min(100, stockScore * 0.8 + momentum * 2 + 10);
      const candidates = st.stocks.filter(
        (x) => (indicators[yahooSymbol(x.symbol, x.exchange)]?.breakout?.score ?? 0) >= 50
      ).length;
      return { name: st.name, sectorScore, stockScore, momentum: idx?.pct30d ?? null, candidates };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.sectorScore - a.sectorScore);

  if (!ranked.length) return null;
  const leader = ranked[0];

  return (
    <div className="card mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-medium">Sector breakout radar</h2>
        <span className="text-[11px] text-muted">daily-candle study · 52w-high proximity, consolidation, volume, trend, RSI</span>
      </div>
      <p className="text-sm text-zinc-300 mb-3">
        <span className="font-medium text-accent">{leader.name}</span> looks closest to a breakout
        {leader.candidates > 0 ? ` with ${leader.candidates} stock${leader.candidates > 1 ? "s" : ""} setting up` : ""}
        {leader.momentum != null ? ` (index ${fmtPct(leader.momentum)} over 1M)` : ""}.
      </p>
      <div className="space-y-1.5">
        {ranked.map((r) => (
          <div key={r.name} className="flex items-center gap-3">
            <span className="text-xs w-36 shrink-0 truncate">{r.name}</span>
            <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
              <div
                className={`h-full ${r.sectorScore >= 65 ? "bg-gain" : r.sectorScore >= 45 ? "bg-amber-500" : "bg-zinc-600"}`}
                style={{ width: `${Math.max(4, r.sectorScore)}%` }}
              />
            </div>
            <span className="text-xs font-mono w-10 text-right">{r.sectorScore.toFixed(0)}</span>
            <span className="text-[10px] text-muted w-20 shrink-0 text-right">
              {r.candidates > 0 ? `${r.candidates} setup${r.candidates > 1 ? "s" : ""}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Per-sector widget: which stocks in this basket look like breakout candidates.
function BreakoutWatch({
  strategy,
  indicators,
  onOpenStock,
}: {
  strategy: Strategy;
  indicators: Indicators;
  onOpenStock: (symbol: string, name?: string) => void;
}) {
  const rows = strategy.stocks
    .map((x) => {
      const b = indicators[yahooSymbol(x.symbol, x.exchange)]?.breakout;
      return b && b.score >= 50 ? { symbol: x.symbol, name: x.name, b } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.b.score - a.b.score)
    .slice(0, 4);

  if (!rows.length) return null;
  return (
    <div className="px-4 py-2.5 bg-surface/30 border-b border-border">
      <div className="text-[11px] text-muted mb-1.5">Breakout watch</div>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <button
            key={r.symbol}
            onClick={() => onOpenStock(r.symbol, r.name)}
            className={`text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors hover:border-accent ${
              r.b.verdict === "setup" ? "border-gain/40 bg-gain/5" : "border-amber-500/30 bg-amber-500/5"
            }`}
            title={r.b.signals.join(" · ")}
          >
            <span className="font-medium">{r.symbol}</span>
            <span className={`ml-1.5 font-mono ${r.b.verdict === "setup" ? "text-gain" : "text-amber-400"}`}>{r.b.score}</span>
            <span className="block text-[10px] text-muted mt-0.5 max-w-[220px] truncate">
              {r.b.signals[0] ?? "building a base"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Your picks vs the sector index since the tracking baseline — the alpha line.
function VsBenchmark({
  basketPct,
  indexPct,
  indexName,
  since,
  onRebase,
}: {
  basketPct: number;
  indexPct: number;
  indexName: string;
  since: string;
  onRebase: () => void;
}) {
  const alpha = basketPct - indexPct;
  const maxAbs = Math.max(Math.abs(basketPct), Math.abs(indexPct), 0.5);
  const bar = (v: number) => `${Math.min(100, (Math.abs(v) / maxAbs) * 100)}%`;
  return (
    <div className="px-4 py-2.5 border-b border-border bg-surface/20">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[11px] text-muted w-24 shrink-0">vs benchmark</span>
        <div className="flex-1 min-w-[220px] space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted w-16 shrink-0">Your picks</span>
            <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
              <div className={`h-full ${basketPct >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: bar(basketPct) }} />
            </div>
            <span className={`text-[11px] font-mono w-16 text-right ${pnlClass(basketPct)}`}>{fmtPct(basketPct)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted w-16 shrink-0 truncate" title={indexName}>Index</span>
            <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
              <div className={`h-full ${indexPct >= 0 ? "bg-accent" : "bg-loss/70"}`} style={{ width: bar(indexPct) }} />
            </div>
            <span className={`text-[11px] font-mono w-16 text-right ${pnlClass(indexPct)}`}>{fmtPct(indexPct)}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-mono font-semibold ${pnlClass(alpha)}`}>
            {alpha >= 0 ? "+" : ""}
            {alpha.toFixed(2)}%
          </div>
          <div className="text-[10px] text-muted">
            alpha ·{" "}
            <button className="hover:text-accent underline decoration-dotted" onClick={onRebase} title="Reset the index baseline to today">
              since {since}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyCard({
  strategy,
  priceOf,
  benchmark,
  benchmarkSymbol,
  indexOptions,
  indicators,
  showInd,
  heldNow,
  realizedNow,
  sortKey,
  sortDir,
  onSort,
  onOpenStock,
  onChangeIndex,
  onRebase,
  onRemove,
  onAddStock,
  onUpdateStock,
  onRemoveStock,
}: {
  strategy: Strategy;
  priceOf: (s: string, e: Strategy["stocks"][number]["exchange"], f?: number) => { price: number; changePct: number | null };
  benchmark?: IndexRow;
  benchmarkSymbol?: string;
  indexOptions: IndexRow[];
  indicators: Indicators;
  showInd: boolean;
  heldNow: Record<string, number>;
  realizedNow: Record<string, number>;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  onOpenStock: (symbol: string, name?: string) => void;
  onChangeIndex: (symbol: string) => void;
  onRebase: (level: number) => void;
  onRemove: () => void;
  onAddStock: (s: Omit<Strategy["stocks"][number], "id">) => void;
  onUpdateStock: (id: string, patch: Partial<Strategy["stocks"][number]>) => void;
  onRemoveStock: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [sym, setSym] = useState("");
  const [nm, setNm] = useState("");
  const [qty, setQty] = useState<number | "">("");
  const [held, setHeld] = useState<number | "">("");

  const rows = strategy.stocks.map((x) => {
    const { price, changePct } = priceOf(x.symbol, x.exchange, x.lastPrice ?? x.addedPrice);
    const value = isFinite(price) ? price * x.qty : NaN;
    const pnl = isFinite(price) && x.addedPrice ? (price - x.addedPrice) * x.qty : NaN;
    const change = x.qty - (x.heldQty ?? 0);
    return { ...x, price, changePct, value, pnl, change };
  });
  const totalValue = rows.reduce((a, r) => a + (isFinite(r.value) ? r.value : 0), 0);
  const totalPnl = rows.reduce((a, r) => a + (isFinite(r.pnl) ? r.pnl : 0), 0);
  const totalInvested = totalValue - totalPnl;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Booked (realized) P&L from closed positions, and whether the basket is exited.
  const symSet = new Set(strategy.stocks.map((x) => x.symbol));
  const booked = Object.entries(realizedNow).reduce((a, [sym, v]) => (symSet.has(sym) ? a + v : a), 0);
  const exitedSet = new Set(
    strategy.stocks.filter((x) => (heldNow[x.symbol] ?? 0) <= 0 && realizedNow[x.symbol] != null).map((x) => x.symbol)
  );
  const fullyExited =
    strategy.stocks.length > 0 && strategy.stocks.every((x) => (heldNow[x.symbol] ?? 0) <= 0) && booked !== 0;
  const dayChange = rows.reduce(
    (a, r) => a + (isFinite(r.value) && r.changePct !== null ? (r.value * r.changePct) / 100 : 0),
    0
  );

  // Sort the rows (P&L, value/weight, day%, price, name).
  const dir = sortDir === "asc" ? 1 : -1;
  const sortVal = (r: (typeof rows)[number]) =>
    sortKey === "name"
      ? (r.name || r.symbol).toLowerCase()
      : sortKey === "price"
      ? r.price
      : sortKey === "pnl"
      ? r.pnl
      : sortKey === "day"
      ? r.changePct ?? -Infinity
      : r.value; // value & weight sort identically
  const sorted = [...rows].sort((a, b) => {
    const av = sortVal(a);
    const bv = sortVal(b);
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir;
    const aa = isFinite(av) ? av : -Infinity;
    const bb = isFinite(bv) ? bv : -Infinity;
    return (aa - bb) * dir;
  });
  const buys = sorted.filter((r) => r.change > 0);
  const sells = sorted.filter((r) => r.change < 0);
  const holds = sorted.filter((r) => r.change === 0);
  const isRebalance = buys.length > 0 || sells.length > 0;

  const submit = () => {
    if (!sym.trim() || qty === "" || Number(qty) < 0) return;
    onAddStock({
      symbol: sym.trim().toUpperCase(),
      name: nm.trim() || undefined,
      qty: Number(qty),
      heldQty: held === "" ? 0 : Number(held),
      exchange: "NSE",
    });
    setSym("");
    setNm("");
    setQty("");
    setHeld("");
    setAddOpen(false);
  };

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">{strategy.name}</h2>
              {benchmark && <SectorVerdict idx={benchmark} compact />}
              {isRebalance && (
                <span className="text-[11px] font-medium">
                  {buys.length > 0 && <span className="text-gain">{buys.length} buy</span>}
                  {buys.length > 0 && sells.length > 0 && <span className="text-zinc-600"> · </span>}
                  {sells.length > 0 && <span className="text-loss">{sells.length} sell</span>}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <select
                className="bg-surface border border-border rounded px-1.5 py-0.5 text-[11px] text-zinc-300 outline-none focus:border-accent max-w-[160px]"
                value={benchmarkSymbol ?? ""}
                onChange={(e) => onChangeIndex(e.target.value)}
                title="Benchmark index"
              >
                {!benchmarkSymbol && <option value="">index…</option>}
                {benchmarkSymbol && !indexOptions.some((o) => o.symbol === benchmarkSymbol) && (
                  <option value={benchmarkSymbol}>{benchmarkSymbol}</option>
                )}
                {indexOptions.map((o) => (
                  <option key={o.symbol} value={o.symbol}>
                    {o.name}
                  </option>
                ))}
              </select>
              {benchmark ? (
                <span className="font-mono text-muted flex flex-wrap items-center gap-x-3">
                  <span className="text-zinc-200">{fmtNum(benchmark.last, 0)}</span>
                  <span className={pnlClass(benchmark.pctChange)}>{fmtPct(benchmark.pctChange)}</span>
                  <span>1M <span className={pnlClass(benchmark.pct30d)}>{fmtPct(benchmark.pct30d)}</span></span>
                  <span>1Y <span className={pnlClass(benchmark.pct365d)}>{fmtPct(benchmark.pct365d)}</span></span>
                </span>
              ) : (
                <span className="text-zinc-600">index loads on Refresh</span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-lg font-semibold leading-none">{fmtMoney(totalValue, "INR", 0)}</div>
            <div className="text-[11px] font-mono mt-1">
              <span className={pnlClass(totalPnl)}>
                {fmtMoney(totalPnl, "INR", 0)} ({fmtPct(totalPnlPct)})
              </span>
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              Day <span className={`font-mono ${pnlClass(dayChange)}`}>{fmtMoney(dayChange, "INR", 0)}</span>
            </div>
            {booked !== 0 && (
              <div className="text-[10px] text-muted mt-0.5">
                Booked <span className={`font-mono ${pnlClass(booked)}`}>{fmtMoney(booked, "INR", 0)}</span>
              </div>
            )}
            <button className="text-zinc-600 hover:text-loss mt-1" onClick={onRemove} title="Delete strategy">
              <Trash2 className="w-4 h-4 inline" />
            </button>
          </div>
        </div>
      </div>

      {benchmark && strategy.benchmarkEntry && strategy.benchmarkEntry.level > 0 && (
        <VsBenchmark
          basketPct={totalPnlPct}
          indexPct={((benchmark.last - strategy.benchmarkEntry.level) / strategy.benchmarkEntry.level) * 100}
          indexName={benchmark.name}
          since={strategy.benchmarkEntry.date}
          onRebase={() => onRebase(benchmark.last)}
        />
      )}

      {fullyExited && (
        <div className="px-4 py-2 bg-surface/40 border-b border-border text-xs">
          <span className="text-amber-400 font-medium">Fully exited</span> — this basket is no longer held. Booked P&amp;L{" "}
          <span className={`font-mono font-semibold ${pnlClass(booked)}`}>{fmtMoney(booked)}</span>.
        </div>
      )}

      <ReEntrySignals strategy={strategy} priceOf={priceOf} benchmark={benchmark} onOpenStock={onOpenStock} />

      <BreakoutWatch strategy={strategy} indicators={indicators} onOpenStock={onOpenStock} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <SortTh k="name" label="Constituent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh k="price" label="Price" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
              <th className="th text-right">Qty</th>
              {isRebalance && <th className="th text-right">Change</th>}
              <SortTh k="value" label="Value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
              <SortTh k="pnl" label="P&L" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
              <SortTh k="weight" label="Weight %" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
              <SortTh k="day" label="Day %" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="td text-sm text-zinc-500" colSpan={9}>
                  No stocks yet — add the ones you plan to buy.
                </td>
              </tr>
            ) : (
              (
                [
                  ["Stocks you are buying", "text-gain", buys],
                  ["Stocks you are selling", "text-loss", sells],
                  [isRebalance ? "Holding (no change)" : "", "text-muted", holds],
                ] as const
              )
                .filter(([, , group]) => group.length > 0)
                .map(([label, cls, group]) => (
                  <StockGroup
                    key={label || "holds"}
                    label={label ? `${label}: ${group.length}` : ""}
                    labelCls={cls}
                    rows={group}
                    totalValue={totalValue}
                    indicators={indicators}
                    showInd={showInd}
                    exchange="NSE"
                    showChange={isRebalance}
                    exitedSet={exitedSet}
                    realizedNow={realizedNow}
                    onOpenStock={onOpenStock}
                    onUpdateStock={onUpdateStock}
                    onRemoveStock={onRemoveStock}
                  />
                ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-border">
        {addOpen ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <Field label="Symbol">
                <input className="input" value={sym} placeholder="LAURUSLABS" onChange={(e) => setSym(e.target.value)} />
              </Field>
            </div>
            <div className="min-w-[180px] flex-1">
              <Field label="Name (optional)">
                <input className="input" value={nm} placeholder="Laurus Labs Ltd" onChange={(e) => setNm(e.target.value)} />
              </Field>
            </div>
            <div className="w-24">
              <Field label="New Qty">
                <NumInput value={qty} onChange={setQty} />
              </Field>
            </div>
            <div className="w-24">
              <Field label="Held (opt)">
                <NumInput value={held} onChange={setHeld} placeholder="0" />
              </Field>
            </div>
            <button className="btn-primary" onClick={submit}>Add</button>
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
        ) : (
          <button className="text-sm text-accent hover:underline flex items-center gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Add stock
          </button>
        )}
      </div>
    </div>
  );
}
