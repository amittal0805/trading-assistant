"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { netPnl } from "@/lib/charges";
import { fmtMoney, pnlClass } from "@/lib/format";
import { PageTitle, StatCard, Empty } from "@/components/ui";

// Indian financial year (Apr–Mar) for a YYYY-MM-DD date.
function fyOf(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  return d.getMonth() + 1 >= 4 ? `FY ${y}-${(y + 1) % 100}` : `FY ${y - 1}-${y % 100}`;
}

export default function Tax() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { positions, journal } = useStore();

  const fyData = useMemo(() => {
    const map = new Map<string, { intraday: number; intradayCharges: number; journalPnl: number; trades: number }>();
    const get = (fy: string) => {
      const g = map.get(fy) ?? { intraday: 0, intradayCharges: 0, journalPnl: 0, trades: 0 };
      map.set(fy, g);
      return g;
    };

    positions
      .filter((p) => p.status === "closed" && p.closedAt && p.exitPrice !== undefined)
      .forEach((p) => {
        const r = netPnl(
          { buyPrice: p.entryPrice, sellPrice: p.exitPrice!, qty: p.qty, exchange: p.exchange, segment: "intraday" },
          p.broker
        );
        const g = get(fyOf(p.closedAt!.slice(0, 10)));
        g.intraday += r.net;
        g.intradayCharges += r.charges.total;
        g.trades++;
      });

    journal.forEach((j) => {
      const g = get(fyOf(j.date));
      g.journalPnl += j.outcome;
      g.trades++;
    });

    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [positions, journal]);

  if (!mounted) return null;

  const current = fyData[0];

  return (
    <div>
      <PageTitle title="Tax View" subtitle="Financial-year summary of realized trading results" />

      {fyData.length === 0 ? (
        <Empty text="No closed trades or journal entries yet — tax summaries will appear as you trade." />
      ) : (
        <>
          {current && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label={`${current[0]} Intraday Net`} value={fmtMoney(current[1].intraday)} pnl={current[1].intraday} sub="Speculative business income" />
              <StatCard label={`${current[0]} Journal Net`} value={fmtMoney(current[1].journalPnl)} pnl={current[1].journalPnl} sub="Delivery / swing trades" />
              <StatCard label={`${current[0]} Charges`} value={fmtMoney(current[1].intradayCharges)} sub="Deductible as expenses" />
              <StatCard label={`${current[0]} Trades`} value={String(current[1].trades)} />
            </div>
          )}

          <div className="card p-0 overflow-x-auto mb-4">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="th">Financial Year</th>
                  <th className="th">Intraday Net (speculative)</th>
                  <th className="th">Journal Net (delivery/swing)</th>
                  <th className="th">Charges Paid</th>
                  <th className="th">Combined</th>
                </tr>
              </thead>
              <tbody>
                {fyData.map(([fy, g]) => (
                  <tr key={fy} className="hover:bg-surface/50">
                    <td className="td font-medium">{fy}</td>
                    <td className={`td font-mono ${pnlClass(g.intraday)}`}>{fmtMoney(g.intraday)}</td>
                    <td className={`td font-mono ${pnlClass(g.journalPnl)}`}>{fmtMoney(g.journalPnl)}</td>
                    <td className="td font-mono text-zinc-400">{fmtMoney(g.intradayCharges)}</td>
                    <td className={`td font-mono font-semibold ${pnlClass(g.intraday + g.journalPnl)}`}>
                      {fmtMoney(g.intraday + g.journalPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card text-[11px] text-zinc-500 leading-relaxed max-w-3xl">
            <p className="text-zinc-400 font-medium mb-1">How these are typically taxed (India)</p>
            <p>
              Intraday equity profits are <span className="text-zinc-300">speculative business income</span>, taxed at your slab rate.
              Delivery-based gains are capital gains: <span className="text-zinc-300">STCG</span> (held ≤ 12 months) currently 20%,{" "}
              <span className="text-zinc-300">LTCG</span> (&gt; 12 months) 12.5% above ₹1.25 lakh/year exemption. Charges and brokerage
              are generally deductible. This app doesn&apos;t track buy dates for journal trades, so it can&apos;t split STCG vs LTCG —
              treat these numbers as inputs for your CA, not a tax computation. Rates change; verify current ones before filing.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
