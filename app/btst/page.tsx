"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { yahooSymbol } from "@/lib/quotes";
import { parseTradebook, buildRoundTrips } from "@/lib/tradebook";
import { btstFromRoundTrips, btstScore, BtstScore, btstSellPlan, strengthFrom } from "@/lib/btst";
import type { Indicator } from "@/app/api/indicators/route";
import { currencyFor, fmtMoney, fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { Broker, Exchange } from "@/lib/charges";
import { PageTitle, StatCard } from "@/components/ui";
import { Upload, Sunrise, TrendingUp, Info, LogOut } from "lucide-react";

const timeIST = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

export default function BTST() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { tradebook, setTradebook, holdings, positions, strategies } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ind, setInd] = useState<Record<string, Indicator>>({});
  const [scanning, setScanning] = useState(false);

  // --- Your BTST history from the tradebook ---
  const stats = useMemo(
    () => (tradebook ? btstFromRoundTrips(tradebook.result.roundTrips) : null),
    [tradebook]
  );

  // --- Candidate universe: everything you hold or track ---
  const universe = useMemo(() => {
    const m = new Map<string, string>();
    holdings.forEach((h) => m.set(h.symbol, h.exchange));
    positions.filter((p) => p.status === "open").forEach((p) => m.set(p.symbol, p.exchange));
    strategies.forEach((s) => s.stocks.forEach((x) => m.set(x.symbol, x.exchange)));
    return Array.from(m.entries()).map(([symbol, exchange]) => ({ symbol, exchange }));
  }, [holdings, positions, strategies]);

  const scan = useCallback(async () => {
    if (universe.length === 0) return;
    setScanning(true);
    try {
      const syms = universe.map((u) => yahooSymbol(u.symbol, u.exchange as never));
      const r = await fetch(`/api/indicators?symbols=${encodeURIComponent(syms.join(","))}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.data) setInd(j.data as Record<string, Indicator>);
    } catch {
      /* ignore */
    } finally {
      setScanning(false);
    }
  }, [universe]);

  useEffect(() => {
    if (mounted) scan();
  }, [mounted, scan]);

  // Your overnight holds to sell tomorrow: open long CNC positions (India),
  // with a sell price sized by how the stock closed today.
  const sellTomorrow = useMemo(() => {
    return positions
      .filter((p) => p.status === "open" && p.qty > 0 && currencyFor(p.exchange) === "INR")
      .map((p) => {
        const i = ind[yahooSymbol(p.symbol, p.exchange)];
        const ltp = i?.price ?? p.currentPrice;
        const strength = strengthFrom(i?.btstDaily ?? null);
        const plan = btstSellPlan(p.entryPrice, p.qty, ltp, strength, p.broker as Broker, p.exchange as Exchange);
        return { symbol: p.symbol, qty: p.qty, entry: p.entryPrice, ltp, strength, plan };
      })
      .sort((a, b) => {
        const rank = { strong: 0, neutral: 1, weak: 2 } as const;
        return rank[a.strength] - rank[b.strength] || b.plan.netAtTarget - a.plan.netAtTarget;
      });
  }, [positions, ind]);

  const candidates = useMemo(() => {
    return universe
      .map((u) => {
        const i = ind[yahooSymbol(u.symbol, u.exchange as never)];
        if (!i?.btstDaily) return null;
        const trendAligned = i.breakout?.trendAligned ?? false;
        const sc: BtstScore = btstScore(i.btstDaily, trendAligned);
        return { symbol: u.symbol, score: sc, daily: i.btstDaily, price: i.price };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.score.score >= 45)
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 12);
  }, [universe, ind]);

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
        setMsg("No trades found — export the Console Tradebook (Equity) as .xlsx or .csv.");
        return;
      }
      const result = buildRoundTrips(trades);
      setTradebook({ fileName: f.name, importedAt: new Date().toISOString(), result });
      setMsg(`Analyzed ${trades.length} executions.`);
    } catch {
      setMsg("Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  const tone = (v: BtstScore["verdict"]) =>
    v === "strong" ? "border-gain/40 bg-gain/5" : v === "watch" ? "border-amber-500/30 bg-amber-500/5" : "border-border";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle title="BTST Tracker" subtitle="Buy Today, Sell Tomorrow — your overnight-trade history and tomorrow's setups" />
        <div className="flex items-center gap-2">
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
            {busy ? "Reading…" : tradebook ? "Re-import tradebook" : "Import tradebook"}
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-muted mb-3">{msg}</p>}

      {/* Education */}
      <div className="card mb-6 border-accent/20 bg-accent/5">
        <div className="flex items-center gap-2 mb-1">
          <Info className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium">What BTST is</h3>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">
          BTST means buying a stock today and selling it the next trading day — before the shares even settle in your demat.
          The edge is <span className="text-zinc-100">overnight momentum</span>: a stock that closes strong near its day&apos;s
          high on heavy volume often gaps up or follows through the next morning. The risks are real too — no stop runs overnight,
          a bad global cue can gap it down, and selling unsettled shares carries short-delivery risk. It suits a firm close, not a
          weak one.
        </p>
      </div>

      {/* Sell tomorrow */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <LogOut className="w-5 h-5 text-accent" /> Sell tomorrow — your overnight holds
        </h2>
        <button className="btn-ghost flex items-center gap-2 text-xs" onClick={scan} disabled={scanning}>
          <TrendingUp className={`w-4 h-4 ${scanning ? "animate-pulse" : ""}`} />
          {scanning ? "Pricing…" : "Refresh"}
        </button>
      </div>
      {sellTomorrow.length === 0 ? (
        <div className="card text-sm text-zinc-500 mb-6">
          No open long positions to sell tomorrow. Your CNC positions (recent buys, not yet settled) show up here.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto mb-6">
          <div className="px-4 pt-4">
            <p className="text-[11px] text-zinc-500 mb-2">
              These are your open positions (recent buys). Sell price = target sized by how the stock closed today; strong closes
              earn a bigger target, weak closes just book near breakeven. Net is after delivery charges.
            </p>
          </div>
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                <th className="th">Stock</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Your Avg</th>
                <th className="th text-right">LTP</th>
                <th className="th text-right">Breakeven</th>
                <th className="th text-right">Sell at (target)</th>
                <th className="th text-right">Net @ target</th>
                <th className="th">Plan</th>
              </tr>
            </thead>
            <tbody>
              {sellTomorrow.map((r) => (
                <tr key={r.symbol}>
                  <td className="td">
                    <span className="text-sm font-medium">{r.symbol}</span>
                    <span
                      className={`ml-2 text-[10px] px-1.5 py-0.5 rounded capitalize ${
                        r.strength === "strong" ? "bg-gain/15 text-gain" : r.strength === "weak" ? "bg-loss/15 text-loss" : "bg-surface text-zinc-400"
                      }`}
                    >
                      {r.strength} close
                    </span>
                  </td>
                  <td className="td text-right font-mono text-xs">{fmtNum(r.qty, 0)}</td>
                  <td className="td text-right font-mono text-xs">{fmtNum(r.entry, 2)}</td>
                  <td className="td text-right font-mono text-xs text-muted">{isFinite(r.ltp) ? fmtNum(r.ltp, 2) : "—"}</td>
                  <td className="td text-right font-mono text-xs text-muted">{fmtNum(r.plan.breakeven, 2)}</td>
                  <td className="td text-right font-mono text-sm font-semibold text-accent">{fmtNum(r.plan.target, 2)}</td>
                  <td className={`td text-right font-mono text-xs ${pnlClass(r.plan.netAtTarget)}`}>{fmtMoney(r.plan.netAtTarget, "INR", 0)}</td>
                  <td className="td text-[11px] text-zinc-400 max-w-[260px]">{r.plan.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Your BTST history */}
      <h2 className="text-lg font-semibold tracking-tight mb-3">Your BTST history</h2>
      {!tradebook ? (
        <div className="card text-sm text-zinc-500 mb-6">
          Import your Zerodha Console Tradebook (Equity) to see how your overnight trades have actually done.
        </div>
      ) : !stats || stats.n === 0 ? (
        <div className="card text-sm text-zinc-500 mb-6">
          No next-day (BTST) round-trips found in this tradebook — you tend to hold longer or exit same-day.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="BTST trades" value={fmtNum(stats.n, 0)} sub="bought T, sold T+1" />
            <StatCard label="Win rate" value={`${stats.winRate.toFixed(0)}%`} pnl={stats.winRate - 50} sub={`avg ${fmtPct(stats.avgPct)} / trade`} />
            <StatCard label="Net P/L" value={fmtMoney(stats.net)} pnl={stats.net} sub="after charges" />
            <StatCard
              label="Charge drag"
              value={fmtPct(Math.abs(stats.gross) > 0 ? (stats.charges / Math.abs(stats.gross)) * 100 : 0).replace("+", "")}
              sub="of gross moves"
            />
          </div>
          <div className="card p-0 overflow-hidden mb-6">
            <h3 className="text-xs font-medium text-zinc-300 px-3 pt-3 pb-1">Stocks you BTST&apos;d best (net)</h3>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Stock</th>
                  <th className="th text-right">Trades</th>
                  <th className="th text-right">Win %</th>
                  <th className="th text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {stats.bySymbol.slice(0, 8).map((r) => (
                  <tr key={r.symbol}>
                    <td className="td text-sm">{r.symbol}</td>
                    <td className="td text-right font-mono text-xs">{r.n}</td>
                    <td className="td text-right font-mono text-xs">{r.winRate.toFixed(0)}%</td>
                    <td className={`td text-right font-mono text-xs ${pnlClass(r.net)}`}>{fmtMoney(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tomorrow's candidates */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Sunrise className="w-5 h-5 text-accent" /> BTST setups for tomorrow
        </h2>
        <button className="btn-ghost flex items-center gap-2 text-xs" onClick={scan} disabled={scanning}>
          <TrendingUp className={`w-4 h-4 ${scanning ? "animate-pulse" : ""}`} />
          {scanning ? "Scanning…" : "Rescan"}
        </button>
      </div>
      <p className="text-[11px] text-muted mb-3">
        Screened across your holdings, positions and basket stocks on today&apos;s daily candle — close near the high, strong day,
        volume surge, bullish candle, uptrend.
      </p>
      {candidates.length === 0 ? (
        <div className="card text-sm text-zinc-500">
          {scanning ? "Scanning your stocks…" : "No strong BTST setups right now (or market data unavailable). Rescan after the close."}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {candidates.map((c) => (
            <div key={c.symbol} className={`card ${tone(c.score.verdict)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{c.symbol}</h3>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                      c.score.verdict === "strong" ? "bg-gain/15 text-gain" : c.score.verdict === "watch" ? "bg-amber-500/15 text-amber-400" : "bg-surface text-zinc-400"
                    }`}
                  >
                    {c.score.verdict}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{c.price != null ? fmtNum(c.price, 2) : "—"}</div>
                  <div className={`text-[11px] font-mono ${pnlClass(c.daily.dayChangePct)}`}>{fmtPct(c.daily.dayChangePct)}</div>
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[11px] text-muted mb-1">
                  <span>BTST score</span>
                  <span className="font-mono">{c.score.score}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className={`h-full ${c.score.verdict === "strong" ? "bg-gain" : c.score.verdict === "watch" ? "bg-amber-500" : "bg-zinc-600"}`}
                    style={{ width: `${c.score.score}%` }}
                  />
                </div>
              </div>
              <ul className="mt-2 space-y-0.5">
                {c.score.reasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-zinc-400 flex gap-1.5">
                    <span className="text-accent">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-zinc-500 mt-6">
        Educational, not investment advice. BTST carries overnight gap risk and short-delivery risk on unsettled shares — always
        keep the position size small and have a plan for a gap-down open.
      </p>
    </div>
  );
}
