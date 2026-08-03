"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fetchQuotes, yahooSymbol, Quote } from "@/lib/quotes";
import { fmtMoney, fmtNum, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, StatCard, Field, NumInput } from "@/components/ui";
import { RefreshCw, ArrowUpRight } from "lucide-react";

type Quotes = Record<string, Quote>;

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { holdings, positions, mutualFunds, vested, strategies, settings, setSettings } = useStore();
  const [quotes, setQuotes] = useState<Quotes>({});
  const [loadingPx, setLoadingPx] = useState(false);
  const [usdInr, setUsdInr] = useState<number | null>(null);
  const [indexLevels, setIndexLevels] = useState<Record<string, number>>({});

  // Live index levels for basket-vs-benchmark alpha on the sector cards.
  useEffect(() => {
    if (!mounted) return;
    fetch("/api/indices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.rows) return;
        const m: Record<string, number> = {};
        for (const r of j.rows as { symbol: string; last: number }[]) if (isFinite(r.last)) m[r.symbol] = r.last;
        setIndexLevels(m);
      })
      .catch(() => {});
  }, [mounted]);

  // Live USD/INR for converting the Vested (US) book to rupees.
  useEffect(() => {
    if (!mounted || !vested) return;
    fetch("/api/quote?symbols=" + encodeURIComponent("USDINR=X"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const p = j?.["USDINR=X"]?.price;
        if (typeof p === "number" && isFinite(p)) setUsdInr(p);
      })
      .catch(() => {});
  }, [mounted, vested]);
  const fx = usdInr ?? 86; // fallback if the FX quote can't be fetched

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
    const realized: Record<string, number> = {};
    positions
      .filter((p) => p.status === "closed" && p.exitPrice != null)
      .forEach((p) => (realized[p.symbol] = (realized[p.symbol] ?? 0) + (p.exitPrice! - p.entryPrice) * p.qty));

    const rows = strategies.map((st) => {
      let invested = 0;
      let value = 0;
      let day = 0;
      let booked = 0;
      const stocks = st.stocks
        .map((x) => {
          if (realized[x.symbol] != null) booked += realized[x.symbol];
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
        benchmarkEntry: st.benchmarkEntry,
        invested,
        value,
        pl,
        plPct: invested ? (pl / Math.abs(invested)) * 100 : 0,
        day,
        booked,
        stocks,
      };
    });
    return rows.filter((r) => r.stocks.length > 0 || r.booked !== 0).sort((a, b) => b.value - a.value);
  }, [strategies, quotes, positions]);

  const totals = useMemo(() => {
    const invested = sectors.reduce((a, s) => a + s.invested, 0);
    const value = sectors.reduce((a, s) => a + s.value, 0);
    const day = sectors.reduce((a, s) => a + s.day, 0);
    return { invested, value, pl: value - invested, plPct: invested ? ((value - invested) / invested) * 100 : 0, day };
  }, [sectors]);

  // Whole portfolio: full equity book (holdings + open positions) + mutual funds.
  const combined = useMemo(() => {
    const px = (sym: string, exch: string, ltp: number) => {
      const q = quotes[yahooSymbol(sym, exch as never)];
      return q && isFinite(q.price) ? q.price : ltp;
    };
    let eqInv = 0;
    let eqVal = 0;
    holdings.forEach((h) => {
      eqInv += h.qty * h.avgPrice;
      eqVal += h.qty * px(h.symbol, h.exchange, h.currentPrice);
    });
    positions
      .filter((p) => p.status === "open")
      .forEach((p) => {
        eqInv += p.qty * p.entryPrice;
        eqVal += p.qty * px(p.symbol, p.exchange, p.currentPrice);
      });
    const mfInv = mutualFunds.reduce((a, f) => a + f.currentInvestment, 0);
    const mfVal = mutualFunds.reduce((a, f) => a + f.currentValue, 0);
    // Vested (US) book, converted USD → INR.
    const usInv = vested ? vested.investedUSD * fx : 0;
    const usVal = vested ? vested.valueUSD * fx : 0;
    const invested = eqInv + mfInv + usInv;
    const value = eqVal + mfVal + usVal;
    return {
      eqInv,
      eqVal,
      eqPl: eqVal - eqInv,
      mfInv,
      mfVal,
      mfPl: mfVal - mfInv,
      usInv,
      usVal,
      usPl: usVal - usInv,
      invested,
      value,
      pl: value - invested,
      plPct: invested ? ((value - invested) / invested) * 100 : 0,
    };
  }, [holdings, positions, mutualFunds, vested, fx, quotes]);

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

      {/* Total investments: stocks + mutual funds */}
      <div className="card mb-6 bg-gradient-to-br from-accent/10 to-transparent border-accent/30">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs text-muted mb-1">Total Investments — Indian stocks + mutual funds + US (Vested)</div>
            <div className="text-3xl font-semibold font-mono tracking-tight">{fmtMoney(combined.value)}</div>
            <div className="text-sm text-muted mt-1">Invested {fmtMoney(combined.invested)}</div>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
            <div>
              <div className="text-[11px] text-muted">Indian equity</div>
              <div className="font-mono">{fmtMoney(combined.eqVal, "INR", 0)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Mutual funds</div>
              <div className="font-mono">{fmtMoney(combined.mfVal, "INR", 0)}</div>
            </div>
            {vested && (
              <div>
                <div className="text-[11px] text-muted">US · Vested</div>
                <div className="font-mono">{fmtMoney(combined.usVal, "INR", 0)}</div>
              </div>
            )}
          </div>
        </div>
        {combined.value > 0 && (
          <div className="mt-4">
            <div className="flex h-2 rounded-full overflow-hidden bg-surface">
              <div className="bg-accent" style={{ width: `${(combined.eqVal / combined.value) * 100}%` }} title="Indian equity" />
              <div className="bg-emerald-500" style={{ width: `${(combined.mfVal / combined.value) * 100}%` }} title="Mutual funds" />
              {vested && <div className="bg-violet-500" style={{ width: `${(combined.usVal / combined.value) * 100}%` }} title="US (Vested)" />}
            </div>
            <div className="flex flex-wrap gap-x-4 text-[11px] text-muted mt-1">
              <span>Indian equity {((combined.eqVal / combined.value) * 100).toFixed(0)}%</span>
              <span>Mutual funds {((combined.mfVal / combined.value) * 100).toFixed(0)}%</span>
              {vested && <span>US {((combined.usVal / combined.value) * 100).toFixed(0)}%</span>}
              {vested && (
                <span className="ml-auto text-zinc-600">
                  US book ${fmtNum(vested.valueUSD, 0)} @ ₹{fmtNum(fx, 2)}/$ · as of {vested.asOf}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sector baskets — invested" value={fmtMoney(totals.invested)} sub="tracked baskets only" />
        <StatCard label="Baskets value" value={fmtMoney(totals.value)} sub={`${sectors.length} sectors`} />
        <StatCard label="Baskets P/L" value={fmtMoney(totals.pl)} pnl={totals.pl} sub={fmtPct(totals.plPct)} />
        <StatCard
          label="Day P/L (baskets)"
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
                    {(() => {
                      const lvl = s.index ? indexLevels[s.index] : undefined;
                      const be = s.benchmarkEntry;
                      if (!lvl || !be || !(be.level > 0)) return null;
                      const idxPct = ((lvl - be.level) / be.level) * 100;
                      const alpha = s.plPct - idxPct;
                      return (
                        <div className="text-[10px] text-muted" title={`Basket ${fmtPct(s.plPct)} vs index ${fmtPct(idxPct)} since ${be.date}`}>
                          α <span className={`font-mono ${pnlClass(alpha)}`}>{alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}%</span> vs index
                        </div>
                      );
                    })()}
                    {s.booked !== 0 && (
                      <div className="text-[10px] text-muted">
                        Booked <span className={`font-mono ${pnlClass(s.booked)}`}>{fmtMoney(s.booked, "INR", 0)}</span>
                      </div>
                    )}
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
