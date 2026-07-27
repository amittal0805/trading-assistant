"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useStore, Strategy } from "@/lib/store";
import { fetchQuotes, yahooSymbol, Quote } from "@/lib/quotes";
import { fmtMoney, fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { PageTitle, Field, NumInput, StatCard, Empty } from "@/components/ui";
import type { IndexRow } from "@/app/api/indices/route";
import { RefreshCw, Trash2, Plus, X } from "lucide-react";

type Quotes = Record<string, Quote>;

// Fallback benchmark index by sector, for baskets without an explicit indexSymbol.
const SECTOR_INDEX: Record<string, string> = {
  pharma: "NIFTY PHARMA",
  "pharma & healthcare": "NIFTY PHARMA",
  healthcare: "NIFTY HEALTHCARE INDEX",
  energy: "NIFTY ENERGY",
  "real estate": "NIFTY REALTY",
  realty: "NIFTY REALTY",
  bank: "NIFTY BANK",
  it: "NIFTY IT",
  auto: "NIFTY AUTO",
  fmcg: "NIFTY FMCG",
  metal: "NIFTY METAL",
  "financial services": "NIFTY FINANCIAL SERVICES",
};

const resolveIndex = (s: Strategy) =>
  s.indexSymbol || (s.sector ? SECTOR_INDEX[s.sector.trim().toLowerCase()] : undefined);

export default function Rotation() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const {
    strategies,
    addStrategy,
    updateStrategy,
    removeStrategy,
    addRotationStock,
    updateRotationStock,
    removeRotationStock,
  } = useStore();

  const [quotes, setQuotes] = useState<Quotes>({});
  const [indices, setIndices] = useState<IndexRow[]>([]);
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

  useEffect(() => {
    if (mounted) refresh();
  }, [mounted, refresh]);

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
          <button className="btn-primary flex items-center gap-2" onClick={() => setNewStratOpen((v) => !v)}>
            <Plus className="w-4 h-4" /> New Strategy
          </button>
        </div>
      </div>

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
          {strategies.map((st) => (
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
              onChangeIndex={(sym) => updateStrategy(st.id, { indexSymbol: sym })}
              onRemove={() => removeStrategy(st.id)}
              onAddStock={(s) => addRotationStock(st.id, s)}
              onUpdateStock={(id, patch) => updateRotationStock(st.id, id, patch)}
              onRemoveStock={(id) => removeRotationStock(st.id, id)}
            />
          ))}
        </div>
      )}
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
  change: number;
}

