"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { scalpPlan } from "@/lib/calc";
import { Exchange, Broker } from "@/lib/charges";
import { fmtMoney, fmtNum, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Row } from "@/components/ui";

export default function Scalping() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings } = useStore();

  const [holdingId, setHoldingId] = useState<string>("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [totalQty, setTotalQty] = useState<number | "">(500);
  const [avg, setAvg] = useState<number | "">(120);
  const [cur, setCur] = useState<number | "">(126);
  const [sellQty, setSellQty] = useState<number | "">(100);
  const [bbPrice, setBbPrice] = useState<number | "">("");
  const [bbQty, setBbQty] = useState<number | "">("");

  if (!mounted) return null;

  const pickHolding = (id: string) => {
    setHoldingId(id);
    const h = holdings.find((x) => x.id === id);
    if (h) {
      setExchange(h.exchange);
      setTotalQty(h.qty);
      setAvg(h.avgPrice);
      setCur(h.currentPrice);
      setSellQty(Math.max(1, Math.floor(h.qty / 5)));
    }
  };

  const broker: Broker = exchange === "NSE" || exchange === "BSE" ? "zerodha" : "vested";
  const ccy = currencyFor(exchange);

  const res =
    totalQty && avg && cur && sellQty
      ? scalpPlan({
          totalQty: Number(totalQty), avgPrice: Number(avg), currentPrice: Number(cur),
          sellQty: Number(sellQty), broker, exchange,
        })
      : null;

  return (
    <div>
      <PageTitle title="Scalping Assistant" subtitle="Book partial profits from holdings, plan buy-backs" />

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        <div className="card h-fit">
          <h2 className="text-sm font-medium mb-4">Inputs</h2>
          <div className="space-y-3">
            {holdings.length > 0 && (
              <Field label="Load from Holdings">
                <select className="input" value={holdingId} onChange={(e) => pickHolding(e.target.value)}>
                  <option value="">— manual entry —</option>
                  {holdings.map((h) => (
                    <option key={h.id} value={h.id}>{h.symbol} · {h.qty} @ {h.avgPrice}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Exchange">
              <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
                <option>NSE</option><option>BSE</option><option>NYSE</option><option>NASDAQ</option>
              </select>
            </Field>
            <Field label="Total Quantity"><NumInput value={totalQty} onChange={setTotalQty} /></Field>
            <Field label={`Average Price (${ccy})`}><NumInput value={avg} onChange={setAvg} /></Field>
            <Field label={`Current Price (${ccy})`}><NumInput value={cur} onChange={setCur} /></Field>
            <Field label="Quantity to Sell"><NumInput value={sellQty} onChange={setSellQty} /></Field>
          </div>
        </div>

        <div className="space-y-4">
          {res ? (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="card">
                  <h2 className="text-sm font-medium mb-3">Profit Booking</h2>
                  <Row k="Gross profit booked" v={fmtMoney(res.grossProfit, ccy)} cls="text-gain" />
                  <Row k="Charges (delivery sell)" v={fmtMoney(res.charges.total, ccy)} cls="text-loss" />
                  <Row k="Net profit booked" v={fmtMoney(res.netProfit, ccy)} cls="text-gain font-semibold" />
                  <Row k="Remaining quantity" v={fmtNum(res.remainingQty, 0)} />
                  <Row k="Average (unchanged)" v={fmtMoney(res.avgUnchanged, ccy)} />
                  <Row k="Effective avg (profit as cost reduction)" v={fmtMoney(res.effectiveAvg, ccy)} cls="text-accent" />
                </div>
                <div className="card">
                  <h2 className="text-sm font-medium mb-3">Next Targets (remaining shares)</h2>
                  {res.nextTargets.map((t, i) => (
                    <Row key={i} k={`+${i + 1}% target`} v={fmtMoney(t, ccy)} cls="text-gain" />
                  ))}
                </div>
              </div>

              <div className="card p-0 overflow-x-auto">
                <div className="px-4 pt-4">
                  <h2 className="text-sm font-medium">Buy-Back Plan (if price falls after selling)</h2>
                  <p className="text-[11px] text-zinc-500 mt-1 mb-2">Re-entering the sold quantity at lower levels reduces your average.</p>
                </div>
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr><th className="th">Drop</th><th className="th">Re-entry Price</th><th className="th">Re-buy Qty</th><th className="th">New Total Qty</th><th className="th">New Average</th></tr>
                  </thead>
                  <tbody>
                    {res.buyBackLevels.map((b) => (
                      <tr key={b.dropPct}>
                        <td className="td font-mono text-loss">-{b.dropPct}%</td>
                        <td className="td font-mono">{fmtMoney(b.price, ccy)}</td>
                        <td className="td font-mono">{fmtNum(b.reQty, 0)}</td>
                        <td className="td font-mono">{fmtNum(b.newQty, 0)}</td>
                        <td className="td font-mono text-accent">{fmtMoney(b.newAvg, ccy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h2 className="text-sm font-medium mb-1">Custom Buy Back</h2>
                <p className="text-[11px] text-zinc-500 mb-4">
                  Enter the actual price you bought back at to see your custom average.
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-sm mb-4">
                  <Field label={`Bought Back At (${ccy})`}>
                    <NumInput value={bbPrice} onChange={setBbPrice} placeholder={String(Number(cur))} />
                  </Field>
                  <Field label="Buy Back Quantity">
                    <NumInput value={bbQty} onChange={setBbQty} placeholder={String(Number(sellQty))} />
                  </Field>
                </div>
                {(() => {
                  const price = Number(bbPrice);
                  const q = Number(bbQty) || Number(sellQty);
                  if (!price || price <= 0 || !q || q <= 0) {
                    return <p className="text-sm text-zinc-500">Enter your buy-back price to see the result.</p>;
                  }
                  const remaining = res.remainingQty;
                  const avgP = Number(avg);
                  const newQty = remaining + q;
                  const newAvg = (remaining * avgP + q * price) / newQty;
                  const netAvg = (remaining * avgP + q * price - res.netProfit) / newQty;
                  const roundTrip = (Number(cur) - price) * q;
                  return (
                    <div className="max-w-md">
                      <Row k="New total quantity" v={fmtNum(newQty, 0)} />
                      <Row k="New average (book)" v={fmtMoney(newAvg, ccy)} cls="text-accent" />
                      <Row k="Custom average (net of booked profit)" v={fmtMoney(netAvg, ccy)} cls="text-accent font-semibold" />
                      <Row
                        k="Sell-high / buy-low gain on this round trip"
                        v={fmtMoney(roundTrip, ccy)}
                        cls={roundTrip >= 0 ? "text-gain" : "text-loss"}
                      />
                      {roundTrip < 0 && (
                        <p className="text-[11px] text-amber-400 mt-2">
                          You bought back above your selling price — this round trip cost you money after charges.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="card text-sm text-zinc-500">Enter a position (or load one from Holdings) to plan a scalp.</div>
          )}
        </div>
      </div>
    </div>
  );
}
