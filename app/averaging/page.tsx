"use client";

import { useState } from "react";
import { averagingPlan, AveragingStrategy } from "@/lib/calc";
import { Exchange } from "@/lib/charges";
import { fmtMoney, fmtNum, fmtPct, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Row } from "@/components/ui";
import { AlertTriangle } from "lucide-react";

export default function Averaging() {
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const ccy = currencyFor(exchange);

  const [qty, setQty] = useState<number | "">(100);
  const [avg, setAvg] = useState<number | "">(500);
  const [cur, setCur] = useState<number | "">(490);
  const [capital, setCapital] = useState<number | "">(100000);
  const [strategy, setStrategy] = useState<AveragingStrategy>("balanced");

  const res =
    qty && avg && cur && capital
      ? averagingPlan({
          qty: Number(qty), avgPrice: Number(avg), currentPrice: Number(cur),
          availableCapital: Number(capital), strategy,
        })
      : null;

  return (
    <div>
      <PageTitle title="Dip Buying / Smart Averaging" subtitle="Structured averaging ladders with exposure warnings" />

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        <div className="card h-fit">
          <h2 className="text-sm font-medium mb-4">Position</h2>
          <div className="space-y-3">
            <Field label="Exchange">
              <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
                <option>NSE</option><option>BSE</option><option>NYSE</option><option>NASDAQ</option>
              </select>
            </Field>
            <Field label="Current Quantity"><NumInput value={qty} onChange={setQty} /></Field>
            <Field label={`Average Price (${ccy})`}><NumInput value={avg} onChange={setAvg} /></Field>
            <Field label={`Current Price (${ccy})`}><NumInput value={cur} onChange={setCur} /></Field>
            <Field label={`Available Capital (${ccy})`}><NumInput value={capital} onChange={setCapital} /></Field>
            <Field label="Strategy">
              <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value as AveragingStrategy)}>
                <option value="conservative">Conservative — 20% of capital, wider dips</option>
                <option value="balanced">Balanced — 40% of capital</option>
                <option value="aggressive">Aggressive — 60% of capital, tighter dips</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          {res ? (
            <>
              <div className="card">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm">{res.suggestion}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      Current drawdown from average: <span className="font-mono text-loss">{fmtPct(-res.dipFromAvg)}</span>.
                      Full ladder would take total exposure to <span className="font-mono">{fmtMoney(res.totalExposure, ccy)}</span>
                      {" "}({res.exposurePctOfCapital.toFixed(0)}% of position + capital). Averaging increases risk — never average a broken thesis.
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-0 overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="th">Dip</th><th className="th">Buy Price</th><th className="th">Buy Qty</th>
                      <th className="th">Cost</th><th className="th">Total Qty</th><th className="th">New Avg</th><th className="th">Recovery Target (+1%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.ladder.map((l) => (
                      <tr key={l.dipPct}>
                        <td className="td font-mono text-loss">-{l.dipPct}%</td>
                        <td className="td font-mono">{fmtMoney(l.price, ccy)}</td>
                        <td className="td font-mono">{fmtNum(l.buyQty, 0)}</td>
                        <td className="td font-mono">{fmtMoney(l.cost, ccy)}</td>
                        <td className="td font-mono">{fmtNum(l.cumulativeQty, 0)}</td>
                        <td className="td font-mono text-accent">{fmtMoney(l.newAvg, ccy)}</td>
                        <td className="td font-mono text-gain">{fmtMoney(l.recoveryTarget, ccy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card max-w-md">
                <h2 className="text-sm font-medium mb-3">If the full ladder executes</h2>
                <Row k="Averaging budget" v={fmtMoney(res.budget, ccy)} />
                <Row k="Capital deployed" v={fmtMoney(res.spent, ccy)} />
                <Row k="Final quantity" v={fmtNum(res.finalQty, 0)} />
                <Row k="Final average" v={fmtMoney(res.finalAvg, ccy)} cls="text-accent" />
                <Row k="Breakeven price" v={fmtMoney(res.finalAvg, ccy)} />
              </div>
            </>
          ) : (
            <div className="card text-sm text-zinc-500">Fill in your position to generate an averaging ladder.</div>
          )}
        </div>
      </div>
    </div>
  );
}
