"use client";

import { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import {
  parseTradebook,
  buildRoundTrips,
  analyze,
  TradeStyle,
  StyleStats,
  SCALP_MAX_HOLD_SEC,
  SCALP_MAX_MOVE_PCT,
} from "@/lib/tradebook";
import { fmtMoney, fmtNum, pnlClass } from "@/lib/format";
import { Upload, Trash2, Zap, Clock, TrendingUp } from "lucide-react";

const STYLE_META: Record<TradeStyle, { label: string; icon: typeof Zap; blurb: string }> = {
  scalp: { label: "Scalping", icon: Zap, blurb: "Same-day round-trips, ≤15 min, ≤1% move" },
  intraday: { label: "Intraday", icon: Clock, blurb: "Opened and closed the same day" },
  swing: { label: "Swing / Delivery", icon: TrendingUp, blurb: "Held across one or more days" },
};

function fmtHold(sec: number) {
  if (sec < 90) return `${Math.round(sec)}s`;
  const min = sec / 60;
  if (min < 90) return `${min.toFixed(0)} min`;
  const hr = min / 60;
  if (hr < 30) return `${hr.toFixed(1)} hr`;
  return `${(hr / 24).toFixed(1)} d`;
}

function StyleCard({ s }: { s: StyleStats }) {
  const meta = STYLE_META[s.style];
  const Icon = meta.icon;
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-medium">{meta.label}</h3>
        <span className={`ml-auto font-mono text-sm font-semibold ${pnlClass(s.net)}`}>{fmtMoney(s.net)}</span>
      </div>
      {s.n === 0 ? (
        <p className="text-xs text-zinc-500">No trades of this type in this export.</p>
      ) : (
        <>
          <p className="text-[11px] text-zinc-500 mb-3">{meta.blurb}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Metric k="Round-trips" v={fmtNum(s.n, 0)} />
            <Metric k="Win rate" v={`${s.winRate.toFixed(0)}%`} cls={s.winRate >= 50 ? "text-gain" : "text-loss"} />
            <Metric k="Net / trade" v={fmtMoney(s.expectancy)} cls={pnlClass(s.expectancy)} />
            <Metric k="Avg hold" v={fmtHold(s.avgHoldSec)} />
            <Metric k="Gross" v={fmtMoney(s.gross)} cls={pnlClass(s.gross)} />
            <Metric k="Charges" v={fmtMoney(s.charges)} cls="text-loss" />
          </div>
          <div className="mt-3 pt-2 border-t border-border/60">
            <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
              <span>Charge drag on gross moves</span>
              <span className="font-mono">{s.chargeDragPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className={`h-full ${s.chargeDragPct > 60 ? "bg-loss" : s.chargeDragPct > 30 ? "bg-amber-500" : "bg-gain"}`}
                style={{ width: `${Math.min(100, s.chargeDragPct)}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className={`font-mono ${cls ?? ""}`}>{v}</span>
    </div>
  );
}

export default function TradebookIntelligence() {
  const { tradebook, setTradebook } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [holdMin, setHoldMin] = useState(SCALP_MAX_HOLD_SEC / 60);
  const [movePct, setMovePct] = useState(SCALP_MAX_MOVE_PCT);

  const intel = useMemo(
    () =>
      tradebook
        ? analyze(tradebook.result, { maxHoldSec: Math.max(0, holdMin) * 60, maxMovePct: Math.max(0, movePct) })
        : null,
    [tradebook, holdMin, movePct]
  );

  const onFile = async (f: File) => {
    setBusy(true);
    setMsg("");
    try {
      const XLSX = await import("xlsx");
      const isCsv = f.name.toLowerCase().endsWith(".csv");
      const wb = isCsv
        ? XLSX.read(await f.text(), { type: "string" })
        : XLSX.read(await f.arrayBuffer());
      // Tradebook export has one sheet ("Equity"); fall back to the first.
      const ws = wb.Sheets["Equity"] ?? wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
      const trades = parseTradebook(aoa as unknown[][]);
      if (trades.length === 0) {
        setMsg("No trades found — is this a Zerodha Console Tradebook export?");
        return;
      }
      const result = buildRoundTrips(trades);
      setTradebook({ fileName: f.name, importedAt: new Date().toISOString(), result });
      setMsg(`Analyzed ${trades.length} executions → ${result.roundTrips.length} round-trips.`);
    } catch {
      setMsg("Couldn't read that file. Export the Tradebook as .xlsx or .csv from Zerodha Console.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Trading Intelligence</h2>
        <span className="text-xs text-muted">habits across scalping, intraday & swing</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = "";
            }}
          />
          <button className="btn-ghost flex items-center gap-2" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" />
            {busy ? "Analyzing…" : tradebook ? "Re-import Tradebook" : "Import Tradebook"}
          </button>
          {tradebook && (
            <button className="text-zinc-600 hover:text-loss" title="Clear" onClick={() => setTradebook(null)}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {msg && <p className="text-xs text-muted mb-3">{msg}</p>}

      {!tradebook || !intel ? (
        <div className="card text-sm text-zinc-500">
          Import your Zerodha Console <span className="text-zinc-300">Tradebook</span> (Console → Reports → Tradebook →
          Equity, any date range, download as .xlsx or .csv). Trades are paired into round-trips and classified as
          scalping, intraday, or swing — nothing leaves your browser.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mb-4">
            <span>
              {tradebook.result.dateFrom} → {tradebook.result.dateTo}
            </span>
            <span>·</span>
            <span>{fmtNum(tradebook.result.tradeCount, 0)} executions</span>
            <span>·</span>
            <span>{fmtNum(tradebook.result.symbols, 0)} symbols</span>
            <span>·</span>
            <span className={pnlClass(intel.totalNet)}>Net {fmtMoney(intel.totalNet)}</span>
            {tradebook.result.openQty > 0 && (
              <>
                <span>·</span>
                <span>{fmtNum(tradebook.result.openQty, 0)} shares still held</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-xs">
            <span className="text-muted">Count a same-day trade as a scalp when hold ≤</span>
            <label className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step="1"
                value={holdMin}
                onChange={(e) => setHoldMin(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-16 bg-surface border border-border rounded-md px-2 py-1 font-mono text-zinc-100 outline-none focus:border-accent"
              />
              <span className="text-muted">min</span>
            </label>
            <span className="text-muted">and move ≤</span>
            <label className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step="0.1"
                value={movePct}
                onChange={(e) => setMovePct(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-16 bg-surface border border-border rounded-md px-2 py-1 font-mono text-zinc-100 outline-none focus:border-accent"
              />
              <span className="text-muted">%</span>
            </label>
            {(holdMin !== SCALP_MAX_HOLD_SEC / 60 || movePct !== SCALP_MAX_MOVE_PCT) && (
              <button
                className="text-accent hover:underline"
                onClick={() => {
                  setHoldMin(SCALP_MAX_HOLD_SEC / 60);
                  setMovePct(SCALP_MAX_MOVE_PCT);
                }}
              >
                reset
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <StyleCard s={intel.byStyle.scalp} />
            <StyleCard s={intel.byStyle.intraday} />
            <StyleCard s={intel.byStyle.swing} />
          </div>

          {intel.insights.length > 0 && (
            <div className="card mb-4">
              <h3 className="text-sm font-medium mb-2">What the numbers say</h3>
              <ul className="space-y-1.5">
                {intel.insights.map((t, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex gap-2">
                    <span className="text-accent mt-0.5">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-0 overflow-hidden">
              <h3 className="text-xs font-medium text-zinc-300 px-3 pt-3 pb-1">Best symbols (net)</h3>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Symbol</th>
                    <th className="th">Trips</th>
                    <th className="th">Win %</th>
                    <th className="th">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {intel.topSymbols.map((r) => (
                    <tr key={r.symbol}>
                      <td className="td text-xs">{r.symbol}</td>
                      <td className="td font-mono text-xs">{r.n}</td>
                      <td className="td font-mono text-xs">{r.winRate.toFixed(0)}%</td>
                      <td className={`td font-mono text-xs ${pnlClass(r.net)}`}>{fmtMoney(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card p-0 overflow-hidden">
              <h3 className="text-xs font-medium text-zinc-300 px-3 pt-3 pb-1">Worst symbols (net)</h3>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Symbol</th>
                    <th className="th">Trips</th>
                    <th className="th">Win %</th>
                    <th className="th">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {intel.worstSymbols.map((r) => (
                    <tr key={r.symbol}>
                      <td className="td text-xs">{r.symbol}</td>
                      <td className="td font-mono text-xs">{r.n}</td>
                      <td className="td font-mono text-xs">{r.winRate.toFixed(0)}%</td>
                      <td className={`td font-mono text-xs ${pnlClass(r.net)}`}>{fmtMoney(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {intel.byHour.length > 0 && (
            <div className="card p-0 overflow-x-auto mt-4">
              <h3 className="text-xs font-medium text-zinc-300 px-3 pt-3 pb-1">
                Intraday / scalp P&amp;L by entry hour
              </h3>
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr>
                    <th className="th">Hour</th>
                    <th className="th">Trips</th>
                    <th className="th">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {intel.byHour.map((h) => (
                    <tr key={h.hour}>
                      <td className="td font-mono text-xs">{String(h.hour).padStart(2, "0")}:00</td>
                      <td className="td font-mono text-xs">{h.n}</td>
                      <td className={`td font-mono text-xs ${pnlClass(h.net)}`}>{fmtMoney(h.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-zinc-500 mt-4">
            P&amp;L is netted with the app&apos;s Zerodha charge model (intraday vs delivery) — close to, but not a
            substitute for, your contract-note figures. Classification is derived from timestamps since the tradebook has
            no product code; scalp thresholds are ≤15 min hold and ≤1% move.
          </p>
        </>
      )}
    </div>
  );
}
