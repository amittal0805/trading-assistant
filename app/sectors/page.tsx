"use client";

import { useEffect, useState } from "react";
import { PageTitle, Empty } from "@/components/ui";
import { fmtNum, fmtPct } from "@/lib/format";
import { RefreshCw } from "lucide-react";

interface SectorRow {
  name: string;
  group: "Broad Market" | "Sectoral" | "Thematic";
  symbol: string;
  last: number;
  d1: number | null;
  w1: number | null;
  m1: number | null;
}

type SortKey = "d1" | "w1" | "m1" | "name";
const GROUPS: SectorRow["group"][] = ["Broad Market", "Sectoral", "Thematic"];

function cellCls(v: number | null) {
  if (v === null) return "text-zinc-600";
  if (v > 0) return "text-gain bg-gain/5";
  if (v < 0) return "text-loss bg-loss/5";
  return "text-zinc-400";
}

export default function Sectors() {
  const [rows, setRows] = useState<SectorRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("d1");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/sector");
      if (!r.ok) throw new Error();
      setRows(await r.json());
    } catch {
      setError("Failed to load index data — check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? 1 : -1);
    }
  };

  const sortFn = (a: SectorRow, b: SectorRow) => {
    if (sortKey === "name") return a.name.localeCompare(b.name) * sortDir;
    return ((a[sortKey] ?? -999) - (b[sortKey] ?? -999)) * sortDir;
  };

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="th cursor-pointer select-none hover:text-zinc-200" onClick={() => onSort(k)}>
      {label}
      {sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageTitle
          title="Sector Trends"
          subtitle="NSE indices as classified on niftyindices.com — 1 day, 1 week, 30 days"
        />
        <button className="btn-ghost !py-1.5 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <Empty text={error} />}
      {!error && !rows && <Empty text="Loading index data…" />}
      {rows && rows.length === 0 && <Empty text="No index data returned — try refreshing." />}

      {rows &&
        GROUPS.map((group) => {
          const groupRows = rows.filter((r) => r.group === group).sort(sortFn);
          if (groupRows.length === 0) return null;
          return (
            <div key={group} className="mb-6">
              <h2 className="text-sm font-medium mb-2 text-zinc-300">{group}</h2>
              <div className="card p-0 overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <Th k="name" label="Index" />
                      <th className="th">Level</th>
                      <Th k="d1" label="1 Day" />
                      <Th k="w1" label="1 Week" />
                      <Th k="m1" label="30 Days" />
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map((s) => (
                      <tr key={s.symbol} className="hover:bg-surface/50">
                        <td className="td font-medium">{s.name}</td>
                        <td className="td font-mono text-muted">{fmtNum(s.last)}</td>
                        <td className={`td font-mono ${cellCls(s.d1)}`}>{s.d1 !== null ? fmtPct(s.d1) : "—"}</td>
                        <td className={`td font-mono ${cellCls(s.w1)}`}>{s.w1 !== null ? fmtPct(s.w1) : "—"}</td>
                        <td className={`td font-mono ${cellCls(s.m1)}`}>{s.m1 !== null ? fmtPct(s.m1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

      <p className="text-[11px] text-zinc-600 mt-1">
        Index list framed on the official NSE sectoral classification (niftyindices.com). Data via Yahoo
        Finance — indices without Yahoo coverage (e.g. Hospitals, NBFC, Insurance, some newer indices) are
        omitted automatically. Weekly = 5 sessions, 30 days ≈ 21 sessions. Informational only.
      </p>
    </div>
  );
}
