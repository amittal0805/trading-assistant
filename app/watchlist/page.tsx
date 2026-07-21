"use client";

import { useEffect, useState } from "react";
import { useStore, WatchItem } from "@/lib/store";
import { Exchange } from "@/lib/charges";
import { yahooSymbol } from "@/lib/quotes";
import { sma, rsi, macd, trendSignal } from "@/lib/indicators";
import { fmtMoney, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, Field, Empty } from "@/components/ui";
import { Trash2, RefreshCw } from "lucide-react";

interface Row {
  price: number | null;
  dayPct: number | null;
  rsi14: number | null;
  trend: string;
  macdHist: number | null;
  high52: number | null;
  low52: number | null;
  fromHighPct: number | null;
}

export default function Watchlist() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { watchlist, addWatch, removeWatch } = useStore();

  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(false);

  const load = async (items: WatchItem[]) => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        items.map(async (w) => {
          try {
            const r = await fetch(`/api/history?symbol=${encodeURIComponent(yahooSymbol(w.symbol, w.exchange))}`);
            if (!r.ok) return [w.id, null] as const;
            const j = await r.json();
            const closes: number[] = j.closes ?? [];
            const price: number | null = j.price;
            const m = macd(closes);
            const row: Row = {
              price,
              dayPct:
                price && j.prevClose && j.prevClose > 0 ? ((price - j.prevClose) / j.prevClose) * 100 : null,
              rsi14: rsi(closes),
              trend: price ? trendSignal(price, sma(closes, 20), sma(closes, 50)) : "—",
              macdHist: m ? m.hist : null,
              high52: j.high52,
              low52: j.low52,
              fromHighPct: price && j.high52 ? ((price - j.high52) / j.high52) * 100 : null,
            };
            return [w.id, row] as const;
          } catch {
            return [w.id, null] as const;
          }
        })
      );
      setRows((prev) => {
        const next = { ...prev };
        results.forEach(([id, row]) => {
          if (row) next[id] = row;
        });
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && watchlist.length > 0) load(watchlist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;

  const add = () => {
    if (!symbol.trim()) return;
    addWatch({ symbol: symbol.trim().toUpperCase(), exchange });
    setSymbol("");
    setTimeout(() => load(useStore.getState().watchlist), 100);
  };

  const rsiCls = (v: number | null) =>
    v === null ? "text-zinc-600" : v >= 70 ? "text-loss" : v <= 30 ? "text-gain" : "text-zinc-300";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Watchlist" subtitle="Live prices with RSI, trend, MACD, and 52-week levels" />
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => load(watchlist)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="card mb-6 max-w-xl">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
          <Field label="Stock Symbol">
            <input
              className="input"
              value={symbol}
              placeholder="TCS"
              onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </Field>
          <Field label="Exchange">
            <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
              <option>NSE</option><option>BSE</option><option>NYSE</option><option>NASDAQ</option>
            </select>
          </Field>
          <button className="btn-primary" onClick={add}>Add</button>
        </div>
      </div>

      {watchlist.length === 0 ? (
        <Empty text="Watchlist is empty — add stocks above to track prices and indicators." />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr>
                <th className="th">Stock</th>
                <th className="th">Price</th>
                <th className="th">Day %</th>
                <th className="th">RSI (14)</th>
                <th className="th">Trend (20/50 SMA)</th>
                <th className="th">MACD</th>
                <th className="th">52W High</th>
                <th className="th">52W Low</th>
                <th className="th">From High</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w) => {
                const r = rows[w.id];
                const ccy = currencyFor(w.exchange);
                return (
                  <tr key={w.id} className="hover:bg-surface/50">
                    <td className="td font-medium">
                      {w.symbol} <span className="text-xs text-muted">{w.exchange}</span>
                    </td>
                    <td className="td font-mono">{r?.price ? fmtMoney(r.price, ccy) : "—"}</td>
                    <td className={`td font-mono ${r?.dayPct != null ? pnlClass(r.dayPct) : "text-zinc-600"}`}>
                      {r?.dayPct != null ? fmtPct(r.dayPct) : "—"}
                    </td>
                    <td className={`td font-mono ${rsiCls(r?.rsi14 ?? null)}`}>
                      {r?.rsi14 != null ? r.rsi14.toFixed(1) : "—"}
                      {r?.rsi14 != null && (r.rsi14 >= 70 ? " (overbought)" : r.rsi14 <= 30 ? " (oversold)" : "")}
                    </td>
                    <td className={`td text-xs ${r?.trend === "Uptrend" ? "text-gain" : r?.trend === "Downtrend" ? "text-loss" : "text-zinc-400"}`}>
                      {r?.trend ?? "—"}
                    </td>
                    <td className={`td font-mono text-xs ${r?.macdHist != null ? pnlClass(r.macdHist) : "text-zinc-600"}`}>
                      {r?.macdHist != null ? (r.macdHist > 0 ? "Bullish" : "Bearish") : "—"}
                    </td>
                    <td className="td font-mono text-xs">{r?.high52 ? fmtMoney(r.high52, ccy) : "—"}</td>
                    <td className="td font-mono text-xs">{r?.low52 ? fmtMoney(r.low52, ccy) : "—"}</td>
                    <td className={`td font-mono text-xs ${r?.fromHighPct != null ? pnlClass(r.fromHighPct) : "text-zinc-600"}`}>
                      {r?.fromHighPct != null ? fmtPct(r.fromHighPct) : "—"}
                    </td>
                    <td className="td">
                      <button onClick={() => removeWatch(w.id)} className="text-zinc-600 hover:text-loss">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-zinc-600 mt-3">
        Indicators from 1 year of daily closes via Yahoo Finance. RSI ≥ 70 overbought, ≤ 30 oversold. Trend:
        price vs 20/50-day SMAs. MACD (12,26,9) histogram sign. Informational only.
      </p>
    </div>
  );
}
