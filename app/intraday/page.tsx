"use client";

import { useEffect, useState } from "react";
import { requiredExitPrice, quantityPlan, profitGoalPlan } from "@/lib/calc";
import { Broker, Exchange, netPnl } from "@/lib/charges";
import { fmtMoney, fmtNum, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Row } from "@/components/ui";
import { useStore } from "@/lib/store";

type Tab = "points" | "exit" | "pct" | "qty" | "goal";

export default function Intraday() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings } = useStore();

  const [tab, setTab] = useState<Tab>("points");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const broker: Broker = exchange === "NSE" || exchange === "BSE" ? "zerodha" : "vested";
  const ccy = currencyFor(exchange);

  // Points P&L (bulk) calc
  const [ptHoldingId, setPtHoldingId] = useState<string>("");
  const [ptEntry, setPtEntry] = useState<number | "">(500);
  const [ptSizeMode, setPtSizeMode] = useState<"capital" | "qty">("capital");
  const [ptCapital, setPtCapital] = useState<number | "">(1000000);
  const [ptQtyIn, setPtQtyIn] = useState<number | "">(2000);
  const [ptStep, setPtStep] = useState<number | "">(1);
  const [ptLevels, setPtLevels] = useState<number | "">(6);
  const [ptDir, setPtDir] = useState<"long" | "short">("long");

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

  // Points P&L: size in bulk, then see net P&L at each point move up/down.
  const ptPrice = Number(ptEntry) || 0;
  const ptQty =
    ptSizeMode === "capital"
      ? ptPrice > 0
        ? Math.floor((Number(ptCapital) || 0) / ptPrice)
        : 0
      : Math.floor(Number(ptQtyIn) || 0);
  const ptDeployed = ptQty * ptPrice;
  const ptStepN = Number(ptStep) || 0;
  const ptLevelsN = Math.max(1, Math.min(30, Math.floor(Number(ptLevels) || 0)));

  const ptLadder =
    ptPrice > 0 && ptQty > 0 && ptStepN > 0
      ? Array.from({ length: ptLevelsN * 2 + 1 }, (_, i) => {
          const level = ptLevelsN - i; // +levels .. 0 .. -levels
          const move = level * ptStepN;
          const exit = ptPrice + move;
          if (exit <= 0) return null;
          const leg =
            ptDir === "long"
              ? { buyPrice: ptPrice, sellPrice: exit, qty: ptQty, exchange, segment: "intraday" as const }
              : { buyPrice: exit, sellPrice: ptPrice, qty: ptQty, exchange, segment: "intraday" as const };
          const r = netPnl(leg, broker);
          return { move, exit, gross: r.gross, charges: r.charges.total, net: r.net, pct: (move / ptPrice) * 100 };
        }).filter((x): x is NonNullable<typeof x> => x !== null)
      : [];

  // Breakeven: move needed just to cover charges (net = 0).
  const ptBreakeven =
    ptPrice > 0 && ptQty > 0
      ? requiredExitPrice({ buyPrice: ptPrice, qty: ptQty, targetNet: 0, broker, exchange, segment: "intraday" })
      : null;
  const ptBreakevenPts = ptBreakeven ? Math.abs(ptBreakeven.exitPrice - ptPrice) : 0;

  const pickPtHolding = (id: string) => {
    setPtHoldingId(id);
    const h = holdings.find((x) => x.id === id);
    if (h) {
      setExchange(h.exchange);
      setPtEntry(h.currentPrice);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "points", label: "Points P&L (bulk)" },
    { id: "exit", label: "Required Exit Price" },
    { id: "pct", label: "% Target Price" },
    { id: "qty", label: "Quantity Calculator" },
    { id: "goal", label: "Profit Goal Planner" },
  ];

  if (!mounted) return null;

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

      {tab === "points" && (
        <div className="grid lg:grid-cols-[340px_1fr] gap-4">
          <div className="card h-fit">
            <h2 className="text-sm font-medium mb-4">Trade Setup</h2>
            <div className="space-y-3">
              {holdings.length > 0 && (
                <Field label="Load from Holdings">
                  <select className="input" value={ptHoldingId} onChange={(e) => pickPtHolding(e.target.value)}>
                    <option value="">— manual entry —</option>
                    {holdings.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.symbol} · {fmtNum(h.currentPrice, 2)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={`Entry Price (${ccy})`}>
                <NumInput value={ptEntry} onChange={setPtEntry} />
              </Field>

              <div>
                <label className="label">Direction</label>
                <div className="inline-flex rounded-lg bg-surface p-0.5 w-full">
                  {(["long", "short"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setPtDir(d)}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                        ptDir === d ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Size by</label>
                <div className="inline-flex rounded-lg bg-surface p-0.5 w-full mb-2">
                  {(["capital", "qty"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPtSizeMode(m)}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        ptSizeMode === m ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {m === "capital" ? "Capital" : "Quantity"}
                    </button>
                  ))}
                </div>
                {ptSizeMode === "capital" ? (
                  <NumInput value={ptCapital} onChange={setPtCapital} placeholder="1000000" />
                ) : (
                  <NumInput value={ptQtyIn} onChange={setPtQtyIn} placeholder="2000" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={`Point Step (${ccy})`}>
                  <NumInput value={ptStep} onChange={setPtStep} />
                </Field>
                <Field label="Levels each side">
                  <NumInput value={ptLevels} onChange={setPtLevels} />
                </Field>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card">
                <div className="text-[11px] text-muted">Quantity</div>
                <div className="text-lg font-semibold font-mono mt-0.5">{fmtNum(ptQty, 0)}</div>
              </div>
              <div className="card">
                <div className="text-[11px] text-muted">Capital deployed</div>
                <div className="text-lg font-semibold font-mono mt-0.5">{fmtMoney(ptDeployed, ccy, 0)}</div>
              </div>
              <div className="card">
                <div className="text-[11px] text-muted">₹ per 1 point</div>
                <div className="text-lg font-semibold font-mono mt-0.5 text-accent">{fmtMoney(ptQty, ccy, 0)}</div>
              </div>
              <div className="card">
                <div className="text-[11px] text-muted">Breakeven move</div>
                <div className="text-lg font-semibold font-mono mt-0.5">
                  {ptBreakevenPts ? `${fmtNum(ptBreakevenPts, 2)} pts` : "—"}
                </div>
              </div>
            </div>

            {ptLadder.length > 0 ? (
              <div className="card p-0 overflow-x-auto">
                <div className="px-4 pt-4">
                  <h2 className="text-sm font-medium">
                    P&amp;L ladder — {ptDir === "long" ? "long" : "short"} {fmtNum(ptQty, 0)} @ {fmtMoney(ptPrice, ccy)}
                  </h2>
                  <p className="text-[11px] text-zinc-500 mt-1 mb-2">
                    Net is after intraday round-trip charges. Each 1-point move is worth {fmtMoney(ptQty, ccy, 0)}.
                  </p>
                </div>
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th className="th">Move</th>
                      <th className="th text-right">Exit Price</th>
                      <th className="th text-right">Gross P&amp;L</th>
                      <th className="th text-right">Charges</th>
                      <th className="th text-right">Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ptLadder.map((r) => {
                      const favorable = ptDir === "long" ? r.move > 0 : r.move < 0;
                      const zero = r.move === 0;
                      return (
                        <tr key={r.move} className={zero ? "bg-surface/40" : favorable ? "bg-gain/5" : "bg-loss/5"}>
                          <td className={`td font-mono ${r.move > 0 ? "text-gain" : r.move < 0 ? "text-loss" : "text-zinc-400"}`}>
                            {r.move > 0 ? "+" : ""}
                            {fmtNum(r.move, 2)} pt ({fmtPct(r.pct)})
                          </td>
                          <td className="td text-right font-mono">{fmtMoney(r.exit, ccy)}</td>
                          <td className={`td text-right font-mono ${pnlClass(r.gross)}`}>{fmtMoney(r.gross, ccy, 0)}</td>
                          <td className="td text-right font-mono text-loss">{fmtMoney(r.charges, ccy, 0)}</td>
                          <td className={`td text-right font-mono font-semibold ${pnlClass(r.net)}`}>
                            {fmtMoney(r.net, ccy, 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-zinc-500 px-4 py-3">
                  You&apos;re {ptDir}. A favourable {fmtNum(ptStepN, 2)}-point move nets about{" "}
                  <span className={pnlClass(1)}>
                    {fmtMoney(ptLadder.find((r) => (ptDir === "long" ? r.move === ptStepN : r.move === -ptStepN))?.net ?? 0, ccy, 0)}
                  </span>
                  ; the same move against you costs{" "}
                  <span className={pnlClass(-1)}>
                    {fmtMoney(ptLadder.find((r) => (ptDir === "long" ? r.move === -ptStepN : r.move === ptStepN))?.net ?? 0, ccy, 0)}
                  </span>
                  . You need ~{fmtNum(ptBreakevenPts, 2)} points just to cover charges.
                </p>
              </div>
            ) : (
              <div className="card text-sm text-zinc-500">Enter an entry price, size, and point step to see the ladder.</div>
            )}
          </div>
        </div>
      )}

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
