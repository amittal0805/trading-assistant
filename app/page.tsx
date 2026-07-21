"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { netPnl } from "@/lib/charges";
import { fmtMoney, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, StatCard, Field, NumInput } from "@/components/ui";

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { holdings, positions, settings, setSettings } = useStore();

  // Auto-save a daily snapshot of the Indian portfolio for trend analysis.
  useEffect(() => {
    if (!mounted) return;
    const inr = holdings.filter((h) => currencyFor(h.exchange) === "INR");
    if (inr.length === 0) return;
    const invested = inr.reduce((a, h) => a + h.qty * h.avgPrice, 0);
    const value = inr.reduce((a, h) => a + h.qty * h.currentPrice, 0);
    const todayStr = new Date().toDateString();
    let realizedToday = 0;
    let chargesToday = 0;
    positions
      .filter((p) => p.status === "closed" && p.closedAt && new Date(p.closedAt).toDateString() === todayStr)
      .forEach((p) => {
        const r = netPnl(
          { buyPrice: p.entryPrice, sellPrice: p.exitPrice ?? p.entryPrice, qty: p.qty, exchange: p.exchange, segment: "intraday" },
          p.broker
        );
        realizedToday += r.net;
        chargesToday += r.charges.total;
      });
    fetch("/api/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invested, value, pl: value - invested, realizedToday, chargesToday }),
    }).catch(() => {});
    // Keep the server-side holdings cache fresh so the EOD job can run without a browser.
    fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map((h) => ({
          symbol: h.symbol, exchange: h.exchange, qty: h.qty,
          avgPrice: h.avgPrice, currentPrice: h.currentPrice,
        })),
      }),
    }).catch(() => {});
  }, [mounted, holdings, positions]);

  if (!mounted) return null;

  const inrHoldings = holdings.filter((h) => currencyFor(h.exchange) === "INR");
  const usdHoldings = holdings.filter((h) => currencyFor(h.exchange) === "USD");

  const invested = (hs: typeof holdings) => hs.reduce((a, h) => a + h.qty * h.avgPrice, 0);
  const value = (hs: typeof holdings) => hs.reduce((a, h) => a + h.qty * h.currentPrice, 0);

  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status === "closed");

  const today = new Date().toDateString();
  const closedToday = closed.filter((p) => p.closedAt && new Date(p.closedAt).toDateString() === today);

  const realizedToday = closedToday.reduce((a, p) => {
    const r = netPnl(
      { buyPrice: p.entryPrice, sellPrice: p.exitPrice ?? p.entryPrice, qty: p.qty, exchange: p.exchange, segment: "intraday" },
      p.broker
    );
    return a + r.net;
  }, 0);

  const chargesToday = closedToday.reduce((a, p) => {
    const r = netPnl(
      { buyPrice: p.entryPrice, sellPrice: p.exitPrice ?? p.entryPrice, qty: p.qty, exchange: p.exchange, segment: "intraday" },
      p.broker
    );
    return a + r.charges.total;
  }, 0);

  const unrealizedOpen = open.reduce((a, p) => a + (p.currentPrice - p.entryPrice) * p.qty, 0);
  const capitalUsed = open.reduce((a, p) => a + p.entryPrice * p.qty, 0);
  const unrealizedHoldingsINR = value(inrHoldings) - invested(inrHoldings);
  const roiINR = invested(inrHoldings) > 0 ? (unrealizedHoldingsINR / invested(inrHoldings)) * 100 : 0;

  const dayPl = (hs: typeof holdings) =>
    hs.reduce((a, h) => a + (h.prevClose ? (h.currentPrice - h.prevClose) * h.qty : 0), 0);
  const top4 = (hs: typeof holdings) =>
    [...hs].sort((a, b) => b.qty * b.currentPrice - a.qty * a.currentPrice).slice(0, 4);

  const movers = holdings
    .filter((h) => h.prevClose && h.prevClose > 0)
    .map((h) => ({ ...h, dayPct: ((h.currentPrice - h.prevClose!) / h.prevClose!) * 100 }))
    .sort((a, b) => b.dayPct - a.dayPct);
  const topMovers = [...movers.slice(0, 2), ...movers.slice(-2)].filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i
  );

  const inrTotal = value(inrHoldings);
  const inrByValue = [...inrHoldings].sort((a, b) => b.qty * b.currentPrice - a.qty * a.currentPrice);
  const topPct = inrTotal > 0 && inrByValue[0] ? ((inrByValue[0].qty * inrByValue[0].currentPrice) / inrTotal) * 100 : 0;
  const top3Pct =
    inrTotal > 0
      ? (inrByValue.slice(0, 3).reduce((a, h) => a + h.qty * h.currentPrice, 0) / inrTotal) * 100
      : 0;

  const HoldingRows = ({ hs }: { hs: typeof holdings }) => (
    <div className="space-y-2">
      {hs.length === 0 && <p className="text-xs text-zinc-500">No holdings yet.</p>}
      {hs.map((h) => {
        const ccy = currencyFor(h.exchange);
        const pl = h.qty * (h.currentPrice - h.avgPrice);
        const plPct = h.avgPrice > 0 ? ((h.currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0;
        return (
          <div key={h.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{h.symbol}</span>
              <span className="text-[11px] text-zinc-500 ml-2">{fmtMoney(h.qty * h.currentPrice, ccy, 0)}</span>
            </div>
            <div className={`font-mono text-xs text-right ${pnlClass(pl)}`}>
              {fmtMoney(pl, ccy, 0)}
              <span className="ml-1">({fmtPct(plPct, 1)})</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Your trading day at a glance" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Today's Realized P/L" value={fmtMoney(realizedToday)} pnl={realizedToday} sub={`${closedToday.length} trade(s) closed`} />
        <StatCard label="Unrealized (Open)" value={fmtMoney(unrealizedOpen)} pnl={unrealizedOpen} sub={`${open.length} open position(s)`} />
        <StatCard label="Day P/L — India" value={fmtMoney(dayPl(inrHoldings))} pnl={dayPl(inrHoldings)} sub="Holdings, vs prev close" />
        <StatCard label="Day P/L — US" value={fmtMoney(dayPl(usdHoldings), "USD")} pnl={dayPl(usdHoldings)} sub="Holdings, vs prev close" />
        <StatCard label="Charges Today" value={fmtMoney(chargesToday)} sub="Brokerage + taxes" />
        <StatCard label="Capital Used" value={fmtMoney(capitalUsed)} sub="In open positions" />
        <StatCard label="Available Cash" value={fmtMoney(settings.capitalINR - capitalUsed)} sub="INR capital − used" />
        <StatCard label="Holdings ROI" value={fmtPct(roiINR)} pnl={roiINR} sub="Indian holdings" />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <h2 className="text-sm font-medium mb-3">Top Holdings — India</h2>
          <HoldingRows hs={top4(inrHoldings)} />
        </div>
        <div className="card">
          <h2 className="text-sm font-medium mb-3">Top Holdings — US</h2>
          <HoldingRows hs={top4(usdHoldings)} />
        </div>
        <div className="card">
          <h2 className="text-sm font-medium mb-3">Today&apos;s Movers</h2>
          {topMovers.length === 0 ? (
            <p className="text-xs text-zinc-500">Refresh prices (or import Vested) to see day moves.</p>
          ) : (
            <div className="space-y-2">
              {topMovers.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{m.symbol}</span>
                  <span className={`font-mono text-xs ${pnlClass(m.dayPct)}`}>
                    {fmtPct(m.dayPct, 2)}
                    <span className="ml-1">
                      ({fmtMoney((m.currentPrice - m.prevClose!) * m.qty, currencyFor(m.exchange), 0)})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="text-sm font-medium mb-3">Concentration — India</h2>
          {inrByValue.length === 0 ? (
            <p className="text-xs text-zinc-500">Add holdings to see concentration risk.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{inrByValue[0].symbol}</span>
                <span className={`font-mono ${topPct > 30 ? "text-loss" : topPct > 15 ? "text-amber-400" : "text-gain"}`}>
                  {topPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 rounded bg-surface mb-3 overflow-hidden">
                <div
                  className={`h-full ${topPct > 30 ? "bg-loss" : topPct > 15 ? "bg-amber-400" : "bg-gain"}`}
                  style={{ width: `${Math.min(topPct, 100)}%` }}
                />
              </div>
              <div className="text-xs text-zinc-400">
                Top 3 = <span className="font-mono">{top3Pct.toFixed(1)}%</span> of Indian portfolio
              </div>
              {topPct > 30 && (
                <p className="text-[11px] text-amber-400 mt-2">
                  Heavy single-stock exposure — a bad day in {inrByValue[0].symbol} moves your whole book.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <div className="flex justify-between items-baseline mb-3">
            <h2 className="text-sm font-medium">Indian Portfolio</h2>
            <Link href="/holdings" className="text-xs text-accent">Manage →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted">Invested</div>
              <div className="font-mono mt-0.5">{fmtMoney(invested(inrHoldings))}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Current</div>
              <div className="font-mono mt-0.5">{fmtMoney(value(inrHoldings))}</div>
            </div>
            <div>
              <div className="text-xs text-muted">P/L</div>
              <div className={`font-mono mt-0.5 ${pnlClass(unrealizedHoldingsINR)}`}>{fmtMoney(unrealizedHoldingsINR)}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex justify-between items-baseline mb-3">
            <h2 className="text-sm font-medium">US Portfolio</h2>
            <Link href="/holdings" className="text-xs text-accent">Manage →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted">Invested</div>
              <div className="font-mono mt-0.5">{fmtMoney(invested(usdHoldings), "USD")}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Current</div>
              <div className="font-mono mt-0.5">{fmtMoney(value(usdHoldings), "USD")}</div>
            </div>
            <div>
              <div className="text-xs text-muted">P/L</div>
              <div className={`font-mono mt-0.5 ${pnlClass(value(usdHoldings) - invested(usdHoldings))}`}>
                {fmtMoney(value(usdHoldings) - invested(usdHoldings), "USD")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card max-w-xl">
        <h2 className="text-sm font-medium mb-3">Capital Settings</h2>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Capital (INR)">
            <NumInput value={settings.capitalINR} onChange={(v) => setSettings({ capitalINR: v === "" ? 0 : v })} />
          </Field>
          <Field label="Capital (USD)">
            <NumInput value={settings.capitalUSD} onChange={(v) => setSettings({ capitalUSD: v === "" ? 0 : v })} />
          </Field>
          <Field label="Max Daily Loss %">
            <NumInput value={settings.maxDailyLossPct} onChange={(v) => setSettings({ maxDailyLossPct: v === "" ? 0 : v })} />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-500 mt-3">
          Max daily loss at current settings: <span className="text-loss font-mono">{fmtMoney(settings.capitalINR * (settings.maxDailyLossPct / 100))}</span>
        </p>
      </div>
    </div>
  );
}
