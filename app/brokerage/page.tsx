"use client";

import { useState } from "react";
import { zerodhaCharges, vestedCharges, DEFAULT_ZERODHA, Segment, Exchange } from "@/lib/charges";
import { fmtMoney, pnlClass } from "@/lib/format";
import { PageTitle, Field, NumInput, Row } from "@/components/ui";

export default function Brokerage() {
  const [market, setMarket] = useState<"in" | "us">("in");

  // India
  const [segment, setSegment] = useState<Segment>("intraday");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [buy, setBuy] = useState<number | "">(100);
  const [sell, setSell] = useState<number | "">(101);
  const [qty, setQty] = useState<number | "">(500);

  // US
  const [uBuy, setUBuy] = useState<number | "">(100);
  const [uSell, setUSell] = useState<number | "">(102);
  const [uQty, setUQty] = useState<number | "">(50);

  const inRes =
    buy && sell && qty
      ? zerodhaCharges({ buyPrice: Number(buy), sellPrice: Number(sell), qty: Number(qty), exchange, segment })
      : null;
  const inGross = buy && sell && qty ? (Number(sell) - Number(buy)) * Number(qty) : 0;

  const usRes =
    uBuy && uSell && uQty
      ? vestedCharges({ buyPrice: Number(uBuy), sellPrice: Number(uSell), qty: Number(uQty), exchange: "NASDAQ", segment: "delivery" })
      : null;
  const usGross = uBuy && uSell && uQty ? (Number(uSell) - Number(uBuy)) * Number(uQty) : 0;

  return (
    <div>
      <PageTitle title="Brokerage Calculator" subtitle="Full charge breakdown — Zerodha (India) and Vested (US)" />

      <div className="flex gap-2 mb-6">
        <button onClick={() => setMarket("in")}
          className={`btn !py-1.5 text-xs ${market === "in" ? "bg-accent/15 text-accent border border-accent/40" : "bg-surface border border-border text-zinc-400"}`}>
          Zerodha (NSE/BSE)
        </button>
        <button onClick={() => setMarket("us")}
          className={`btn !py-1.5 text-xs ${market === "us" ? "bg-accent/15 text-accent border border-accent/40" : "bg-surface border border-border text-zinc-400"}`}>
          Vested (US)
        </button>
      </div>

      {market === "in" ? (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Trade</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Segment">
                  <select className="input" value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
                    <option value="intraday">Intraday (MIS)</option>
                    <option value="delivery">Delivery (CNC)</option>
                  </select>
                </Field>
                <Field label="Exchange">
                  <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
                    <option>NSE</option><option>BSE</option>
                  </select>
                </Field>
              </div>
              <Field label="Buy Price (₹)"><NumInput value={buy} onChange={setBuy} /></Field>
              <Field label="Sell Price (₹)"><NumInput value={sell} onChange={setSell} /></Field>
              <Field label="Quantity"><NumInput value={qty} onChange={setQty} /></Field>
            </div>
            <p className="text-[11px] text-zinc-500 mt-4">
              Rates: {segment === "intraday"
                ? `brokerage ${DEFAULT_ZERODHA.intradayBrokeragePct}% capped ₹${DEFAULT_ZERODHA.intradayBrokerageCap}/order, STT ${DEFAULT_ZERODHA.sttIntradaySellPct}% on sell`
                : `zero brokerage, STT ${DEFAULT_ZERODHA.sttDeliveryPct}% both sides`}. Verify against Zerodha&apos;s current schedule.
            </p>
          </div>
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Breakdown</h2>
            {inRes ? (
              <>
                <Row k="Turnover" v={fmtMoney((Number(buy) + Number(sell)) * Number(qty))} />
                <Row k="Brokerage" v={fmtMoney(inRes.brokerage)} />
                <Row k="STT" v={fmtMoney(inRes.stt)} />
                <Row k="Exchange Txn Charges" v={fmtMoney(inRes.exchange)} />
                <Row k="SEBI Charges" v={fmtMoney(inRes.sebi)} />
                <Row k="GST (18%)" v={fmtMoney(inRes.gst)} />
                <Row k="Stamp Duty" v={fmtMoney(inRes.stampDuty)} />
                {segment === "delivery" && <Row k="DP Charge (sell)" v={fmtMoney(inRes.dp)} />}
                <Row k="Total Charges" v={fmtMoney(inRes.total)} cls="text-loss" />
                <Row k="Gross P/L" v={fmtMoney(inGross)} cls={pnlClass(inGross)} />
                <Row k="Net P/L" v={fmtMoney(inGross - inRes.total)} cls={`font-semibold ${pnlClass(inGross - inRes.total)}`} />
                <Row k="Breakeven points" v={`${((inRes.total / Number(qty))).toFixed(2)} per share`} />
              </>
            ) : (
              <p className="text-sm text-zinc-500">Enter trade details.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Trade</h2>
            <div className="space-y-3">
              <Field label="Buy Price ($)"><NumInput value={uBuy} onChange={setUBuy} /></Field>
              <Field label="Sell Price ($)"><NumInput value={uSell} onChange={setUSell} /></Field>
              <Field label="Quantity"><NumInput value={uQty} onChange={setUQty} /></Field>
            </div>
            <p className="text-[11px] text-zinc-500 mt-4">
              Assumes zero-commission plan. SEC fee and FINRA TAF apply on the sell side. Currency conversion (INR↔USD) charged separately by Vested at funding time — not included here. Verify current rates.
            </p>
          </div>
          <div className="card">
            <h2 className="text-sm font-medium mb-4">Breakdown</h2>
            {usRes ? (
              <>
                <Row k="Commission" v={fmtMoney(usRes.brokerage, "USD", 4)} />
                <Row k="SEC Fee" v={fmtMoney(usRes.stt, "USD", 4)} />
                <Row k="FINRA TAF" v={fmtMoney(usRes.exchange, "USD", 4)} />
                <Row k="Total Charges" v={fmtMoney(usRes.total, "USD", 4)} cls="text-loss" />
                <Row k="Gross P/L" v={fmtMoney(usGross, "USD")} cls={pnlClass(usGross)} />
                <Row k="Net P/L" v={fmtMoney(usGross - usRes.total, "USD")} cls={`font-semibold ${pnlClass(usGross - usRes.total)}`} />
              </>
            ) : (
              <p className="text-sm text-zinc-500">Enter trade details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
