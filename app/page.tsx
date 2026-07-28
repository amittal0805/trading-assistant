"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fetchQuotes, yahooSymbol, Quote } from "@/lib/quotes";
import { fmtMoney, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, StatCard, Field, NumInput } from "@/components/ui";
import { RefreshCw, ArrowUpRight } from "lucide-react";

type Quotes = Record<string, Quote>;

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { holdings, strategies, settings, setSettings } = useStore();
  const [quotes, setQuotes] = useState<Quotes>({});
  const [loadingPx, setLoadingPx] = useState(false);

  // Keep the daily INR snapshot + server holdings cache fresh (used by Trends/EOD).
  useEffect(() => {
    if (!mounted) return;
    const inr = holdings.filter((h) => currencyFor(h.exchange) === "INR");
    if (inr.length === 0) return;
    const invested = inr.reduce((a, h) => a + h.qty * h.avgPrice, 0);
    const value = inr.reduce((a, h) => a + h.qty * h.currentPrice, 0);
    fetch("/api/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invested, value, pl: value - invested, realizedToday: 0, chargesToday: 0 }),
    }).catch(() => {});
    fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map((h) => ({
          symbol: h.symbol, exchange: h.exchange, qty: h.qty, avgPrice: h.avgPrice, currentPrice: h.currentPrice,
        })),
      }),
    }).catch(() => {});
  }, [mounted, holdings]);

  const symbols = useMemo(
    () =>
      Array.from(
        new Map(
          strategies.flatMap((s) => s.stocks.map((x) => [x.symbol, { symbol: x.symbol, exchange: x.exchange }]))
        ).values()
      ),
    [strategies]
  );

  const refresh = useCallback(async () => {
    if (symbols.length === 0) return;
    setLoadingPx(true);
    try {
      setQuotes(await fetchQuotes(symbols));
    } catch {
      /* fall back to stored last prices */
    } finally {
      setLoadingPx(false);
    }
  }, [symbols]);

  useEffect(() => {
    if (mounted) refresh();
  }, [mounted, refresh]);

  const sectors = useMemo(() => {
    const rows = strategies.map((st) => {
      let invested = 0;
      let value = 0;
      let day = 0;
      const stocks = st.stocks
        .map((x) => {
          const held = x.heldQty ?? x.qty;
          if (!held) return null;
          const q = quotes[yahooSymbol(x.symbol, x.exchange)];
          const cur = q && isFinite(q.price) ? q.price : x.lastPrice ?? x.addedPrice ?? 0;
          const avg = x.addedPrice ?? cur;
          const inv = held * avg;
          const val = held * cur;
          invested += inv;
          value += val;
          if (q?.prevClose != null) day += held * (cur - q.prevClose);
          return { symbol: x.symbol, pl: val - inv, plPct: inv ? ((val - inv) / Math.abs(inv)) * 100 : 0 };
        })
        .filter((s): s is { symbol: string; pl: number; plPct: number } => s !== null)
        .sort((a, b) => b.pl - a.pl);
      const pl = value - invested;
      return {
        id: st.id,
        name: st.name,
        index: st.indexSymbol,
        invested,
        value,
        pl,
        plPct: invested ? (pl / Math.abs(invested)) * 100 : 0,
        day,
        stocks,
      };
    });
    return rows.filter((r) => r.stocks.length > 0).sort((a, b) => b.value - a.value);
  }, [strategies, quotes]);

  const totals = useMemo(() => {
    const invested = sectors.reduce((a, s) => a + s.invested, 0);
    const value = sectors.reduce((a, s) => a + s.value, 0);
    const day = sectors.reduce((a, s) => a + s.day, 0);
    return { invested, value, pl: value - invested, plPct: invested ? ((value - invested) / invested) * 100 : 0, day };
  }, [sectors]);

  const hasLive = Object.keys(quotes).length > 0;
  const totalValue = totals.value;

  if (!mounted) return null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle title="Dashboard" subtitle="Your sectors and where the money is" />
        <button className="btn-ghost flex items-center gap-2" onClick={refresh} disabled={loadingPx}>
          <RefreshCw className={`w-4 h-4 ${loadingPx ? "animate-spin" : ""}`} />
          {loadingPx ? "Pricing…" : "Refresh prices"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Invested" value={fmtMoney(totals.invested)} sub="across your sector baskets" />
        <StatCard label="Current Value" value={fmtMoney(totals.value)} sub={`${sectors.length} sectors`} />
        <StatCard label="Total P/L" value={fmtMoney(totals.pl)} pnl={totals.pl} sub={fmtPct(totals.plPct)} />
        <StatCard
          label="Day P/L"
          value={hasLive ? fmtMoney(totals.day) : "—"}
          pnl={hasLive ? totals.day : undefined}
          sub={hasLive ? "vs prev close" : "Refresh for live"}
        />
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Sectors you&apos;re invested in</h2>
        <Link href="/rotation" className="text-xs text-accent flex items-center gap-1">
          Manage baskets <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {sectors.length === 0 ? (
        <div className="card text-sm text-zinc-500 mb-6">
          No sector baskets yet. Add stocks under Sectoral Rotation to see sector P/L here.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {sectors.map((s) => {
            const best = s.stocks[0];
            const worst = s.stocks[s.stocks.length - 1];
            const alloc = totalValue > 0 ? (s.value / totalValue) * 100 : 0;
            return (
              <div key={s.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{s.name}</h3>
                    {s.index && <span className="text-[11px] text-muted">{s.index}</span>}
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-semibold ${pnlClass(s.pl)}`}>{fmtMoney(s.pl)}</div>
                    <div className={`text-[11px] font-mono ${pnlClass(s.pl)}`}>{fmtPct(s.plPct)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                  <div>
                    <div className="text-[11px] text-muted">Invested</div>
                    <div className="font-mono">{fmtMoney(s.invested, "INR", 0)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Value</div>
                    <div className="font-mono">{fmtMoney(s.value, "INR", 0)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Day</div>
                    <div className={`font-mono ${hasLive ? pnlClass(s.day) : "text-zinc-500"}`}>
                      {hasLive ? fmtMoney(s.day, "INR", 0) : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-muted mb-1">
                    <span>{s.stocks.length} stocks</span>
                    <span>{alloc.toFixed(0)}% of portfolio</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className={`h-full ${s.pl >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: `${Math.min(100, alloc)}%` }} />
                  </div>
                </div>

                {best && worst && s.stocks.length > 1 && (
                  <div className="flex justify-between mt-3 text-[11px]">
                    <span className="text-muted">
                      Best <span className="text-gain font-mono">{best.symbol} {fmtPct(best.plPct, 1)}</span>
                    </span>
                    <span className="text-muted">
                      Worst <span className="text-loss font-mono">{worst.symbol} {fmtPct(worst.plPct, 1)}</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sectors.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-medium mb-3">Sector allocation (by value)</h3>
          <div className="space-y-2">
            {sectors.map((s) => {
              const pct = totalValue > 0 ? (s.value / totalValue) * 100 : 0;
              return (
                <div key={s.id}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span>{s.name}</span>
                    <span className="font-mono text-muted">
                      {fmtMoney(s.value, "INR", 0)} · {pct.toFixed(1)}% ·{" "}
                      <span className={pnlClass(s.pl)}>{fmtMoney(s.pl, "INR", 0)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className="h-full bg-accent/70" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          Max daily loss at current settings:{" "}
          <span className="text-loss font-mono">{fmtMoney(settings.capitalINR * (settings.maxDailyLossPct / 100))}</span>
        </p>
      </div>
    </div>
  );
}
