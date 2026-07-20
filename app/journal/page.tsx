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
