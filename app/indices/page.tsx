"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { PageTitle, StatCard } from "@/components/ui";
import { fmtNum, fmtPct, pnlClass } from "@/lib/format";
import type { IndexRow } from "@/app/api/indices/route";
import ConstituentsDrawer from "@/components/ConstituentsDrawer";
import { RefreshCw, ArrowUp, ArrowDown, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";

interface IndicesResponse {
  rows: IndexRow[];
  timestamp: string;
  fetchedAt: string;
  error?: string;
}

type SortKey = "name" | "last" | "change" | "pctChange" | "pct30d" | "pct365d" | "pe";

const GROUP_ORDER = [
  "BROAD MARKET INDICES",
  "SECTORAL INDICES",
  "INDICES ELIGIBLE IN DERIVATIVES",
  "STRATEGY INDICES",
  "THEMATIC INDICES",
  "FIXED INCOME INDICES",
];

const shortGroup = (g: string) =>
  g
    .replace(" INDICES", "")
    .replace("INDICES ELIGIBLE IN DERIVATIVES", "Derivatives")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());

export default function Indices() {
  const [data, setData] = useState<IndicesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [group, setGroup] = useState<string>("BROAD MARKET INDICES");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pctChange");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [auto, setAuto] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/indices", { cache: "no-store" });
      const j = (await r.json()) as IndicesResponse;
      if (!r.ok || j.error) {
        setError(j.error || `Request failed (${r.status})`);
      } else {
        setData(j);
      }
    } catch {
      setError("Network error reaching the indices API.");
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

  const groups = useMemo(() => {
    if (!data?.rows) return [];
    const present = Array.from(new Set(data.rows.map((r) => r.group)));
    const ordered = GROUP_ORDER.filter((g) => present.includes(g));
    const extras = present.filter((g) => !GROUP_ORDER.includes(g));
    return [...ordered, ...extras];
  }, [data]);

  const nifty = useMemo(() => data?.rows.find((r) => r.symbol === "NIFTY 50"), [data]);
  const sensexLike = useMemo(
    () => data?.rows.find((r) => r.symbol === "NIFTY BANK") ?? null,
    [data]
  );

  const movers = useMemo(() => {
    if (!data?.rows) return { up: [] as IndexRow[], down: [] as IndexRow[] };
    const sortable = data.rows.filter((r) => isFinite(r.pctChange));
    const up = [...sortable].sort((a, b) => b.pctChange - a.pctChange).slice(0, 5);
    const down = [...sortable].sort((a, b) => a.pctChange - b.pctChange).slice(0, 5);
    return { up, down };
  }, [data]);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    let out = data.rows.filter((r) => r.group === group);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = a[sortKey];
      const bv = b[sortKey];
      const aa = isFinite(av) ? av : -Infinity;
      const bb = isFinite(bv) ? bv : -Infinity;
      return (aa - bb) * dir;
    });
    return out;
  }, [data, group, query, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const SortTh = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      className={`th cursor-pointer select-none hover:text-zinc-200 ${right ? "text-right" : ""}`}
      onClick={() => setSort(k)}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        {sortKey === k &&
          (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  const ts = data?.timestamp ? data.timestamp : "";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle title="Market Indices" subtitle="Live NSE indices — broad market, sectoral, strategy & more" />
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
          <p className="font-medium text-loss mb-1">Couldn&apos;t load NSE indices</p>
          <p className="text-muted">{error}</p>
          <p className="text-[11px] text-zinc-500 mt-2">
            NSE only serves this data to machines that can reach nseindia.com and sometimes rate-limits. Try Refresh, or
            check that the app server has internet access.
          </p>
        </div>
      )}

      {nifty && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="NIFTY 50"
            value={fmtNum(nifty.last, 2)}
            sub={`${fmtNum(nifty.change, 2)} (${fmtPct(nifty.pctChange)})`}
            pnl={nifty.pctChange}
          />
          {sensexLike && (
            <StatCard
              label="NIFTY BANK"
              value={fmtNum(sensexLike.last, 2)}
              sub={`${fmtNum(sensexLike.change, 2)} (${fmtPct(sensexLike.pctChange)})`}
              pnl={sensexLike.pctChange}
            />
          )}
          {nifty && (
            <StatCard
              label="NIFTY 50 · 52-wk range"
              value={fmtNum(nifty.last, 0)}
              sub={`${fmtNum(nifty.yearLow, 0)} – ${fmtNum(nifty.yearHigh, 0)}`}
            />
          )}
          {nifty && (
            <StatCard label="NIFTY 50 · 1Y" value={fmtPct(nifty.pct365d)} pnl={nifty.pct365d} sub="price return" />
          )}
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="card p-0 overflow-hidden">
            <h3 className="text-xs font-medium text-gain px-3 pt-3 pb-1 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Top gainers (all indices)
            </h3>
            <MoverTable rows={movers.up} onSelect={setSelected} />
          </div>
          <div className="card p-0 overflow-hidden">
            <h3 className="text-xs font-medium text-loss px-3 pt-3 pb-1 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Top losers (all indices)
            </h3>
            <MoverTable rows={movers.down} onSelect={setSelected} />
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                group === g ? "bg-accent/15 text-accent" : "bg-surface text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {shortGroup(g)}
            </button>
          ))}
          <input
            className="input ml-auto max-w-[220px] py-1.5"
            placeholder="Filter indices…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {data && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <SortTh k="name" label="Index" />
                <SortTh k="last" label="Last" right />
                <SortTh k="change" label="Chg" right />
                <SortTh k="pctChange" label="%Chg" right />
                <th className="th text-right">Open</th>
                <th className="th text-right">High</th>
                <th className="th text-right">Low</th>
                <th className="th text-right">Prev</th>
                <th className="th text-right">Breadth</th>
                <SortTh k="pct30d" label="1M" right />
                <SortTh k="pct365d" label="1Y" right />
                <SortTh k="pe" label="P/E" right />
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rng = r.yearHigh > r.yearLow ? ((r.last - r.yearLow) / (r.yearHigh - r.yearLow)) * 100 : 0;
                return (
                  <tr
                    key={r.symbol}
                    className="cursor-pointer hover:bg-surface/60 transition-colors"
                    onClick={() => setSelected(r.symbol)}
                    title={`View constituents of ${r.name}`}
                  >
                    <td className="td">
                      <div className="text-sm">{r.name}</div>
                      <div className="h-1 mt-1 w-24 rounded-full bg-surface overflow-hidden" title="Position in 52-week range">
                        <div className="h-full bg-accent/60" style={{ width: `${Math.max(0, Math.min(100, rng))}%` }} />
                      </div>
                    </td>
                    <td className="td text-right font-mono">{fmtNum(r.last, 2)}</td>
                    <td className={`td text-right font-mono ${pnlClass(r.change)}`}>{fmtNum(r.change, 2)}</td>
                    <td className={`td text-right font-mono font-medium ${pnlClass(r.pctChange)}`}>{fmtPct(r.pctChange)}</td>
                    <td className="td text-right font-mono text-muted">{fmtNum(r.open, 2)}</td>
                    <td className="td text-right font-mono text-muted">{fmtNum(r.high, 2)}</td>
                    <td className="td text-right font-mono text-muted">{fmtNum(r.low, 2)}</td>
                    <td className="td text-right font-mono text-muted">{fmtNum(r.prevClose, 2)}</td>
                    <td className="td text-right font-mono text-xs">
                      {isFinite(r.advances) ? (
                        <span>
                          <span className="text-gain">{r.advances}</span>
                          <span className="text-zinc-600">/</span>
                          <span className="text-loss">{r.declines}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className={`td text-right font-mono text-xs ${pnlClass(r.pct30d)}`}>{fmtPct(r.pct30d)}</td>
                    <td className={`td text-right font-mono text-xs ${pnlClass(r.pct365d)}`}>{fmtPct(r.pct365d)}</td>
                    <td className="td text-right font-mono text-xs text-muted">{isFinite(r.pe) && r.pe > 0 ? fmtNum(r.pe, 2) : "—"}</td>
                    <td className="td text-right text-zinc-600">
                      <ChevronRight className="w-4 h-4 inline" />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="td text-sm text-zinc-500" colSpan={13}>
                    {loading ? "Loading…" : "No indices match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {ts && (
        <p className="text-[11px] text-zinc-500 mt-3">
          Click any index to see its constituents · NSE timestamp: {ts} · source: nseindia.com/api/allIndices
        </p>
      )}

      <ConstituentsDrawer index={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function MoverTable({ rows, onSelect }: { rows: IndexRow[]; onSelect: (s: string) => void }) {
  return (
    <table className="w-full">
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.symbol}
            className="cursor-pointer hover:bg-surface/60 transition-colors"
            onClick={() => onSelect(r.symbol)}
          >
            <td className="td text-sm">{r.name}</td>
            <td className="td text-right font-mono text-xs text-muted">{fmtNum(r.last, 2)}</td>
            <td className={`td text-right font-mono text-sm font-medium ${pnlClass(r.pctChange)}`}>
              {fmtPct(r.pctChange)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
