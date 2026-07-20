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

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Your trading day at a glance" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Today's Realized P/L" value={fmtMoney(realizedToday)} pnl={realizedToday} sub={`${closedToday.length} trade(s) closed`} />
        <StatCard label="Unrealized (Open)" value={fmtMoney(unrealizedOpen)} pnl={unrealizedOpen} sub={`${open.length} open position(s)`} />
        <StatCard label="Charges Today" value={fmtMoney(chargesToday)} sub="Brokerage + taxes" />
        <StatCard label="Capital Used" value={fmtMoney(capitalUsed)} sub="In open positions" />
        <StatCard label="Available Cash" value={fmtMoney(settings.capitalINR - capitalUsed)} sub="INR capital − used" />
        <StatCard label="Holdings ROI" value={fmtPct(roiINR)} pnl={roiINR} sub="Indian holdings" />
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
