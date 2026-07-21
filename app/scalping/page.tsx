"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { scalpPlan } from "@/lib/calc";
import { Exchange, Broker } from "@/lib/charges";
import { fmtMoney, fmtNum, fmtPct, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Row, StatCard } from "@/components/ui";

export default function Scalping() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings } = useStore();

  const [holdingId, setHoldingId] = useState<string>("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [totalQty, setTotalQty] = useState<number | "">(1585);
  const [avg, setAvg] = useState<number | "">(1940);
  const [sellPrice, setSellPrice] = useState<number | "">(2092);
  const [sellQty, setSellQty] = useState<number | "">(100);
  const [buyBack, setBuyBack] = useState<number | "">(2086);

  if (!mounted) return null;

  const pickHolding = (id: string) => {
    setHoldingId(id);
    const h = holdings.find((x) => x.id === id);
    if (h) {
      setExchange(h.exchange);
      setTotalQty(h.qty);
      setAvg(h.avgPrice);
      setSellPrice(h.currentPrice);
      setSellQty(Math.max(1, Math.floor(h.qty / 15)));
      setBuyBack("");
    }
  };

  const broker: Broker = exchange === "NSE" || exchange === "BSE" ? "zerodha" : "vested";
  const ccy = currencyFor(exchange);

  const res =
    totalQty && avg && sellPrice && sellQty
      ? scalpPlan({
          totalQty: Number(totalQty),
          avgPrice: Number(avg),
          sellPrice: Number(sellPrice),
          sellQty: Number(sellQty),
          buyBackPrice: buyBack === "" ? null : Number(buyBack),
          broker,
          exchange,
        })
      : null;

  const ex = res?.executed;

  return (
    <div>
      <PageTitle
        title="Scalping Assistant"
        subtitle="Sell high, buy the same quantity back lower the same day. Your holding's quantity and average stay untouched — you pocket the spread as intraday profit."
      />

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        <div className="card h-fit">
          <h2 className="text-sm font-medium mb-4">The Scalp</h2>
          <div className="space-y-3">
            {holdings.length > 0 && (
              <Field label="Load from Holdings">
                <select className="input" value={holdingId} onChange={(e) => pickHolding(e.target.value)}>
                  <option value="">— manual entry —</option>
                  {holdings.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.symbol} · {h.qty} @ {h.avgPrice}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Exchange">
              <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
                <option>NSE</option>
                <option>BSE</option>
                <option>NYSE</option>
                <option>NASDAQ</option>
              </select>
            </Field>

            <div className="pt-1 text-[11px] uppercase tracking-wide text-zinc-500">Your holding</div>
            <Field label="Total Quantity Held">
              <NumInput value={totalQty} onChange={setTotalQty} />
            </Field>
            <Field label={`Holding Average (${ccy})`}>
              <NumInput value={avg} onChange={setAvg} />
            </Field>

            <div className="pt-1 text-[11px] uppercase tracking-wide text-zinc-500">The round trip</div>
            <Field label="Quantity Scalped">
              <NumInput value={sellQty} onChange={setSellQty} />
            </Field>
            <Field label={`Sold At (${ccy})`}>
              <NumInput value={sellPrice} onChange={setSellPrice} />
            </Field>
            <Field label={`Bought Back At (${ccy}) — leave blank if not yet`}>
              <NumInput value={buyBack} onChange={setBuyBack} placeholder="not bought back yet" />
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          {res ? (
            <>
              {/* Core holding — the whole point: it does not move */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard label="Holding quantity" value={fmtNum(res.coreQty, 0)} sub="unchanged by the scalp" />
                <StatCard label="Holding average" value={fmtMoney(res.coreAvg, ccy)} sub="unchanged by the scalp" />
                <StatCard
                  label={ex ? "Net profit booked" : "Sell value"}
                  value={ex ? fmtMoney(ex.netProfit, ccy) : fmtMoney(res.sellValue, ccy)}
                  sub={ex ? "intraday, after charges" : `${fmtNum(Number(sellQty), 0)} @ ${fmtMoney(Number(sellPrice), ccy)}`}
                  pnl={ex ? ex.netProfit : undefined}
                />
              </div>

              {ex ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="card">
                    <h2 className="text-sm font-medium mb-3">Round-Trip Result</h2>
                    <Row k="Sold" v={`${fmtNum(Number(sellQty), 0)} @ ${fmtMoney(Number(sellPrice), ccy)}`} />
                    <Row k="Bought back" v={`${fmtNum(Number(sellQty), 0)} @ ${fmtMoney(ex.buyBackPrice, ccy)}`} />
                    <Row k="Spread captured" v={fmtPct(ex.spreadPct)} cls={ex.spreadPct >= 0 ? "text-gain" : "text-loss"} />
                    <Row
                      k="Gross profit"
                      v={fmtMoney(ex.grossProfit, ccy)}
                      cls={ex.grossProfit >= 0 ? "text-gain" : "text-loss"}
                    />
                    <Row k="Charges (intraday round trip)" v={fmtMoney(ex.charges.total, ccy)} cls="text-loss" />
                    <Row
                      k="Net profit booked"
                      v={fmtMoney(ex.netProfit, ccy)}
                      cls={`font-semibold ${ex.netProfit >= 0 ? "text-gain" : "text-loss"}`}
                    />
                    {ex.netProfit < 0 && (
                      <p className="text-[11px] text-amber-400 mt-2">
                        You bought back too high — after charges this round trip lost money. Breakeven buy-back was{" "}
                        {fmtMoney(res.breakevenBuy, ccy)}.
                      </p>
                    )}
                  </div>
                  <div className="card">
                    <h2 className="text-sm font-medium mb-3">Effect on Your Holding</h2>
                    <Row k="Quantity after round trip" v={fmtNum(res.coreQty, 0)} />
                    <Row k="Average after round trip" v={fmtMoney(res.coreAvg, ccy)} />
                    <Row
                      k="Effective average (profit as cost cut)"
                      v={fmtMoney(ex.effectiveAvg, ccy)}
                      cls="text-accent"
                    />
                    <p className="text-[11px] text-zinc-500 mt-3">
                      Your reported average stays {fmtMoney(res.coreAvg, ccy)}. Spreading the{" "}
                      {fmtMoney(ex.netProfit, ccy)} booked profit across all {fmtNum(res.coreQty, 0)} shares is an
                      informal way to see your cost coming down to {fmtMoney(ex.effectiveAvg, ccy)}.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <h2 className="text-sm font-medium mb-1">Buy-Back Targets</h2>
                  <p className="text-[11px] text-zinc-500 mb-3">
                    You&apos;ve sold {fmtNum(Number(sellQty), 0)} @ {fmtMoney(Number(sellPrice), ccy)}. Buy the same
                    quantity back at or below these prices to book the profit shown, after intraday charges.
                  </p>
                  <Row
                    k="Breakeven buy-back (net ₹0 after charges)"
                    v={fmtMoney(res.breakevenBuy, ccy)}
                    cls="text-muted"
                  />
                  {res.targets.map((t) => (
                    <Row
                      key={t.net}
                      k={`Buy back to net ${fmtMoney(t.net, ccy)}`}
                      v={fmtMoney(t.price, ccy)}
                      cls="text-gain"
                    />
                  ))}
                </div>
              )}

              <div className="card p-0 overflow-x-auto">
                <div className="px-4 pt-4">
                  <h2 className="text-sm font-medium">Buy-Back Ladder</h2>
                  <p className="text-[11px] text-zinc-500 mt-1 mb-2">
                    Profit if you re-buy {fmtNum(Number(sellQty), 0)} shares at each drop below your{" "}
                    {fmtMoney(Number(sellPrice), ccy)} sell price. Net is after intraday round-trip charges.
                  </p>
                </div>
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr>
                      <th className="th">Drop</th>
                      <th className="th">Buy-Back Price</th>
                      <th className="th">Gross</th>
                      <th className="th">Charges</th>
                      <th className="th">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.buyBackLevels.map((b) => (
                      <tr key={b.dropPct}>
                        <td className="td font-mono text-loss">-{b.dropPct}%</td>
                        <td className="td font-mono">{fmtMoney(b.price, ccy)}</td>
                        <td className="td font-mono text-gain">{fmtMoney(b.gross, ccy)}</td>
                        <td className="td font-mono text-loss">{fmtMoney(b.charges, ccy)}</td>
                        <td className={`td font-mono ${b.net >= 0 ? "text-gain" : "text-loss"}`}>
                          {fmtMoney(b.net, ccy)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-zinc-500">
                Charges assume a same-day intraday square-off (the buy-back nets off the sell). If you carry the sale
                overnight and re-buy later, it becomes a delivery trade with different charges and your holding average
                will actually change.
              </p>
            </>
          ) : (
            <div className="card text-sm text-zinc-500">
              Enter your holding and the scalp (or load a holding) to see the plan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