function StockGroup({
  label,
  labelCls,
  rows,
  totalValue,
  onUpdateStock,
  onRemoveStock,
}: {
  label: string;
  labelCls: string;
  rows: ComputedRow[];
  totalValue: number;
  onUpdateStock: (id: string, patch: Partial<Strategy["stocks"][number]>) => void;
  onRemoveStock: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-surface/40">
        <td className={`td font-medium text-xs ${labelCls}`} colSpan={8}>
          {label}
        </td>
      </tr>
      {rows.map((r) => {
        const weight = totalValue > 0 && isFinite(r.value) ? (r.value / totalValue) * 100 : NaN;
        return (
          <tr key={r.id}>
            <td className="td">
              <div className="text-sm text-accent">{r.name || r.symbol}</div>
              <div className="text-[11px] text-zinc-500 font-mono">{r.symbol}</div>
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
            <td className={`td text-right font-mono font-medium ${r.change > 0 ? "text-gain" : r.change < 0 ? "text-loss" : "text-zinc-500"}`}>
              {r.change > 0 ? "+" : ""}
              {fmtNum(r.change, 0)}
            </td>
            <td className="td text-right font-mono">{isFinite(r.value) ? fmtMoney(r.value) : "—"}</td>
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

function StrategyCard({
  strategy,
  priceOf,
  benchmark,
  benchmarkSymbol,
  indexOptions,
  onChangeIndex,
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
  onChangeIndex: (symbol: string) => void;
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
    const { price, changePct } = priceOf(x.symbol, x.exchange, x.addedPrice);
    const value = isFinite(price) ? price * x.qty : NaN;
    const pnl = isFinite(price) && x.addedPrice ? (price - x.addedPrice) * x.qty : NaN;
    const change = x.qty - (x.heldQty ?? 0);
    return { ...x, price, changePct, value, pnl, change };
  });
  const totalValue = rows.reduce((a, r) => a + (isFinite(r.value) ? r.value : 0), 0);
  const totalPnl = rows.reduce((a, r) => a + (isFinite(r.pnl) ? r.pnl : 0), 0);
  const dayChange = rows.reduce(
    (a, r) => a + (isFinite(r.value) && r.changePct !== null ? (r.value * r.changePct) / 100 : 0),
    0
  );
  const buys = rows.filter((r) => r.change > 0);
  const sells = rows.filter((r) => r.change < 0);
  const holds = rows.filter((r) => r.change === 0);

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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{strategy.name}</h2>
            {strategy.sector && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">
                {strategy.sector}
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5">
            {buys.length > 0 && <span className="text-gain">Buying: {buys.length}</span>}
            {buys.length > 0 && sells.length > 0 && <span className="text-zinc-600"> · </span>}
            {sells.length > 0 && <span className="text-loss">Selling: {sells.length}</span>}
            {buys.length === 0 && sells.length === 0 && <span className="text-muted">{holds.length} holdings</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-5 text-right">
          <div>
            <div className="text-[11px] text-muted">Planned value</div>
            <div className="font-mono text-sm">{fmtMoney(totalValue)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Day</div>
            <div className={`font-mono text-sm ${pnlClass(dayChange)}`}>{fmtMoney(dayChange)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">P/L vs entry</div>
            <div className={`font-mono text-sm ${pnlClass(totalPnl)}`}>{fmtMoney(totalPnl)}</div>
          </div>
          <button className="text-zinc-600 hover:text-loss" onClick={onRemove} title="Delete strategy">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 bg-surface/40 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">Sector index</span>
          <select
            className="bg-card border border-border rounded-md px-2 py-1 text-xs text-zinc-200 outline-none focus:border-accent max-w-[200px]"
            value={benchmarkSymbol ?? ""}
            onChange={(e) => onChangeIndex(e.target.value)}
          >
            {!benchmarkSymbol && <option value="">— pick an index —</option>}
            {benchmarkSymbol && !indexOptions.some((o) => o.symbol === benchmarkSymbol) && (
              <option value={benchmarkSymbol}>{benchmarkSymbol}</option>
            )}
            {indexOptions.map((o) => (
              <option key={o.symbol} value={o.symbol}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        {benchmark ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm">
            <span className="text-zinc-100">{fmtNum(benchmark.last, 2)}</span>
            <span className={pnlClass(benchmark.pctChange)}>
              {fmtNum(benchmark.change, 2)} ({fmtPct(benchmark.pctChange)})
            </span>
            <span className="text-[11px] text-muted">
              1M <span className={pnlClass(benchmark.pct30d)}>{fmtPct(benchmark.pct30d)}</span>
            </span>
            <span className="text-[11px] text-muted">
              1Y <span className={pnlClass(benchmark.pct365d)}>{fmtPct(benchmark.pct365d)}</span>
            </span>
            <span className="text-[11px] text-zinc-600">
              52w {fmtNum(benchmark.yearLow, 0)}–{fmtNum(benchmark.yearHigh, 0)}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-zinc-500">
            {benchmarkSymbol ? "Index data loads on Refresh (needs NSE access)." : "No index set for this sector."}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th className="th">Constituent</th>
              <th className="th text-right">Price (₹)</th>
              <th className="th text-right">New Qty</th>
              <th className="th text-right">Change</th>
              <th className="th text-right">Value</th>
              <th className="th text-right">Weight %</th>
              <th className="th text-right">Day %</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="td text-sm text-zinc-500" colSpan={8}>
                  No stocks yet — add the ones you plan to buy.
                </td>
              </tr>
            ) : (
              (
                [
                  ["Stocks you are buying", "text-gain", buys],
                  ["Stocks you are selling", "text-loss", sells],
                  ["Holding (no change)", "text-muted", holds],
                ] as const
              )
                .filter(([, , group]) => group.length > 0)
                .map(([label, cls, group]) => (
                  <StockGroup
                    key={label}
                    label={`${label}: ${group.length}`}
                    labelCls={cls}
                    rows={group}
                    totalValue={totalValue}
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
