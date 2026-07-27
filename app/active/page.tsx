"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { PageTitle, StatCard } from "@/components/ui";
import { fmtNum, fmtPct, pnlClass } from "@/lib/format";
import type { ActiveRow } from "@/app/api/most-active/route";
import { RefreshCw, ArrowUp, ArrowDown } from "lucide-react";

interface Resp {
  byVolume: ActiveRow[];
  byValue: ActiveRow[];
  timestamp: string;
  error?: string;
}

type Mode = "volume" | "value";
type SortKey = "symbol" | "last" | "pctChange" | "volume" | "valueCr";

/** Compact Indian-style quantity: crore / lakh / thousand. */
function fmtQty(v: number) {
  if (!isFinite(v)) return "—";
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return String(v);
}

function fmtCr(v: number) {
  if (!isFinite(v)) return "—";
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L Cr`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)} K Cr`;
  return `${fmtNum(v, 0)} Cr`;
}

export default function MostActive() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("volume");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [auto, setAuto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/most-active", { cache: "no-store" });
      const j = (await r.json()) as Resp;
      if (!r.ok || j.error) setError(j.error || `Request failed (${r.status})`);
      else setData(j);
    } catch {
      setError("Network error reaching the most-active API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [auto, load]);

  const base = useMemo(() => (data ? (mode === "volume" ? data.byVolume : data.byValue) : []), [data, mode]);

  const totals = useMemo(() => {
    if (!base.length) return null;
    const value = base.reduce((a, r) => a + (isFinite(r.valueCr) ? r.valueCr : 0), 0);
    const adv = base.filter((r) => r.pctChange > 0).length;
    const dec = base.filter((r) => r.pctChange < 0).length;
    return { value, adv, dec, n: base.length };
  }, [base]);

  const rows = useMemo(() => {
    let out = base;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => r.symbol.toLowerCase().includes(q));
    }
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
        const av = isFinite(a[sortKey]) ? a[sortKey] : -Infinity;
        const bv = isFinite(b[sortKey]) ? b[sortKey] : -Infinity;
        return (av - bv) * dir;
      });
    }
    return out;
  }, [base, query, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const SortTh = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`th cursor-pointer select-none hover:text-zinc-200 ${right ? "text-right" : ""}`} onClick={() => setSort(k)}>
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle title="Most Active Equities" subtitle="NSE's most traded stocks by volume and by value" />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto (30s)
          </label>
          <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-loss/30 bg-loss/5 text-sm text-zinc-300 mb-4">
          <p className="font-medium text-loss mb-1">Couldn&apos;t load most-active data</p>
          <p className="text-muted">{error}</p>
          <p className="text-[11px] text-zinc-500 mt-2">
            NSE only serves this to machines that can reach nseindia.com and sometimes rate-limits. Try Refresh.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 mt-2">
        <div className="inline-flex rounded-lg bg-surface p-0.5">
          {(["volume", "value"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              By {m === "volume" ? "Volume" : "Value"}
            </button>
          ))}
        </div>
        <input
          className="input ml-auto max-w-[220px] py-1.5"
          placeholder="Filter symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard label={`Stocks (top ${totals.n})`} value={String(totals.n)} sub={`by ${mode}`} />
          <StatCard label="Combined traded value" value={fmtCr(totals.value)} sub="across this list" />
          <StatCard
            label="Advancing / declining"
            value={`${totals.adv} / ${totals.dec}`}
            sub="in this list"
            pnl={totals.adv - totals.dec}
          />
        </div>
      )}

      {data && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                <th className="th w-8">#</th>
                <SortTh k="symbol" label="Stock" />
                <SortTh k="last" label="Last" right />
                <SortTh k="pctChange" label="%Chg" right />
                <th className="th text-right">Open</th>
                <th className="th text-right">High</th>
                <th className="th text-right">Low</th>
                <SortTh k="volume" label="Volume" right />
                <SortTh k="valueCr" label="Value (₹Cr)" right />
                <th className="th text-right">52w range</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rng = r.yearHigh > r.yearLow ? ((r.last - r.yearLow) / (r.yearHigh - r.yearLow)) * 100 : 50;
                return (
                  <tr key={r.symbol}>
                    <td className="td text-xs text-zinc-600 font-mono">{i + 1}</td>
                    <td className="td text-sm font-medium">{r.symbol}</td>
                    <td className="td text-right font-mono">{fmtNum(r.last, 2)}</td>
                    <td className={`td text-right font-mono font-medium ${pnlClass(r.pctChange)}`}>{fmtPct(r.pctChange)}</td>
                    <td className="td text-right font-mono text-muted text-xs">{fmtNum(r.open, 2)}</td>
                    <td className="td text-right font-mono text-muted text-xs">{fmtNum(r.high, 2)}</td>
                    <td className="td text-right font-mono text-muted text-xs">{fmtNum(r.low, 2)}</td>
                    <td className={`td text-right font-mono ${mode === "volume" ? "text-zinc-100 font-medium" : "text-muted"}`}>
                      {fmtQty(r.volume)}
                    </td>
                    <td className={`td text-right font-mono ${mode === "value" ? "text-zinc-100 font-medium" : "text-muted"}`}>
                      {fmtNum(r.valueCr, 0)}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-[10px] text-zinc-600 font-mono">{fmtNum(r.yearLow, 0)}</span>
                        <div className="h-1 w-14 rounded-full bg-surface overflow-hidden">
                          <div className="h-full bg-accent/60" style={{ width: `${Math.max(0, Math.min(100, rng))}%` }} />
                        </div>
                        <span className="text-[10px] text-zinc-600 font-mono">{fmtNum(r.yearHigh, 0)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="td text-sm text-zinc-500" colSpan={10}>
                    {loading ? "Loading…" : "No stocks match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data?.timestamp && (
        <p className="text-[11px] text-zinc-500 mt-3">
          NSE timestamp: {data.timestamp} · source: nseindia.com most-active-equities
        </p>
      )}
    </div>
  );
}
