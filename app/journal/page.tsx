"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtMoney, fmtPct, pnlClass } from "@/lib/format";
import { PageTitle, Field, NumInput, StatCard, Empty } from "@/components/ui";
import { Trash2 } from "lucide-react";

const EMOTIONS = ["Calm", "Confident", "FOMO", "Fear", "Greed", "Revenge", "Impatient", "Disciplined"];

export default function Journal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { journal, addJournal, removeJournal } = useStore();

  const [symbol, setSymbol] = useState("");
  const [reason, setReason] = useState("");
  const [emotion, setEmotion] = useState("Calm");
  const [entry, setEntry] = useState<number | "">("");
  const [exit, setExit] = useState<number | "">("");
  const [qty, setQty] = useState<number | "">("");
  const [outcome, setOutcome] = useState<number | "">("");
  const [mistakes, setMistakes] = useState("");
  const [learning, setLearning] = useState("");

  const stats = useMemo(() => {
    if (journal.length === 0) return null;
    const wins = journal.filter((j) => j.outcome > 0);
    const losses = journal.filter((j) => j.outcome < 0);
    const totalPnl = journal.reduce((a, j) => a + j.outcome, 0);
    return {
      count: journal.length,
      winRate: (wins.length / journal.length) * 100,
      avgWin: wins.length ? wins.reduce((a, j) => a + j.outcome, 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((a, j) => a + j.outcome, 0) / losses.length : 0,
      totalPnl,
    };
  }, [journal]);

  const breakdowns = useMemo(() => {
    if (journal.length < 3) return null;
    const group = (key: (j: (typeof journal)[number]) => string) => {
      const map = new Map<string, { n: number; wins: number; pnl: number }>();
      journal.forEach((j) => {
        const k = key(j) || "—";
        const g = map.get(k) ?? { n: 0, wins: 0, pnl: 0 };
        g.n++;
        if (j.outcome > 0) g.wins++;
        g.pnl += j.outcome;
        map.set(k, g);
      });
      return Array.from(map.entries())
        .map(([label, g]) => ({ label, ...g, winRate: (g.wins / g.n) * 100 }))
        .sort((a, b) => b.n - a.n);
    };
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      byEmotion: group((j) => j.emotion),
      bySymbol: group((j) => j.symbol).slice(0, 8),
      byDay: group((j) => days[new Date(j.date).getDay()] ?? "—"),
    };
  }, [journal]);

  if (!mounted) return null;

  const submit = () => {
    if (!symbol || entry === "" || exit === "" || qty === "") return;
    const out = outcome !== "" ? Number(outcome) : (Number(exit) - Number(entry)) * Number(qty);
    addJournal({
      date: new Date().toISOString().slice(0, 10),
      symbol: symbol.toUpperCase(), reason, emotion,
      entry: Number(entry), exit: Number(exit), qty: Number(qty),
      outcome: out, mistakes, learning,
    });
    setSymbol(""); setReason(""); setEntry(""); setExit(""); setQty(""); setOutcome(""); setMistakes(""); setLearning("");
  };

  return (
    <div>
      <PageTitle title="Trade Journal" subtitle="Every trade logged is a lesson kept" />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Trades" value={String(stats.count)} />
          <StatCard label="Win Rate" value={fmtPct(stats.winRate, 1).replace("+", "")} pnl={stats.winRate - 50} />
          <StatCard label="Avg Win" value={fmtMoney(stats.avgWin)} pnl={1} />
          <StatCard label="Avg Loss" value={fmtMoney(stats.avgLoss)} pnl={-1} />
          <StatCard label="Total P/L" value={fmtMoney(stats.totalPnl)} pnl={stats.totalPnl} />
        </div>
      )}

      {breakdowns && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {(
            [
              ["By Emotion", breakdowns.byEmotion],
              ["By Stock (top 8)", breakdowns.bySymbol],
              ["By Day of Week", breakdowns.byDay],
            ] as const
          ).map(([title, rows]) => (
            <div key={title} className="card p-0 overflow-hidden">
              <h3 className="text-xs font-medium text-zinc-300 px-3 pt-3 pb-1">{title}</h3>
              <table className="w-full">
                <thead>
                  <tr><th className="th">Group</th><th className="th">Trades</th><th className="th">Win %</th><th className="th">P/L</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td className="td text-xs">{r.label}</td>
                      <td className="td font-mono text-xs">{r.n}</td>
                      <td className={`td font-mono text-xs ${r.winRate >= 50 ? "text-gain" : "text-loss"}`}>
                        {r.winRate.toFixed(0)}%
                      </td>
                      <td className={`td font-mono text-xs ${pnlClass(r.pnl)}`}>{fmtMoney(r.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="card mb-6">
        <h2 className="text-sm font-medium mb-4">Log a Trade</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Stock"><input className="input" value={symbol} placeholder="TCS" onChange={(e) => setSymbol(e.target.value)} /></Field>
          <Field label="Entry"><NumInput value={entry} onChange={setEntry} /></Field>
          <Field label="Exit"><NumInput value={exit} onChange={setExit} /></Field>
          <Field label="Quantity"><NumInput value={qty} onChange={setQty} /></Field>
          <Field label="Net Outcome (optional)"><NumInput value={outcome} onChange={setOutcome} placeholder="auto from entry/exit" /></Field>
          <Field label="Emotion">
            <select className="input" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
              {EMOTIONS.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Field>
          <Field label="Reason for Trade"><input className="input" value={reason} placeholder="Breakout above resistance" onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Mistakes"><input className="input" value={mistakes} placeholder="Entered late" onChange={(e) => setMistakes(e.target.value)} /></Field>
          <div className="col-span-2 md:col-span-3">
            <Field label="Learning"><input className="input" value={learning} placeholder="Wait for retest before entering" onChange={(e) => setLearning(e.target.value)} /></Field>
          </div>
          <div className="flex items-end"><button className="btn-primary w-full" onClick={submit}>Save Trade</button></div>
        </div>
      </div>

      {journal.length === 0 ? (
        <Empty text="No journal entries yet." />
      ) : (
        <div className="space-y-3">
          {journal.map((j) => (
            <div key={j.id} className="card">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{j.symbol}</span>
                <span className="text-xs text-muted">{j.date}</span>
                <span className="text-xs font-mono text-muted">{j.qty} × {j.entry} → {j.exit}</span>
                <span className={`font-mono text-sm ${pnlClass(j.outcome)}`}>{fmtMoney(j.outcome)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-zinc-400">{j.emotion}</span>
                <button onClick={() => removeJournal(j.id)} className="ml-auto text-zinc-600 hover:text-loss">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {(j.reason || j.mistakes || j.learning) && (
                <div className="mt-2 text-xs text-zinc-400 space-y-0.5">
                  {j.reason && <p><span className="text-muted">Reason:</span> {j.reason}</p>}
                  {j.mistakes && <p><span className="text-muted">Mistakes:</span> {j.mistakes}</p>}
                  {j.learning && <p><span className="text-muted">Learning:</span> {j.learning}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
