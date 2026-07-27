"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { fmtNum, fmtPct, pnlClass } from "@/lib/format";
import type { StockRow } from "@/app/api/index-constituents/route";
import { X, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";

type SortKey = "company" | "last" | "pctChange" | "valueCr" | "pct30d" | "pct365d";

interface Resp {
  index: string;
  stocks: StockRow[];
  timestamp: string;
  error?: string;
}

export default function ConstituentsDrawer({ index, onClose }: { index: string | null; onClose: () => void }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pctChange");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async (idx: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/index-constituents?index=${encodeURIComponent(idx)}`, { cache: "no-store" });
      const j = (await r.json()) as Resp;
      if (!r.ok || j.error) setError(j.error || `Request failed (${r.status})`);
      else setData(j);
    } catch {
      setError("Network error loading constituents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (index) {
      setData(null);
      load(index);
    }
  }, [index, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "company" ? "asc" : "desc");
    }
  };

  const stocks = useMemo(() => {
    if (!data?.stocks) return [];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data.stocks].sort((a, b) => {
      if (sortKey === "company") return a.company.localeCompare(b.company) * dir;
      const av = isFinite(a[sortKey]) ? a[sortKey] : -Infinity;
      const bv = isFinite(b[sortKey]) ? b[sortKey] : -Infinity;
      return (av - bv) * dir;
    });
  }, [data, sortKey, sortDir]);

  const breadth = useMemo(() => {
    if (!data?.stocks) return null;
    const adv = data.stocks.filter((s) => s.pctChange > 0).length;
    const dec = data.stocks.filter((s) => s.pctChange < 0).length;
    return { adv, dec, unch: data.stocks.length - adv - dec, total: data.stocks.length };
  }, [data]);

  const SortTh = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`th cursor-pointer select-none hover:text-zinc-200 ${right ? "text-right" : ""}`} onClick={() => setSort(k)}>
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  if (!index) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-bg border-l border-border shadow-2xl flex flex-col animate-[slideIn_.15s_ease-out]">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold tracking-tight">{index}</h2>
            <p className="text-[11px] text-muted">
              {breadth ? `${breadth.total} constituents` : "constituents"}
              {breadth && (
                <>
                  {" · "}
                  <span className="text-gain">{breadth.adv} up</span> / <span className="text-loss">{breadth.dec} down</span>
                </>
              )}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost flex items-center gap-2 py-1.5" onClick={() => index && load(index)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button className="text-zinc-500 hover:text-zinc-200 p-1" onClick={onClose} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-5">
              <div className="card border-loss/30 bg-loss/5 text-sm">
                <p className="text-loss font-medium mb-1">Couldn&apos;t load constituents</p>
                <p className="text-muted">{error}</p>
              </div>
            </div>
          ) : loading && !data ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading constituents…</div>
          ) : data ? (
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0 bg-bg z-10">
                <tr>
                  <SortTh k="company" label="Stock" />
                  <SortTh k="last" label="Last" right />
                  <SortTh k="pctChange" label="%Chg" right />
                  <th className="th text-right">Day range</th>
                  <SortTh k="valueCr" label="Value (₹Cr)" right />
                  <SortTh k="pct30d" label="1M" right />
                  <SortTh k="pct365d" label="1Y" right />
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => {
                  const dayPos =
                    s.high > s.low ? ((s.last - s.low) / (s.high - s.low)) * 100 : 50;
                  return (
                    <tr key={s.symbol}>
                      <td className="td">
                        <div className="text-sm font-medium">{s.symbol}</div>
                        <div className="text-[11px] text-muted truncate max-w-[220px]">{s.company}</div>
                      </td>
                      <td className="td text-right font-mono">{fmtNum(s.last, 2)}</td>
                      <td className={`td text-right font-mono font-medium ${pnlClass(s.pctChange)}`}>
                        {fmtPct(s.pctChange)}
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-[10px] text-zinc-600 font-mono">{fmtNum(s.low, 0)}</span>
                          <div className="h-1 w-16 rounded-full bg-surface overflow-hidden">
                            <div
                              className="h-full bg-accent/60"
                              style={{ width: `${Math.max(0, Math.min(100, dayPos))}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-600 font-mono">{fmtNum(s.high, 0)}</span>
                        </div>
                      </td>
                      <td className="td text-right font-mono text-xs text-muted">{fmtNum(s.valueCr, 0)}</td>
                      <td className={`td text-right font-mono text-xs ${pnlClass(s.pct30d)}`}>{fmtPct(s.pct30d)}</td>
                      <td className={`td text-right font-mono text-xs ${pnlClass(s.pct365d)}`}>{fmtPct(s.pct365d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        {data?.timestamp && (
          <div className="px-5 py-2 border-t border-border text-[11px] text-zinc-500 shrink-0">
            NSE timestamp: {data.timestamp}
          </div>
        )}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>
    </div>
  );
}
