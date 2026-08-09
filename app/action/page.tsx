"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { yahooSymbol } from "@/lib/quotes";
import { sectorCall, SectorCall } from "@/lib/sectorAgent";
import { resolveIndex, sectorSignal, SECTOR_LEVEL_CLASS, SectorSignal } from "@/lib/sectors";
import { btstSellPlan, btstScore, strengthFrom } from "@/lib/btst";
import type { Indicator } from "@/app/api/indicators/route";
import type { IndexRow } from "@/app/api/indices/route";
import { currencyFor, fmtMoney, fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { Broker, Exchange } from "@/lib/charges";
import { PageTitle, StatCard } from "@/components/ui";
import IntradayDrawer from "@/components/IntradayDrawer";
import { RefreshCw, ArrowDownRight, ArrowUpRight, Layers, Info, HelpCircle } from "lucide-react";

type Indicators = Record<string, Indicator>;

const ACTION_TONE: Record<string, string> = {
  gain: "text-gain",
  amber: "text-amber-400",
  loss: "text-loss",
  muted: "text-zinc-400",
};

function SectorTag({ names }: { names?: string[] }) {
  if (names && names.length) return <span className="text-xs text-muted">{names.join(", ")}</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-zinc-500 italic">Individual</span>;
}

type Held = { qty: number; avg: number; invested: number } | undefined;

// Three cells: shares held, your average price, amount invested (or "—" if not held).
function HeldCells({ h }: { h: Held }) {
  return (
    <>
      <td className="td text-right font-mono text-xs">{h ? h.qty.toLocaleString("en-IN") : "—"}</td>
      <td className="td text-right font-mono text-xs text-muted">{h ? h.avg.toFixed(2) : "—"}</td>
      <td className="td text-right font-mono text-xs text-muted">{h ? `₹${Math.round(h.invested).toLocaleString("en-IN")}` : "—"}</td>
    </>
  );
}

function Def({ term, children, tone }: { term: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className="text-xs leading-relaxed">
      <span className={`font-medium ${tone ?? "text-zinc-200"}`}>{term}</span>{" "}
      <span className="text-zinc-400">— {children}</span>
    </div>
  );
}

// An on-page legend: what the numbers mean, and what each action tells you to do.
function Legend() {
  return (
    <div className="card mb-6 border-accent/20 bg-accent/5">
      <div className="grid md:grid-cols-3 gap-x-6 gap-y-4">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Reading the numbers</h3>
          <Def term="50DMA / 200DMA">
            average closing price over the last 50 / 200 trading days — the medium- and long-term trend lines. Price above both = uptrend (strong); below both = downtrend (weak).
          </Def>
          <Def term="RSI">momentum from 0–100. Above 70 is overbought (stretched, may pull back); below 30 is oversold.</Def>
          <Def term="Breakout score">0–100 on how close a stock is to breaking out to new highs (nearness to 52-week high, tight base, volume, trend).</Def>
          <Def term="BTST score">0–100 on how likely a strong close follows through the next morning (close near the high, big up day, volume surge, bullish candle, uptrend).</Def>
          <Def term="VWAP">volume-weighted average price — the intraday &ldquo;fair value&rdquo; line; buyers like price holding above it.</Def>
          <Def term="Sell at / Buy near">the suggested limit price to place the order at.</Def>
          <Def term="Stop">the price to exit at if the trade goes against you — your risk cap.</Def>
          <Def term="Breakeven / Net @ target">price that nets ₹0 after charges / your profit after all charges if filled at the target.</Def>
          <Def term="P&L % (e.g. −1.2%)">how far the stock is above or below your average buy price.</Def>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">What the action means for the stock</h3>
          <Def term="Add" tone="text-gain">strong leader in an uptrend — buy more (pyramid) and trail a stop under the 50DMA.</Def>
          <Def term="Hold" tone="text-zinc-200">it&apos;s working or has no clear edge — keep it, don&apos;t add or cut yet.</Def>
          <Def term="Trim" tone="text-amber-400">in profit but overbought — book part into strength, keep the rest running.</Def>
          <Def term="Reduce" tone="text-amber-400">weak or near its lows — cut size to de-risk if the reason you bought is fading.</Def>
          <Def term="Exit" tone="text-loss">below the 200DMA and losing — sell at the defined level, and don&apos;t average down.</Def>
          <Def term="Re-enter" tone="text-gain">already booked; a fresh setup is forming — buy back on a dip that holds or a breakout.</Def>
          <Def term="Watch" tone="text-zinc-400">you&apos;re out and there&apos;s no setup yet — wait for a base to form before acting.</Def>
          <Def term="Don't average down">don&apos;t buy more of a falling, weak stock to lower your average — that just adds to a loser.</Def>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Sector stance &amp; verdict</h3>
          <Def term="Accumulate leaders" tone="text-gain">sector&apos;s in gear — add to your strongest names.</Def>
          <Def term="Hold &amp; trail" tone="text-gain">trend is with you — hold and trail stops, don&apos;t chase.</Def>
          <Def term="Hold &amp; be selective" tone="text-amber-400">no clear edge — keep what&apos;s working, be picky.</Def>
          <Def term="Trim &amp; prune" tone="text-amber-400">mixed tape — book strength, cut the laggards.</Def>
          <Def term="Reduce / de-risk" tone="text-loss">sector is weak — cut exposure, no new buys.</Def>
          <Def term="Re-enter on dip / Rebuild / Stay out">you&apos;re booked out — buy pullbacks that hold, wait for setups, or stay out until it turns.</Def>
          <div className="pt-1" />
          <Def term="Verdict: Good buy / Buy on dips">index in an uptrend / strong but near its highs, so wait for a dip.</Def>
          <Def term="Verdict: Turning up / Neutral">recovering / mixed momentum — no strong signal.</Def>
          <Def term="Verdict: Avoid / Oversold">index in a downtrend / beaten-down but stretched — caution.</Def>
        </div>
      </div>
    </div>
  );
}

type SectorRow = { id: string; name: string; verdict: SectorSignal | null; call: SectorCall };

// A sector card that expands on click to reveal its stocks and per-stock actions.
function SectorStanceCard({ s, onOpenStock }: { s: SectorRow; onOpenStock: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const stanceCls = SECTOR_LEVEL_CLASS[s.call.tone === "gain" ? "good" : s.call.tone === "loss" ? "bad" : "warn"];
  return (
    <div className="card">
      <button className="w-full text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{s.name}</span>
          {s.verdict && <span className={`text-[10px] px-1.5 py-0.5 rounded ${SECTOR_LEVEL_CLASS[s.verdict.level]}`}>{s.verdict.label}</span>}
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${stanceCls}`}>{s.call.stance}</span>
          <span className="text-[11px] text-accent shrink-0">{open ? "hide" : "stocks"}</span>
        </div>
        <p className="text-xs text-zinc-400 mt-2">{s.call.headline}</p>
        {s.verdict && <p className="text-[11px] text-zinc-500 mt-1">{s.verdict.reason}</p>}
      </button>
      {open && (
        <div className="mt-3 space-y-1 border-t border-border pt-2">
          {s.call.actions.length === 0 ? (
            <p className="text-[11px] text-zinc-500">No stocks in this basket.</p>
          ) : (
            s.call.actions.map((a) => (
              <button
                key={a.symbol}
                onClick={() => onOpenStock(a.symbol)}
                className="w-full text-left flex items-start gap-2 text-xs hover:bg-surface/50 rounded px-1 py-1"
              >
                <span className={`font-medium w-16 shrink-0 ${ACTION_TONE[a.tone]}`}>{a.action}</span>
                <span className="font-mono w-24 shrink-0">{a.symbol}</span>
                <span className="text-zinc-400 min-w-0">{a.note}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type Dir = "asc" | "desc";

function useSort(initialKey: string, initialDir: Dir = "desc") {
  const [sortKey, setSortKey] = useState(initialKey);
  const [dir, setDir] = useState<Dir>(initialDir);
  const onSort = (k: string) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir(k === "symbol" || k === "sector" ? "asc" : "desc");
    }
  };
  return { sortKey, dir, onSort };
}

function sortRows<T>(rows: T[], key: string, dir: Dir, get: (r: T, k: string) => number | string): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = get(a, key);
    const bv = get(b, key);
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mul;
    const aa = isFinite(av) ? av : -Infinity;
    const bb = isFinite(bv) ? bv : -Infinity;
    return (aa - bb) * mul;
  });
}

function SortTh({
  label,
  k,
  sort,
  right,
}: {
  label: string;
  k: string;
  sort: { sortKey: string; dir: Dir; onSort: (k: string) => void };
  right?: boolean;
}) {
  const active = sort.sortKey === k;
  return (
    <th className={`th cursor-pointer select-none hover:text-zinc-200 ${right ? "text-right" : ""}`} onClick={() => sort.onSort(k)}>
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        <span className={active ? "text-accent" : "text-transparent"}>{sort.dir === "asc" ? "▲" : "▼"}</span>
      </span>
    </th>
  );
}

export default function ActionBoard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings, positions, strategies } = useStore();

  const [indicators, setIndicators] = useState<Indicators>({});
  const [indices, setIndices] = useState<IndexRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [stock, setStock] = useState<{ symbol: string; name?: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Live held quantity and booked P&L, mirrored from the book (for the sector agent).
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

  // Everything we can price: holdings, open positions, and every basket stock.
  const universe = useMemo(() => {
    const m = new Map<string, string>();
    holdings.forEach((h) => m.set(h.symbol, h.exchange));
    positions.filter((p) => p.status === "open").forEach((p) => m.set(p.symbol, p.exchange));
    strategies.forEach((s) => s.stocks.forEach((x) => m.set(x.symbol, x.exchange)));
    return Array.from(m.entries()).map(([symbol, exchange]) => ({ symbol, exchange }));
  }, [holdings, positions, strategies]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const syms = Array.from(new Set(universe.map((u) => yahooSymbol(u.symbol, u.exchange as never))));
      await Promise.all([
        syms.length
          ? fetch(`/api/indicators?symbols=${encodeURIComponent(syms.join(","))}`, { cache: "no-store" })
              .then((r) => (r.ok ? r.json() : null))
              .then((j) => j?.data && setIndicators(j.data as Indicators))
              .catch(() => {})
          : Promise.resolve(),
        fetch("/api/indices", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => j?.rows && setIndices(j.rows as IndexRow[]))
          .catch(() => {}),
      ]);
    } finally {
      setLoading(false);
    }
  }, [universe]);

  useEffect(() => {
    if (mounted) refresh();
  }, [mounted, refresh]);

  const indexBySymbol = useMemo(() => {
    const m: Record<string, IndexRow> = {};
    for (const r of indices) m[r.symbol] = r;
    return m;
  }, [indices]);

  // Which rotation basket(s) each stock belongs to; anything not in a basket is
  // an individually-purchased stock.
  const basketBySymbol = useMemo(() => {
    const m: Record<string, string[]> = {};
    strategies.forEach((st) => st.stocks.forEach((x) => (m[x.symbol] ??= []).push(st.name)));
    return m;
  }, [strategies]);

  const priceOf = useCallback(
    (symbol: string, exchange: string, fallback?: number) => {
      const p = indicators[yahooSymbol(symbol, exchange as never)]?.price;
      return typeof p === "number" && isFinite(p) ? p : fallback ?? NaN;
    },
    [indicators]
  );

  // What you currently hold, per symbol (holdings + open positions), so every
  // action row can show shares held, your average price and the amount invested.
  const heldBySymbol = useMemo(() => {
    const m: Record<string, { qty: number; invested: number }> = {};
    const add = (sym: string, qty: number, price: number) => {
      if (qty <= 0) return;
      const g = (m[sym] ??= { qty: 0, invested: 0 });
      g.qty += qty;
      g.invested += qty * price;
    };
    holdings.forEach((h) => currencyFor(h.exchange) === "INR" && add(h.symbol, h.qty, h.avgPrice));
    positions.forEach((p) => p.status === "open" && currencyFor(p.exchange) === "INR" && add(p.symbol, p.qty, p.entryPrice));
    const out: Record<string, { qty: number; avg: number; invested: number }> = {};
    for (const [sym, g] of Object.entries(m)) out[sym] = { qty: g.qty, avg: g.qty > 0 ? g.invested / g.qty : 0, invested: g.invested };
    return out;
  }, [holdings, positions]);

  // --- SELL side: BTST overnight holds to sell tomorrow (with target prices) ---
  const btstSells = useMemo(() => {
    return positions
      .filter((p) => p.status === "open" && p.qty > 0 && currencyFor(p.exchange) === "INR")
      .map((p) => {
        const i = indicators[yahooSymbol(p.symbol, p.exchange as never)];
        const ltp = i?.price ?? p.currentPrice;
        const strength = strengthFrom(i?.btstDaily ?? null);
        const plan = btstSellPlan(p.entryPrice, p.qty, ltp ?? p.entryPrice, strength, p.broker as Broker, p.exchange as Exchange);
        return { symbol: p.symbol, qty: p.qty, avg: p.entryPrice, ltp: ltp ?? NaN, strength, plan };
      })
      .sort((a, b) => {
        const rank = { strong: 0, neutral: 1, weak: 2 } as const;
        return rank[a.strength] - rank[b.strength] || b.plan.netAtTarget - a.plan.netAtTarget;
      });
  }, [positions, indicators]);

  // --- The desk agent's call for each sector (stance + per-stock actions) ---
  const sectors = useMemo(() => {
    return strategies.map((st) => {
      const sym = resolveIndex(st);
      const idx = sym ? indexBySymbol[sym] : undefined;
      const verdict: SectorSignal | null = idx ? sectorSignal(idx) : null;
      const be = st.benchmarkEntry;
      const idxPct = idx && be && be.level > 0 ? ((idx.last - be.level) / be.level) * 100 : null;
      let inv = 0;
      let val = 0;
      const stocks = st.stocks.map((x) => {
        const price = priceOf(x.symbol, x.exchange, x.lastPrice ?? x.addedPrice);
        const held = x.heldQty ?? x.qty;
        if (isFinite(price) && x.addedPrice) {
          inv += held * x.addedPrice;
          val += held * price;
        }
        const ind = indicators[yahooSymbol(x.symbol, x.exchange)];
        return {
          symbol: x.symbol,
          name: x.name,
          heldQty: held,
          avg: x.addedPrice ?? price,
          price,
          dayPct: null,
          breakoutScore: ind?.breakout?.score ?? null,
          sma50: ind?.sma50 ?? null,
          sma200: ind?.sma200 ?? null,
          rsi: ind?.rsi ?? null,
          high52: ind?.high52 ?? null,
          low52: ind?.low52 ?? null,
          booked: realizedNow[x.symbol] ?? 0,
          exited: (heldNow[x.symbol] ?? 0) <= 0 && realizedNow[x.symbol] != null,
        };
      });
      const basketPnlPct = inv > 0 ? ((val - inv) / inv) * 100 : 0;
      const call = sectorCall({
        name: st.name,
        verdict: verdict?.label ?? null,
        indexMom1M: idx && isFinite(idx.pct30d) ? idx.pct30d : null,
        basketPnlPct,
        alphaPct: idxPct != null ? basketPnlPct - idxPct : null,
        stocks,
      });
      return { id: st.id, name: st.name, verdict, call };
    });
  }, [strategies, indexBySymbol, indicators, priceOf, heldNow, realizedNow]);

  // Sector-agent actions, flattened and split into sell-side / buy-side.
  const priceLookup = useCallback(
    (symbol: string) => {
      for (const u of universe) if (u.symbol === symbol) return priceOf(symbol, u.exchange);
      return NaN;
    },
    [universe, priceOf]
  );

  const sectorSells = useMemo(() => {
    const rows: { sector: string; symbol: string; action: string; tone: string; note: string; price: number }[] = [];
    for (const s of sectors)
      for (const a of s.call.actions)
        if (a.action === "Exit" || a.action === "Trim" || a.action === "Reduce")
          rows.push({ sector: s.name, symbol: a.symbol, action: a.action, tone: a.tone, note: a.note, price: priceLookup(a.symbol) });
    return rows;
  }, [sectors, priceLookup]);

  const sectorBuys = useMemo(() => {
    const rows: { sector: string; symbol: string; action: string; tone: string; note: string; price: number }[] = [];
    for (const s of sectors)
      for (const a of s.call.actions)
        if (a.action === "Add" || a.action === "Re-enter")
          rows.push({ sector: s.name, symbol: a.symbol, action: a.action, tone: a.tone, note: a.note, price: priceLookup(a.symbol) });
    return rows;
  }, [sectors, priceLookup]);

  // --- BUY side: BTST setups for tomorrow (momentum follow-through) ---
  const btstBuys = useMemo(() => {
    return universe
      .map((u) => {
        const i = indicators[yahooSymbol(u.symbol, u.exchange as never)];
        if (!i?.btstDaily) return null;
        const sc = btstScore(i.btstDaily, i.breakout?.trendAligned ?? false);
        if (sc.score < 50) return null;
        const price = i.price ?? NaN;
        return { symbol: u.symbol, score: sc, price, dayPct: i.btstDaily.dayChangePct };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 10);
  }, [universe, indicators]);

  // Sort state for each of the four tables.
  const sellSort = useSort("net");
  const secSellSort = useSort("action");
  const buySort = useSort("score");
  const secBuySort = useSort("action");

  const sectorLabelOf = useCallback((symbol: string) => (basketBySymbol[symbol] ?? ["Individual"]).join(", "), [basketBySymbol]);

  const btstSellsSorted = useMemo(
    () =>
      sortRows(btstSells, sellSort.sortKey, sellSort.dir, (r, k) =>
        k === "symbol" ? r.symbol
        : k === "sector" ? sectorLabelOf(r.symbol)
        : k === "qty" ? r.qty
        : k === "avg" ? r.avg
        : k === "ltp" ? r.ltp
        : k === "target" ? r.plan.target
        : k === "stop" ? r.plan.stop
        : r.plan.netAtTarget
      ),
    [btstSells, sellSort, sectorLabelOf]
  );
  const sectorSellsSorted = useMemo(
    () =>
      sortRows(sectorSells, secSellSort.sortKey, secSellSort.dir, (r, k) =>
        k === "symbol" ? r.symbol : k === "sector" ? r.sector : k === "price" ? r.price : r.action
      ),
    [sectorSells, secSellSort]
  );
  const btstBuysSorted = useMemo(
    () =>
      sortRows(btstBuys, buySort.sortKey, buySort.dir, (r, k) =>
        k === "symbol" ? r.symbol : k === "sector" ? sectorLabelOf(r.symbol) : k === "price" ? r.price : r.score.score
      ),
    [btstBuys, buySort, sectorLabelOf]
  );
  const sectorBuysSorted = useMemo(
    () =>
      sortRows(sectorBuys, secBuySort.sortKey, secBuySort.dir, (r, k) =>
        k === "symbol" ? r.symbol : k === "sector" ? r.sector : k === "price" ? r.price : r.action
      ),
    [sectorBuys, secBuySort]
  );

  if (!mounted) return null;

  const totalSells = btstSells.length + sectorSells.length;
  const totalBuys = btstBuys.length + sectorBuys.length;
  const strongSectors = sectors.filter((s) => s.verdict && (s.verdict.level === "good")).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle title="Action Board" subtitle="Everything to do next, in one place — from your BTST setups and sector calls" />
        <div className="flex items-center gap-2">
          <button className={`btn-ghost flex items-center gap-2 ${showHelp ? "text-accent" : ""}`} onClick={() => setShowHelp((v) => !v)}>
            <HelpCircle className="w-4 h-4" />
            {showHelp ? "Hide guide" : "What do these mean?"}
          </button>
          <button className="btn-ghost flex items-center gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Pricing…" : "Refresh"}
          </button>
        </div>
      </div>

      {showHelp && <Legend />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label="To sell / trim" value={String(totalSells)} sub="BTST + sector calls" />
        <StatCard label="To buy / add" value={String(totalBuys)} sub="setups + sector calls" />
        <StatCard label="Sectors to favour" value={String(strongSectors)} sub={`of ${sectors.length} baskets`} />
        <StatCard label="Overnight holds" value={String(btstSells.length)} sub="positions to sell T+1" />
      </div>


      {universe.length === 0 && (
        <div className="card text-sm text-zinc-500 mb-6">
          Nothing to act on yet — add positions, holdings or rotation baskets and this board fills in with buy/sell calls.
        </div>
      )}

      {/* SELL / TRIM */}
      <div className="flex items-center gap-2 mb-3">
        <ArrowDownRight className="w-5 h-5 text-loss" />
        <h2 className="text-lg font-semibold tracking-tight">Sell &amp; trim</h2>
      </div>

      {btstSells.length > 0 && (
        <div className="card p-0 overflow-x-auto mb-4">
          <div className="px-4 pt-3 pb-1 text-[11px] text-zinc-500">
            BTST — your overnight holds to sell tomorrow. Sell price is a target sized by today&apos;s close; net is after delivery charges.
          </div>
          <table className="w-full min-w-[940px]">
            <thead>
              <tr>
                <SortTh label="Stock" k="symbol" sort={sellSort} />
                <SortTh label="Sector" k="sector" sort={sellSort} />
                <SortTh label="Shares held" k="qty" sort={sellSort} right />
                <SortTh label="Your avg" k="avg" sort={sellSort} right />
                <th className="th text-right">Amount</th>
                <SortTh label="LTP" k="ltp" sort={sellSort} right />
                <SortTh label="Sell at" k="target" sort={sellSort} right />
                <SortTh label="Stop" k="stop" sort={sellSort} right />
                <SortTh label="Net @ target" k="net" sort={sellSort} right />
                <th className="th">Plan</th>
              </tr>
            </thead>
            <tbody>
              {btstSellsSorted.map((r) => (
                <tr key={r.symbol}>
                  <td className="td">
                    <button className="text-sm font-medium text-accent hover:underline" onClick={() => setStock({ symbol: r.symbol })}>
                      {r.symbol}
                    </button>
                    <span
                      className={`ml-2 text-[10px] px-1.5 py-0.5 rounded capitalize ${
                        r.strength === "strong" ? "bg-gain/15 text-gain" : r.strength === "weak" ? "bg-loss/15 text-loss" : "bg-surface text-zinc-400"
                      }`}
                    >
                      {r.strength}
                    </span>
                  </td>
                  <td className="td"><SectorTag names={basketBySymbol[r.symbol]} /></td>
                  <td className="td text-right font-mono text-xs">{fmtNum(r.qty, 0)}</td>
                  <td className="td text-right font-mono text-xs">{fmtNum(r.avg, 2)}</td>
                  <td className="td text-right font-mono text-xs text-muted">{fmtMoney(r.qty * r.avg, "INR", 0)}</td>
                  <td className="td text-right font-mono text-xs text-muted">{isFinite(r.ltp) ? fmtNum(r.ltp, 2) : "—"}</td>
                  <td className="td text-right font-mono text-sm font-semibold text-accent">{fmtNum(r.plan.target, 2)}</td>
                  <td className="td text-right font-mono text-xs text-muted">{fmtNum(r.plan.stop, 2)}</td>
                  <td className={`td text-right font-mono text-xs ${pnlClass(r.plan.netAtTarget)}`}>{fmtMoney(r.plan.netAtTarget, "INR", 0)}</td>
                  <td className="td text-[11px] text-zinc-400 max-w-[240px]">{r.plan.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sectorSells.length > 0 && (
        <div className="card p-0 overflow-x-auto mb-6">
          <div className="px-4 pt-3 pb-1 text-[11px] text-zinc-500">Sectoral Rotation — stocks the desk agent wants to exit, trim or reduce.</div>
          <table className="w-full min-w-[880px]">
            <thead>
              <tr>
                <SortTh label="Stock" k="symbol" sort={secSellSort} />
                <SortTh label="Sector" k="sector" sort={secSellSort} />
                <SortTh label="Action" k="action" sort={secSellSort} />
                <th className="th text-right">Shares held</th>
                <th className="th text-right">Your avg</th>
                <th className="th text-right">Amount</th>
                <SortTh label="Price now" k="price" sort={secSellSort} right />
                <th className="th">Why / at what level</th>
              </tr>
            </thead>
            <tbody>
              {sectorSellsSorted.map((r) => (
                <tr key={`${r.sector}-${r.symbol}`}>
                  <td className="td">
                    <button className="text-sm font-medium text-accent hover:underline" onClick={() => setStock({ symbol: r.symbol })}>
                      {r.symbol}
                    </button>
                  </td>
                  <td className="td text-xs text-muted">{r.sector}</td>
                  <td className={`td text-xs font-medium ${ACTION_TONE[r.tone]}`}>{r.action}</td>
                  <HeldCells h={heldBySymbol[r.symbol]} />
                  <td className="td text-right font-mono text-xs">{isFinite(r.price) ? fmtNum(r.price, 2) : "—"}</td>
                  <td className="td text-[11px] text-zinc-400 max-w-[360px]">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalSells === 0 && universe.length > 0 && (
        <div className="card text-sm text-zinc-500 mb-6">Nothing flagged to sell or trim right now.</div>
      )}

      {/* BUY / ADD */}
      <div className="flex items-center gap-2 mb-3">
        <ArrowUpRight className="w-5 h-5 text-gain" />
        <h2 className="text-lg font-semibold tracking-tight">Buy &amp; add</h2>
      </div>

      {btstBuys.length > 0 && (
        <div className="card p-0 overflow-x-auto mb-4">
          <div className="px-4 pt-3 pb-1 text-[11px] text-zinc-500">
            BTST setups for tomorrow — strong closes across your stocks. Buy on follow-through near the price, keep the stop tight (overnight gap risk).
          </div>
          <table className="w-full min-w-[940px]">
            <thead>
              <tr>
                <SortTh label="Stock" k="symbol" sort={buySort} />
                <SortTh label="Sector" k="sector" sort={buySort} />
                <th className="th text-right">Shares held</th>
                <th className="th text-right">Your avg</th>
                <th className="th text-right">Amount</th>
                <SortTh label="Score" k="score" sort={buySort} right />
                <SortTh label="Price now" k="price" sort={buySort} right />
                <th className="th text-right">Buy near</th>
                <th className="th text-right">Stop</th>
                <th className="th">Setup</th>
              </tr>
            </thead>
            <tbody>
              {btstBuysSorted.map((c) => {
                const stop = isFinite(c.price) ? c.price * 0.985 : NaN;
                return (
                  <tr key={c.symbol}>
                    <td className="td">
                      <button className="text-sm font-medium text-accent hover:underline" onClick={() => setStock({ symbol: c.symbol })}>
                        {c.symbol}
                      </button>
                      <span
                        className={`ml-2 text-[10px] px-1.5 py-0.5 rounded capitalize ${
                          c.score.verdict === "strong" ? "bg-gain/15 text-gain" : c.score.verdict === "watch" ? "bg-amber-500/15 text-amber-400" : "bg-surface text-zinc-400"
                        }`}
                      >
                        {c.score.verdict}
                      </span>
                    </td>
                    <td className="td"><SectorTag names={basketBySymbol[c.symbol]} /></td>
                    <HeldCells h={heldBySymbol[c.symbol]} />
                    <td className="td text-right font-mono text-xs">{c.score.score}</td>
                    <td className="td text-right font-mono text-xs text-muted">{isFinite(c.price) ? fmtNum(c.price, 2) : "—"}</td>
                    <td className="td text-right font-mono text-sm font-semibold text-accent">{isFinite(c.price) ? fmtNum(c.price, 2) : "—"}</td>
                    <td className="td text-right font-mono text-xs text-muted">{isFinite(stop) ? fmtNum(stop, 2) : "—"}</td>
                    <td className="td text-[11px] text-zinc-400 max-w-[320px]">{c.score.reasons.join(" · ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sectorBuys.length > 0 && (
        <div className="card p-0 overflow-x-auto mb-6">
          <div className="px-4 pt-3 pb-1 text-[11px] text-zinc-500">Sectoral Rotation — stocks the desk agent wants to add to or re-enter.</div>
          <table className="w-full min-w-[880px]">
            <thead>
              <tr>
                <SortTh label="Stock" k="symbol" sort={secBuySort} />
                <SortTh label="Sector" k="sector" sort={secBuySort} />
                <SortTh label="Action" k="action" sort={secBuySort} />
                <th className="th text-right">Shares held</th>
                <th className="th text-right">Your avg</th>
                <th className="th text-right">Amount</th>
                <SortTh label="Price now" k="price" sort={secBuySort} right />
                <th className="th">Entry plan</th>
              </tr>
            </thead>
            <tbody>
              {sectorBuysSorted.map((r) => (
                <tr key={`${r.sector}-${r.symbol}`}>
                  <td className="td">
                    <button className="text-sm font-medium text-accent hover:underline" onClick={() => setStock({ symbol: r.symbol })}>
                      {r.symbol}
                    </button>
                  </td>
                  <td className="td text-xs text-muted">{r.sector}</td>
                  <td className={`td text-xs font-medium ${ACTION_TONE[r.tone]}`}>{r.action}</td>
                  <HeldCells h={heldBySymbol[r.symbol]} />
                  <td className="td text-right font-mono text-xs">{isFinite(r.price) ? fmtNum(r.price, 2) : "—"}</td>
                  <td className="td text-[11px] text-zinc-400 max-w-[380px]">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalBuys === 0 && universe.length > 0 && (
        <div className="card text-sm text-zinc-500 mb-6">No fresh buy setups right now — rescan after the market close.</div>
      )}

      {/* SECTOR STANCE */}
      {sectors.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold tracking-tight">Sectors — invest or not</h2>
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">Click a sector to see its stocks and the action on each.</p>
          <div className="grid md:grid-cols-2 gap-3 mb-6">
            {sectors.map((s) => (
              <SectorStanceCard key={s.id} s={s} onOpenStock={(sym) => setStock({ symbol: sym })} />
            ))}
          </div>
        </>
      )}

      <div className="card border-accent/20 bg-accent/5 flex gap-2">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p className="text-[11px] text-zinc-400">
          This board just gathers the calls already made on the BTST and Sectoral Rotation pages — nothing new is decided here.
          Prices are the latest daily close, so treat targets and stops as starting points and confirm on the live tape. BTST
          carries overnight gap risk. Educational, not investment advice.
        </p>
      </div>

      <IntradayDrawer symbol={stock?.symbol ?? null} name={stock?.name} onClose={() => setStock(null)} />
    </div>
  );
}
