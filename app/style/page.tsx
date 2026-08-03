"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import {
  parseTradebook,
  buildRoundTrips,
  assessStyle,
  filterByFy,
  fysPresent,
  fyLabel,
  fyStartYear,
  currentFyStartYear,
  TradeStyle,
  AccuratePnl,
} from "@/lib/tradebook";
import { summarizePnl } from "@/lib/pnl";
import { fmtMoney, fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { PageTitle, StatCard } from "@/components/ui";
import { Upload, Sparkles, TrendingUp, Clock, Zap, CheckCircle2, AlertTriangle, Lightbulb, FileCheck2, Receipt } from "lucide-react";

const STYLE_META: Record<TradeStyle, { label: string; icon: typeof Zap }> = {
  scalp: { label: "Scalping", icon: Zap },
  intraday: { label: "Intraday", icon: Clock },
  swing: { label: "Swing / Positional", icon: TrendingUp },
};

function fmtHold(sec: number) {
  if (sec < 90) return `${Math.round(sec)}s`;
  const m = sec / 60;
  if (m < 90) return `${m.toFixed(0)} min`;
  const h = m / 60;
  if (h < 30) return `${h.toFixed(1)} hr`;
  return `${(h / 24).toFixed(1)} days`;
}

export default function TradingStyle() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { tradebook, setTradebook, pnl, setPnl } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const pnlRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [fy, setFy] = useState<number | "all">(currentFyStartYear());

  const allRts = tradebook?.result.roundTrips ?? [];
  const fys = useMemo(() => fysPresent(allRts), [allRts]);

  // Default the FY selector to the newest FY that actually has data.
  useEffect(() => {
    if (fys.length && !fys.includes(fy as number) && fy !== "all") setFy(fys[0]);
  }, [fys, fy]);

  const rts = useMemo(() => filterByFy(allRts, fy), [allRts, fy]);

  // Accurate realized P&L from the uploaded P&L statement, scoped to the FY when
  // the statement carries exit dates.
  const accurate: AccuratePnl | undefined = useMemo(() => {
    const s = pnl?.summary;
    if (!s) return undefined;
    let trades = s.trades;
    if (fy !== "all" && trades.some((t) => t.exitDate)) {
      trades = trades.filter((t) => t.exitDate && fyStartYear(t.exitDate) === fy);
    }
    if (trades.length === 0) return undefined;
    return {
      net: trades.reduce((a, t) => a + t.realized, 0),
      intradayNet: trades.filter((t) => t.holdingDays === 0).reduce((a, t) => a + t.realized, 0),
      swingNet: trades.filter((t) => (t.holdingDays ?? 1) > 0).reduce((a, t) => a + t.realized, 0),
      hasSplit: s.hasSplit,
    };
  }, [pnl, fy]);

  const assessment = useMemo(() => assessStyle(rts, fy, accurate), [rts, fy, accurate]);

  const onPnlFile = async (f: File) => {
    setBusy(true);
    setMsg("");
    try {
      const XLSX = await import("xlsx");
      const isCsv = f.name.toLowerCase().endsWith(".csv");
      const wb = isCsv ? XLSX.read(await f.text(), { type: "string" }) : XLSX.read(await f.arrayBuffer());
      const sheets = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true }) as unknown[][],
      }));
      const summary = summarizePnl(sheets);
      if (summary.trades.length === 0) {
        setMsg(
          `Couldn't find P&L rows. Detected columns: ${summary.detectedHeader.filter(Boolean).join(", ") || "none"}. ` +
            "Use Console → Reports → P&L → download (tradewise/combined)."
        );
        return;
      }
      setPnl({ fileName: f.name, importedAt: new Date().toISOString(), summary });
      setMsg(`Loaded P&L statement — ${summary.trades.length} rows, realized ${fmtMoney(summary.totalRealized)}.`);
    } catch {
      setMsg("Couldn't read that P&L file. Export it as .xlsx or .csv from Zerodha Console.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File) => {
    setBusy(true);
    setMsg("");
    try {
      const XLSX = await import("xlsx");
      const isCsv = f.name.toLowerCase().endsWith(".csv");
      const wb = isCsv ? XLSX.read(await f.text(), { type: "string" }) : XLSX.read(await f.arrayBuffer());
      const ws = wb.Sheets["Equity"] ?? wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true }) as unknown[][];
      const trades = parseTradebook(aoa);
      if (trades.length === 0) {
        setMsg("No trades found — this should be a Zerodha Console Tradebook (Equity) export.");
        return;
      }
      const result = buildRoundTrips(trades);
      setTradebook({ fileName: f.name, importedAt: new Date().toISOString(), result });
      setMsg(`Analyzed ${trades.length} executions → ${result.roundTrips.length} round-trips.`);
    } catch {
      setMsg("Couldn't read that file. Export the Tradebook as .xlsx or .csv.");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle title="Trading Style" subtitle="A candid read on how you actually trade, from your tradebook" />
        <div className="flex items-center gap-2">
          {allRts.length > 0 && (
            <select
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent"
              value={fy}
              onChange={(e) => setFy(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All time</option>
              {fys.map((y) => (
                <option key={y} value={y}>
                  {fyLabel(y)}
                </option>
              ))}
            </select>
          )}
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
            {busy ? "Working…" : tradebook ? "Tradebook" : "Upload tradebook"}
          </button>
          <input
            ref={pnlRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPnlFile(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            className={`btn-ghost flex items-center gap-2 ${pnl ? "text-gain" : ""}`}
            disabled={busy}
            onClick={() => pnlRef.current?.click()}
            title="Upload your Zerodha Console P&L statement for accurate realized P&L"
          >
            {pnl ? <FileCheck2 className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
            {pnl ? "P&L loaded" : "Upload P&L"}
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-muted mb-3">{msg}</p>}

      {!tradebook ? (
        <div className="card text-sm text-zinc-500">
          Upload your Zerodha Console <span className="text-zinc-300">Tradebook</span> (Console → Reports → Tradebook →
          Equity, for the financial year or any range, as .xlsx or .csv). I&apos;ll pair your trades into round-trips,
          classify them as scalping / intraday / swing, and give you a straight read on your style — strengths, leaks,
          and what to change. Everything runs in your browser.
        </div>
      ) : !assessment ? (
        <div className="card text-sm text-zinc-500">
          No completed round-trips in {fy === "all" ? "this data" : fyLabel(fy as number)}. Try a different period or
          upload a wider tradebook.
        </div>
      ) : (
        <>
          {/* Verdict */}
          <div className="card mb-4 border-accent/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <h2 className="text-base font-semibold">{assessment.archetype}</h2>
              <span className="ml-auto text-xs text-muted">
                {assessment.fyLabel ?? "All time"} · {fmtNum(assessment.trades, 0)} round-trips
              </span>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{assessment.summary}</p>
          </div>

          {/* Headline metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {assessment.reliableNet ? (
              <StatCard label="Net P/L" value={fmtMoney(assessment.net)} pnl={assessment.net} sub="realized · from P&L statement" />
            ) : (
              <StatCard
                label="Intraday/scalp P/L"
                value={fmtMoney(assessment.sameDayNet)}
                pnl={assessment.sameDayNet}
                sub="accurate · swing needs P&L"
              />
            )}
            <StatCard
              label="Win rate"
              value={`${assessment.winRate.toFixed(0)}%`}
              pnl={assessment.winRate - 50}
              sub={`${fmtMoney(assessment.expectancy)} / trade`}
            />
            <StatCard
              label="Payoff ratio"
              value={isFinite(assessment.payoff) ? assessment.payoff.toFixed(2) : "∞"}
              pnl={assessment.payoff - 1}
              sub="avg win ÷ avg loss"
            />
            <StatCard label="Avg hold" value={fmtHold(assessment.avgHoldSec)} sub={`${assessment.longPct.toFixed(0)}% long`} />
          </div>

          {assessment.netSource === "tradebook" ? (
            <div className="card mb-6 border-amber-500/30 bg-amber-500/5 text-sm text-zinc-300">
              <span className="text-amber-400 font-medium">Net P/L is estimated.</span> It&apos;s reconstructed from the
              tradebook, so trades whose buy predates the export window use an approximate cost basis. Upload your{" "}
              <span className="text-zinc-100">Console → Reports → P&amp;L</span> statement (button above) for the exact
              realized figure — the style classification stays the same.
            </div>
          ) : (
            <div className="card mb-6 border-gain/30 bg-gain/5 text-sm text-zinc-300">
              <span className="text-gain font-medium">Using your P&amp;L statement</span> for the realized figures
              {accurate?.hasSplit ? " and the same-day vs held split" : ""}. Style classification (scalp / intraday /
              swing) still comes from the tradebook&apos;s timestamps.
            </div>
          )}

          {/* Style mix */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {assessment.mix.map((m) => {
              const Icon = STYLE_META[m.style].icon;
              return (
                <div key={m.style} className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-medium">{STYLE_META[m.style].label}</h3>
                    <span className={`ml-auto font-mono text-sm ${pnlClass(m.net)}`}>{fmtMoney(m.net)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted mb-1">
                    <span>{m.sharePct.toFixed(0)}% of trades ({m.n})</span>
                    <span>{m.capitalPct.toFixed(0)}% of capital</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className="h-full bg-accent/70" style={{ width: `${Math.min(100, m.sharePct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Holding-period distribution */}
          <div className="card mb-6">
            <h3 className="text-sm font-medium mb-3">How long you hold</h3>
            <div className="space-y-2">
              {assessment.holdBuckets.map((b) => {
                const pct = assessment.trades ? (b.n / assessment.trades) * 100 : 0;
                return (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-28 shrink-0">{b.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                      <div className="h-full bg-accent/60" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-muted w-20 text-right">
                      {b.n} · {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Read: strengths / watch-outs / suggestions */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <ReadCard
              title="Strengths"
              icon={<CheckCircle2 className="w-4 h-4 text-gain" />}
              items={assessment.strengths}
              empty="No standout strengths in this period yet."
              tone="gain"
            />
            <ReadCard
              title="Watch-outs"
              icon={<AlertTriangle className="w-4 h-4 text-loss" />}
              items={assessment.watchouts}
              empty="No major red flags — clean book."
              tone="loss"
            />
            <ReadCard
              title="Suggestions"
              icon={<Lightbulb className="w-4 h-4 text-amber-400" />}
              items={assessment.suggestions}
              empty=""
              tone="accent"
            />
          </div>

          <p className="text-[11px] text-zinc-500">
            Style is inferred from trade timestamps (the tradebook has no product code); P&amp;L is netted with the
            app&apos;s Zerodha charge model, close to but not identical to your contract notes. This is a data read, not
            investment advice.
          </p>
        </>
      )}
    </div>
  );
}

function ReadCard({
  title,
  icon,
  items,
  empty,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  empty: string;
  tone: "gain" | "loss" | "accent";
}) {
  const dot = tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-amber-400";
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((t, i) => (
            <li key={i} className="text-sm text-zinc-300 flex gap-2">
              <span className={`mt-0.5 ${dot}`}>•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
