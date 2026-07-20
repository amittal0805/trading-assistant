"use client";

import { useEffect, useState } from "react";
import { PageTitle, StatCard, Empty } from "@/components/ui";
import { fmtMoney, fmtPct, pnlClass } from "@/lib/format";
import { RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface Snapshot {
  date: string;
  invested: number;
  value: number;
  pl: number;
  realizedToday: number;
  chargesToday: number;
}

function nearestOnOrBefore(snaps: Snapshot[], daysAgo: number): Snapshot | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysAgo);
  const c = cutoff.toISOString().slice(0, 10);
  const eligible = snaps.filter((s) => s.date <= c);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

export default function Trends() {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/snapshot");
      if (r.ok) setSnaps(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const latest = snaps && snaps.length ? snaps[snaps.length - 1] : null;
  const weekAgo = snaps ? nearestOnOrBefore(snaps, 7) : null;
  const monthAgo = snaps ? nearestOnOrBefore(snaps, 30) : null;

  const delta = (base: Snapshot | null) =>
    latest && base && base.date !== latest.date
      ? { abs: latest.value - base.value, pct: base.value > 0 ? ((latest.value - base.value) / base.value) * 100 : 0, since: base.date }
      : null;

  const dWeek = delta(weekAgo);
  const dMonth = delta(monthAgo);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Performance Trends" subtitle="Daily snapshots of your Indian portfolio — saved automatically when you open the Dashboard" />
        <button className="btn-ghost !py-1.5 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {!snaps || snaps.length === 0 ? (
        <Empty text="No snapshots yet. Open the Dashboard once (with holdings loaded) to record today's snapshot — history builds up day by day." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Portfolio Value (latest)" value={fmtMoney(latest!.value)} sub={latest!.date} />
            <StatCard label="Overall P/L" value={fmtMoney(latest!.pl)} pnl={latest!.pl} />
            <StatCard
              label="Change vs 1 Week"
              value={dWeek ? `${fmtMoney(dWeek.abs)} (${fmtPct(dWeek.pct)})` : "—"}
              pnl={dWeek?.abs}
              sub={dWeek ? `since ${dWeek.since}` : "need ≥1 week of snapshots"}
            />
            <StatCard
              label="Change vs 1 Month"
              value={dMonth ? `${fmtMoney(dMonth.abs)} (${fmtPct(dMonth.pct)})` : "—"}
              pnl={dMonth?.abs}
              sub={dMonth ? `since ${dMonth.since}` : "need ≥1 month of snapshots"}
            />
          </div>

          <div className="card mb-6">
            <h2 className="text-sm font-medium mb-4">Portfolio Value</h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={snaps} margin={{ left: 10, right: 10 }}>
                <CartesianGrid stroke="#23232f" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#8b8b9e" fontSize={11} />
                <YAxis stroke="#8b8b9e" fontSize={11} domain={["auto", "auto"]} width={80}
                  tickFormatter={(v: number) => `${(v / 100000).toFixed(1)}L`} />
                <Tooltip
                  contentStyle={{ background: "#16161f", border: "1px solid #23232f", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => fmtMoney(Number(v))}
                />
                <Line type="monotone" dataKey="value" name="Value" stroke="#3b82f6" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="invested" name="Invested" stroke="#8b8b9e" dot={false} strokeWidth={1} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-0 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="th">Date</th><th className="th">Invested</th><th className="th">Value</th>
                  <th className="th">P/L</th><th className="th">Day Realized</th><th className="th">Day Charges</th>
                </tr>
              </thead>
              <tbody>
                {[...snaps].reverse().map((s) => (
                  <tr key={s.date} className="hover:bg-surface/50">
                    <td className="td font-mono text-muted">{s.date}</td>
                    <td className="td font-mono">{fmtMoney(s.invested)}</td>
                    <td className="td font-mono">{fmtMoney(s.value)}</td>
                    <td className={`td font-mono ${pnlClass(s.pl)}`}>{fmtMoney(s.pl)}</td>
                    <td className={`td font-mono ${pnlClass(s.realizedToday)}`}>{fmtMoney(s.realizedToday)}</td>
                    <td className="td font-mono text-zinc-400">{fmtMoney(s.chargesToday)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-zinc-600 mt-3">
            Snapshots are stored in <span className="font-mono">data/snapshots.json</span> in your project folder — one per day, safe from browser data clears.
          </p>
        </>
      )}
    </div>
  );
}
