"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtMoney, fmtPct, currencyFor } from "@/lib/format";
import { PageTitle, StatCard, Empty } from "@/components/ui";

interface ReviewRow {
  symbol: string;
  ccy: "INR" | "USD";
  qty: number;
  avgPrice: number;
  currentPrice: number;
  invested: number;
  value: number;
  downPct: number;
  requiredGainPct: number; // rise needed to break even
  avgIfAdd25: number; // new average if adding 25% more qty at current price
  requiredAfterAvg: number;
  verdict: string;
  verdictCls: string;
}

function verdictFor(req: number): [string, string] {
  if (req <= 15) return ["Recoverable — a normal rally covers this", "text-gain"];
  if (req <= 50) return ["Needs a strong sustained rally", "text-amber-400"];
  if (req <= 100) return ["Unlikely without a fundamental re-rating", "text-orange-400"];
  return ["Realistically dead money — evaluate exit + redeploy", "text-loss"];
}

export default function Review() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings } = useStore();

  const rows = useMemo<ReviewRow[]>(() => {
    return holdings
      .filter((h) => h.currentPrice < h.avgPrice && h.qty > 0)
      .map((h) => {
        const invested = h.qty * h.avgPrice;
        const value = h.qty * h.currentPrice;
        const requiredGainPct = (h.avgPrice / h.currentPrice - 1) * 100;
        const addQty = Math.round(h.qty * 0.25);
        const avgIfAdd25 = (h.qty * h.avgPrice + addQty * h.currentPrice) / (h.qty + addQty);
        const requiredAfterAvg = (avgIfAdd25 / h.currentPrice - 1) * 100;
        const [verdict, verdictCls] = verdictFor(requiredGainPct);
        return {
          symbol: h.symbol,
          ccy: currencyFor(h.exchange),
          qty: h.qty,
          avgPrice: h.avgPrice,
          currentPrice: h.currentPrice,
          invested,
          value,
          downPct: (1 - value / invested) * 100,
          requiredGainPct,
          avgIfAdd25,
          requiredAfterAvg,
          verdict,
          verdictCls,
        };
      })
      .sort((a, b) => b.requiredGainPct - a.requiredGainPct);
  }, [holdings]);

  if (!mounted) return null;

  const deadMoney = rows.filter((r) => r.requiredGainPct > 50);
  const lockedInDead = deadMoney.reduce((a, r) => a + r.value, 0);
  const totalLoss = rows.reduce((a, r) => a + (r.value - r.invested), 0);

  return (
    <div>
      <PageTitle
        title="Holdings Review"
        subtitle="Averaging vs exit — how realistic is recovery for each losing position?"
      />

      {rows.length === 0 ? (
        <Empty text="No losing holdings to review. Nice." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Losing Positions" value={String(rows.length)} />
            <StatCard label="Unrealized Loss" value={fmtMoney(totalLoss)} pnl={totalLoss} />
            <StatCard label="Needing >50% Rise" value={String(deadMoney.length)} sub="hard-to-recover positions" />
            <StatCard
              label="Capital in Those"
              value={fmtMoney(lockedInDead)}
              sub="could be redeployed if exited"
            />
          </div>

          <div className="card p-0 overflow-x-auto mb-4">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <th className="th">Stock</th>
                  <th className="th">Down</th>
                  <th className="th">Avg → Current</th>
                  <th className="th">Rise Needed to Break Even</th>
                  <th className="th">If You Average (+25% qty)</th>
                  <th className="th">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} className="hover:bg-surface/50">
                    <td className="td font-medium">{r.symbol}</td>
                    <td className="td font-mono text-loss">-{r.downPct.toFixed(1)}%</td>
                    <td className="td font-mono text-xs">
                      {fmtMoney(r.avgPrice, r.ccy)} → {fmtMoney(r.currentPrice, r.ccy)}
                    </td>
                    <td className={`td font-mono ${r.requiredGainPct > 50 ? "text-loss" : r.requiredGainPct > 15 ? "text-amber-400" : "text-gain"}`}>
                      {fmtPct(r.requiredGainPct).replace("+", "")}
                    </td>
                    <td className="td font-mono text-xs text-zinc-400">
                      avg {fmtMoney(r.avgIfAdd25, r.ccy)} · still needs {r.requiredAfterAvg.toFixed(1)}%
                    </td>
                    <td className={`td text-xs ${r.verdictCls}`}>{r.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card text-[11px] text-zinc-500 leading-relaxed max-w-3xl">
            A stock down 50% must rise 100% just to break even — the math is asymmetric against holding losers.
            Averaging lowers the bar but concentrates more capital in the same thesis; it makes sense only when the
            original reason you bought still holds. Exiting realizes the loss but frees capital (and can offset gains
            for tax). This table is arithmetic, not advice — pair it with your own view of each business.
          </div>
        </>
      )}
    </div>
  );
}
