"use client";

import { useState } from "react";
import { requiredExitPrice, quantityPlan, profitGoalPlan } from "@/lib/calc";
import { Broker, Exchange } from "@/lib/charges";
import { fmtMoney, fmtNum, fmtPct, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Row } from "@/components/ui";

type Tab = "exit" | "pct" | "qty" | "goal";

export default function Intraday() {
  const [tab, setTab] = useState<Tab>("exit");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const broker: Broker = exchange === "NSE" || exchange === "BSE" ? "zerodha" : "vested";
  const ccy = currencyFor(exchange);

  // Exit price calc
  const [buyPrice, setBuyPrice] = useState<number | "">(100);
  const [qty, setQty] = useState<number | "">(500);
  const [targetNet, setTargetNet] = useState<number | "">(5000);
  const [slippage, setSlippage] = useState<number | "">(0.05);

  // % target calc
  const [pPrice, setPPrice] = useState<number | "">("");
  const [pQty, setPQty] = useState<number | "">("");
  const [profitPct, setProfitPct] = useState<number | "">(1);
  const [lossPct, setLossPct] = useState<number | "">("");

  // Quantity calc
  const [price, setPrice] = useState<number | "">("");
  const [desiredProfit, setDesiredProfit] = useState<number | "">("");
  const [capital, setCapital] = useState<number | "">(200000);

  // Goal calc
  const [dailyTarget, setDailyTarget] = useState<number | "">(10000);
  const [goalCapital, setGoalCapital] = useState<number | "">(200000);
  const [riskPct, setRiskPct] = useState<number | "">(2);

  const exitRes =
    buyPrice && qty && targetNet
      ? requiredExitPrice({
          buyPrice: Number(buyPrice), qty: Number(qty), targetNet: Number(targetNet),
          broker, exchange, segment: "intraday", slippagePct: Number(slippage) || 0,
        })
      : null;

  const qtyRes =
    price && desiredProfit && capital
      ? quantityPlan({
          price: Number(price), desiredProfit: Number(desiredProfit), capital: Number(capital),
          broker, exchange, segment: "intraday",
        })
      : null;

  const goalRes =
    dailyTarget && goalCapital && riskPct
      ? profitGoalPlan({ dailyTarget: Number(dailyTarget), capital: Number(goalCapital), riskPct: Number(riskPct), broker })
      : null;

  const invested = pPrice && pQty ? Number(pPrice) * Number(pQty) : 0;
  const pctTarget =
    invested > 0 && profitPct
      ? requiredExitPrice({
          buyPrice: Number(pPrice), qty: Number(pQty),
          targetNet: invested * (Number(profitPct) / 100),
          broker, exchange, segment: "intraday",
        })
      : null;
  const pctStop =
    invested > 0 && lossPct
      ? requiredExitPrice({
          buyPrice: Number(pPrice), qty: Number(pQty),
          targetNet: -invested * (Number(lossPct) / 100),
          broker, exchange, segment: "intraday",
        })
      : null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "exit", label: "Required Exit Price" },
    { id: "pct", label: "% Target Price" },
    { id: "qty", label: "Quantity Calculator" },
    { id: "goal", label: "Profit Goal Planner" },
  ];

  return (
    <div>
      <PageTitle title="Intraday Assistant" subtitle="Plan exits, sizing, and daily goals — net of all charges" />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`btn !py-1.5 text-xs ${tab === t.id ? "bg-accent/15 text-accent border border-accent/40" : "bg-surface border border-border text-zinc-400"}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto">
          <select className="input !w-auto" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
            <option>NSE</option><option>BSE</option><option>NYSE</option><option>NASDAQ</option>
          </select>
        </div>
      </div>

      {tab === "exit" && (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Trade Inputs</h2>
            <div className="space-y-3">
              <Field label={`Buy Price (${ccy})`}><NumInput value={buyPrice} onChange={setBuyPrice} /></Field>
              <Field label="Quantity"><NumInput value={qty} onChange={setQty} /></Field>
              <Field label={`Target Net Profit (${ccy})`}><NumInput value={targetNet} onChange={setTargetNet} /></Field>
              <Field label="Slippage Buffer %"><NumInput value={slippage} onChange={setSlippage} /></Field>
            </div>
          </div>
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Result</h2>
            {exitRes ? (
              <>
                <div className="mb-4">
                  <div className="text-xs text-muted">Sell at</div>
                  <div className="text-2xl font-semibold font-mono text-accent">{fmtMoney(exitRes.exitPrice, ccy)}</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {fmtPct(exitRes.movePct)} move · with slippage buffer: <span className="font-mono">{fmtMoney(exitRes.exitPriceWithSlippage, ccy)}</span>
                  </div>
                </div>
                <Row k="Gross Profit" v={fmtMoney(exitRes.gross, ccy)} cls="text-gain" />
                <Row k="Brokerage" v={fmtMoney(exitRes.charges.brokerage, ccy)} />
                <Row k={ccy === "INR" ? "STT" : "SEC Fee"} v={fmtMoney(exitRes.charges.stt, ccy)} />
                <Row k={ccy === "INR" ? "Exchange + SEBI" : "FINRA TAF"} v={fmtMoney(exitRes.charges.exchange + exitRes.charges.sebi, ccy)} />
                {ccy === "INR" && <Row k="GST" v={fmtMoney(exitRes.charges.gst, ccy)} />}
                {ccy === "INR" && <Row k="Stamp Duty" v={fmtMoney(exitRes.charges.stampDuty, ccy)} />}
                <Row k="Total Charges" v={fmtMoney(exitRes.charges.total, ccy)} cls="text-loss" />
                <Row k="Net Profit" v={fmtMoney(exitRes.net, ccy)} cls="text-gain font-semibold" />
              </>
            ) : (
              <p className="text-sm text-zinc-500">Fill in the inputs to see the required exit price.</p>
            )}
          </div>
        </div>
      )}

      {tab === "pct" && (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Trade Inputs</h2>
            <div className="space-y-3">
              <Field label={`Current / Buy Price (${ccy})`}><NumInput value={pPrice} onChange={setPPrice} placeholder="2090" /></Field>
              <Field label="Quantity"><NumInput value={pQty} onChange={setPQty} placeholder="100" /></Field>
              <Field label="Desired Profit % (on invested amount)"><NumInput value={profitPct} onChange={setProfitPct} placeholder="1" /></Field>
              <Field label="Max Loss % (optional, for stop-loss price)"><NumInput value={lossPct} onChange={setLossPct} placeholder="0.5" /></Field>
            </div>
            {invested > 0 && (
              <p className="text-[11px] text-zinc-500 mt-4">
                Investment: <span className="font-mono text-zinc-300">{fmtMoney(invested, ccy)}</span>
                {profitPct ? <> · target profit <span className="font-mono text-gain">{fmtMoney(invested * (Number(profitPct) / 100), ccy)}</span></> : null}
                {lossPct ? <> · max loss <span className="font-mono text-loss">{fmtMoney(invested * (Number(lossPct) / 100), ccy)}</span></> : null}
              </p>
            )}
          </div>
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Order Prices</h2>
            {pctTarget ? (
              <>
                <div className="mb-4">
                  <div className="text-xs text-muted">Place sell / target order at</div>
                  <div className="text-2xl font-semibold font-mono text-gain">{fmtMoney(pctTarget.exitPrice, ccy)}</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {fmtPct(pctTarget.movePct)} move · net profit after charges: <span className="font-mono text-gain">{fmtMoney(pctTarget.net, ccy)}</span> ({fmtPct((pctTarget.net / invested) * 100)} of invested)
                  </div>
                </div>
                <Row k="Gross profit at target" v={fmtMoney(pctTarget.gross, ccy)} />
                <Row k="Total charges" v={fmtMoney(pctTarget.charges.total, ccy)} cls="text-loss" />
                {pctStop && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="text-xs text-muted">Place stop-loss order at</div>
                    <div className="text-xl font-semibold font-mono text-loss">{fmtMoney(pctStop.exitPrice, ccy)}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {fmtPct(pctStop.movePct)} move · net loss incl. charges: <span className="font-mono text-loss">{fmtMoney(pctStop.net, ccy)}</span>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-zinc-500 mt-4">
                  Target includes all charges — selling at exactly {fmtMoney(pctTarget.exitPrice, ccy)} nets you {Number(profitPct)}% of your invested amount. A plain +{Number(profitPct)}% limit ({fmtMoney(Number(pPrice) * (1 + Number(profitPct) / 100), ccy)}) would fall short by the charge amount.
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Enter price, quantity, and profit % to get your order price.</p>
            )}
          </div>
        </div>
      )}

      {tab === "qty" && (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Inputs</h2>
            <div className="space-y-3">
              <Field label={`Current Price (${ccy})`}><NumInput value={price} onChange={setPrice} placeholder="100" /></Field>
              <Field label={`Desired Profit (${ccy})`}><NumInput value={desiredProfit} onChange={setDesiredProfit} placeholder="5000" /></Field>
              <Field label={`Available Capital (${ccy})`}><NumInput value={capital} onChange={setCapital} /></Field>
            </div>
          </div>
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Sizing</h2>
            {qtyRes ? (
              <>
                <Row k="Maximum Quantity" v={fmtNum(qtyRes.maxQty, 0)} />
                <Row k="Ideal Quantity (60% capital)" v={fmtNum(qtyRes.idealQty, 0)} cls="text-accent" />
                {qtyRes.ideal && (
                  <>
                    <Row k="Exit price @ ideal qty" v={fmtMoney(qtyRes.ideal.exitPrice, ccy)} />
                    <Row k="Move needed" v={fmtPct(qtyRes.ideal.movePct)} />
                    <Row k="Expected charges" v={fmtMoney(qtyRes.ideal.charges.total, ccy)} />
                    <Row k="Expected net profit" v={fmtMoney(qtyRes.ideal.net, ccy)} cls="text-gain" />
                  </>
                )}
                {qtyRes.max && (
                  <p className="text-[11px] text-zinc-500 mt-3">
                    At max quantity the required move drops to {fmtPct(qtyRes.max.movePct)}, but you would be fully deployed — no room to average or absorb slippage.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500">Fill in the inputs to size the trade.</p>
            )}
          </div>
        </div>
      )}

      {tab === "goal" && (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Inputs</h2>
            <div className="space-y-3">
              <Field label={`Today's Target (${ccy})`}><NumInput value={dailyTarget} onChange={setDailyTarget} /></Field>
              <Field label={`Capital (${ccy})`}><NumInput value={goalCapital} onChange={setGoalCapital} /></Field>
              <Field label="Max Risk % (of capital, per day)"><NumInput value={riskPct} onChange={setRiskPct} /></Field>
            </div>
          </div>
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Plan</h2>
            {goalRes ? (
              <>
                <Row k="Suggested trades" v={fmtNum(goalRes.trades, 0)} />
                <Row k="Target per trade" v={fmtMoney(goalRes.perTrade, ccy)} cls="text-gain" />
                <Row k="Max loss allowed (day)" v={fmtMoney(goalRes.maxDayLoss, ccy)} cls="text-loss" />
                <Row k="Max loss per trade" v={fmtMoney(goalRes.maxLossPerTrade, ccy)} cls="text-loss" />
                <Row k="Risk : Reward" v={`1 : ${goalRes.riskReward.toFixed(2)}`} />
                {goalRes.riskReward < 1 && (
                  <p className="text-[11px] text-amber-400 mt-3">
                    Warning: your target per trade is smaller than your allowed loss per trade. Tighten stops or lower the daily target.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500">Fill in the inputs to plan the day.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
