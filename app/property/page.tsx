"use client";

import { useEffect, useMemo, useState } from "react";
import { compareProperty, combinedReturn, linearSchedule, milestoneSchedule } from "@/lib/property";
import { fmtPct } from "@/lib/format";
import { PageTitle, StatCard, Field, NumInput } from "@/components/ui";
import { Home, LineChart, Scale, Info, Repeat, Wallet } from "lucide-react";

function inr(v: number) {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export default function Property() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [rateNow, setRateNow] = useState<number | "">(14500);
  const [rateExit, setRateExit] = useState<number | "">(20000);
  const [size, setSize] = useState<number | "">(2250);
  const [delivery, setDelivery] = useState<number | "">(7); // possession horizon
  const [stockRet, setStockRet] = useState<number | "">(18);

  // Payment plan: an even % per year, or slab-linked milestones (e.g. 20:20:60).
  const [planMode, setPlanMode] = useState<"even" | "milestone">("milestone");
  const [pctYear, setPctYear] = useState<number | "">(15); // even mode: % per year
  const [bookingPct, setBookingPct] = useState<number | "">(20);
  const [superPct, setSuperPct] = useState<number | "">(20);
  const [possessionPct, setPossessionPct] = useState<number | "">(60);
  const [superYear, setSuperYear] = useState<number | "">(3); // year the superstructure slab falls

  // Strategy
  const [flip, setFlip] = useState(true);
  const [sellYear, setSellYear] = useState<number | "">(5);
  const [transferPct, setTransferPct] = useState<number | "">(1.5);
  const [extraPct, setExtraPct] = useState<number | "">(7); // stamp+reg+GST (hold only)

  // Corpus funding: pay installments out of this, keep the rest 30/70 FD/market
  const [corpus, setCorpus] = useState<number | "">(25000000); // 2.5 Cr
  const [fdPct, setFdPct] = useState<number | "">(30);
  const [fdRet, setFdRet] = useState<number | "">(6.5);

  const purchase = (Number(rateNow) || 0) * (Number(size) || 0);
  const deliveryYr = Math.max(1, Math.round(Number(delivery) || 7));
  const schedule = useMemo(() => {
    if (planMode === "milestone") {
      return milestoneSchedule(purchase || 1, [
        { pct: Number(bookingPct) || 0, year: 1 },
        { pct: Number(superPct) || 0, year: Math.min(deliveryYr, Math.max(1, Number(superYear) || 3)) },
        { pct: Number(possessionPct) || 0, year: deliveryYr },
      ]);
    }
    return linearSchedule(purchase || 1, deliveryYr, Number(pctYear) || 15);
  }, [planMode, purchase, deliveryYr, pctYear, bookingPct, superPct, possessionPct, superYear]);

  const res = useMemo(() => {
    if (!rateNow || !size || !delivery || stockRet === "") return null;
    return compareProperty({
      rateNow: Number(rateNow),
      rateExit: Number(rateExit) || Number(rateNow),
      size: Number(size),
      years: Number(delivery),
      extraCostPct: Number(extraPct) || 0,
      payments: schedule,
      stockReturnPct: Number(stockRet),
      flip,
      sellYear: Number(sellYear) || Number(delivery),
      transferCostPct: Number(transferPct) || 0,
    });
  }, [rateNow, rateExit, size, delivery, extraPct, schedule, stockRet, flip, sellYear, transferPct]);

  const combined = useMemo(() => {
    if (!res || !corpus) return null;
    return combinedReturn({
      corpus: Number(corpus),
      fdPct: Number(fdPct) || 0,
      fdReturnPct: Number(fdRet) || 0,
      marketReturnPct: Number(stockRet) || 0,
      payments: schedule,
      flipCash: res.propertyEnd,
      horizon: res.horizon,
    });
  }, [res, corpus, fdPct, fdRet, stockRet, schedule]);

  if (!mounted) return null;
  const horizon = res?.horizon ?? (Number(sellYear) || 5);

  return (
    <div>
      <PageTitle title="Property vs Stocks" subtitle="Buy the flat — or flip the allotment before possession — versus keeping the money in the market." />

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        <div className="card h-fit">
          {/* Strategy toggle */}
          <div className="inline-flex rounded-lg bg-surface p-0.5 w-full mb-4">
            <button
              onClick={() => setFlip(true)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${flip ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Flip before possession
            </button>
            <button
              onClick={() => setFlip(false)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${!flip ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Buy &amp; hold
            </button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rate now (₹/sqft)"><NumInput value={rateNow} onChange={setRateNow} /></Field>
              <Field label="Size (sqft)"><NumInput value={size} onChange={setSize} /></Field>
            </div>
            <Field label="Rate at sale (₹/sqft)"><NumInput value={rateExit} onChange={setRateExit} /></Field>
            <Field label="Delivery (years)"><NumInput value={delivery} onChange={setDelivery} /></Field>

            <div>
              <label className="label">Payment plan</label>
              <div className="inline-flex rounded-lg bg-surface p-0.5 w-full mb-2">
                <button
                  onClick={() => setPlanMode("milestone")}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${planMode === "milestone" ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Milestones (20:20:60)
                </button>
                <button
                  onClick={() => setPlanMode("even")}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${planMode === "even" ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Even % / yr
                </button>
              </div>
              {planMode === "milestone" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Booking %"><NumInput value={bookingPct} onChange={setBookingPct} /></Field>
                    <Field label="Super %"><NumInput value={superPct} onChange={setSuperPct} /></Field>
                    <Field label="Possess. %"><NumInput value={possessionPct} onChange={setPossessionPct} /></Field>
                  </div>
                  <Field label="Superstructure slab in year"><NumInput value={superYear} onChange={setSuperYear} /></Field>
                </div>
              ) : (
                <Field label="Pay % / year"><NumInput value={pctYear} onChange={setPctYear} /></Field>
              )}
            </div>

            {flip ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sell in year"><NumInput value={sellYear} onChange={setSellYear} /></Field>
                <Field label="Transfer + broker %"><NumInput value={transferPct} onChange={setTransferPct} /></Field>
              </div>
            ) : (
              <Field label="Stamp + reg + GST %"><NumInput value={extraPct} onChange={setExtraPct} /></Field>
            )}

            <Field label="Market / trading return (annual %)"><NumInput value={stockRet} onChange={setStockRet} /></Field>

            <div className="pt-2 border-t border-border/60">
              <label className="label flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Fund it from your corpus</label>
              <div className="space-y-3 mt-1">
                <Field label="Total corpus (₹)"><NumInput value={corpus} onChange={setCorpus} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="In FD %"><NumInput value={fdPct} onChange={setFdPct} /></Field>
                  <Field label="FD return %"><NumInput value={fdRet} onChange={setFdRet} /></Field>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <label className="label">Schedule (₹ per milestone)</label>
              <div className="space-y-1">
                {schedule.map((s) => {
                  const paid = !flip || s.year <= (Number(sellYear) || Number(delivery));
                  const tag =
                    planMode === "milestone"
                      ? s.year === 1
                        ? "booking"
                        : s.year === deliveryYr
                        ? "possession"
                        : "superstructure"
                      : null;
                  return (
                    <div key={s.year} className={`flex items-center justify-between text-xs font-mono px-2 py-1 rounded ${paid ? "bg-surface" : "opacity-40 line-through"}`}>
                      <span className="text-muted">Y{s.year}{tag && <span className="ml-1 text-[10px] text-zinc-500">· {tag}</span>}</span>
                      <span>{inr(s.amount)}</span>
                    </div>
                  );
                })}
              </div>
              {flip && res && (
                <p className="text-[11px] text-zinc-500 mt-2">
                  You pay {inr(res.paidSoFar)} by year {horizon}; the buyer takes over {inr(res.outstanding)} outstanding
                  {planMode === "milestone" && (Number(sellYear) || Number(delivery)) < deliveryYr ? " — the 60% possession slab is never yours to pay." : "."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {res && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={`Flat value in ${horizon}y`} value={inr(res.endValue)} sub={`from ${inr(res.purchase)} base`} />
                <StatCard label="Cash you deploy" value={inr(res.totalCommitted)} sub={res.mode === "flip" ? "only installments paid" : `incl. ${inr(res.extraCost)} costs`} />
                <StatCard label="Property XIRR" value={fmtPct(res.propertyXirr)} pnl={res.propertyXirr} sub="money-weighted" />
                <StatCard label="Break-even stock return" value={fmtPct(res.crossoverPct)} sub="hurdle to beat property" />
              </div>

              {/* Head to head */}
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Scale className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-medium">
                    Same money, {horizon} years — what you walk away with
                  </h2>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className={`rounded-lg border p-3 ${res.winner === "property" ? "border-gain/40 bg-gain/5" : "border-border"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {res.mode === "flip" ? <Repeat className="w-4 h-4 text-zinc-300" /> : <Home className="w-4 h-4 text-zinc-300" />}
                      <span className="text-sm font-medium">{res.mode === "flip" ? "Flip the allotment" : "Buy & hold the flat"}</span>
                      {res.winner === "property" && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gain/15 text-gain">wins</span>}
                    </div>
                    <div className="text-2xl font-semibold font-mono">{inr(res.propertyEnd)}</div>
                    <div className={`text-xs font-mono mt-1 ${res.propertyGain >= 0 ? "text-gain" : "text-loss"}`}>
                      profit {inr(res.propertyGain)}
                    </div>
                    <p className="text-[11px] text-muted mt-2">
                      {res.mode === "flip"
                        ? "Cash in hand after the buyer assumes the balance and you pay transfer fees. No registration."
                        : "You own a flat worth this — live in it or rent it."}
                    </p>
                  </div>
                  <div className={`rounded-lg border p-3 ${res.winner === "stocks" ? "border-gain/40 bg-gain/5" : "border-border"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <LineChart className="w-4 h-4 text-zinc-300" />
                      <span className="text-sm font-medium">Stay in stocks</span>
                      {res.winner === "stocks" && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gain/15 text-gain">wins</span>}
                    </div>
                    <div className="text-2xl font-semibold font-mono">{inr(res.stockEnd)}</div>
                    <div className={`text-xs font-mono mt-1 ${res.stockGain >= 0 ? "text-gain" : "text-loss"}`}>
                      profit {inr(res.stockGain)}
                    </div>
                    <p className="text-[11px] text-muted mt-2">Same installments invested at your {Number(stockRet)}% — fully liquid.</p>
                  </div>
                </div>
                <p className="text-sm text-zinc-300 mt-3">
                  {res.winner === "tie" ? (
                    "It's roughly a wash on these numbers — the decision comes down to risk and liquidity."
                  ) : (
                    <>
                      On these numbers, <span className={`font-medium ${res.winner === "property" ? "text-gain" : "text-accent"}`}>{res.winner === "property" ? (res.mode === "flip" ? "the flip" : "the flat") : "staying in stocks"}</span>{" "}
                      leaves you richer by <span className="font-mono">{inr(Math.abs(res.edge))}</span> after {horizon} years. Stocks
                      overtake the property only above <span className="font-mono">{fmtPct(res.crossoverPct)}</span> a year.
                    </>
                  )}
                </p>
              </div>

              {/* Combined portfolio — the whole corpus */}
              {combined && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-medium">Your whole {inr(Number(corpus))} over {combined.horizon} years</h2>
                  </div>
                  <p className="text-[11px] text-zinc-500 mb-3">
                    Installments come out of the corpus; the rest sits {Number(fdPct)}% in FD @ {Number(fdRet)}% and{" "}
                    {100 - Number(fdPct)}% in the market @ {Number(stockRet)}% — a blended{" "}
                    <span className="text-zinc-300 font-mono">{fmtPct(combined.blendedPct)}</span> on the idle money.
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <StatCard label="Total wealth at exit" value={inr(combined.totalWealth)} sub={`from ${inr(Number(corpus))}`} />
                    <StatCard label="Total gain" value={inr(combined.totalGain)} pnl={combined.totalGain} sub="flat + investments" />
                    <StatCard label="Blended CAGR" value={fmtPct(combined.cagr)} pnl={combined.cagr} sub="on the full corpus" />
                    <StatCard label="Flat's added return" value={`${combined.flatAlphaPct >= 0 ? "+" : ""}${combined.flatAlphaPct.toFixed(1)}%`} pnl={combined.flatAlphaPct} sub="vs investing it all" />
                  </div>

                  <div className="rounded-lg bg-surface p-3 mb-3 text-sm">
                    <div className="flex justify-between py-1 border-b border-border/60">
                      <span className="text-muted">Flip cash at exit</span>
                      <span className="font-mono">{inr(combined.flipCash)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/60">
                      <span className="text-muted">+ Invested corpus left over</span>
                      <span className="font-mono">{inr(combined.restEnd)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 font-medium">
                      <span>= Total wealth</span>
                      <span className="font-mono">{inr(combined.totalWealth)}</span>
                    </div>
                    <div className="flex justify-between py-1 mt-1 border-t border-border/60 text-muted">
                      <span>vs. investing all {inr(Number(corpus))} at {fmtPct(combined.blendedPct)}, no flat</span>
                      <span className="font-mono">{inr(combined.investAllEnd)}</span>
                    </div>
                  </div>

                  <p className="text-sm text-zinc-300">
                    {combined.better === "tie" ? (
                      "Buying the flat comes out roughly even with just investing the whole corpus 30/70."
                    ) : combined.better === "property" ? (
                      <>Buying the flat leaves you <span className="text-gain font-mono">{inr(Math.abs(combined.edge))}</span> ahead of simply investing the entire corpus 30/70 — the flip clears your blended {fmtPct(combined.blendedPct)}.</>
                    ) : (
                      <>Just investing the whole corpus 30/70 beats the flat by <span className="text-accent font-mono">{inr(Math.abs(combined.edge))}</span> — the flat doesn&apos;t clear your blended {fmtPct(combined.blendedPct)} once so much cash sits idle.</>
                    )}
                    {!combined.affordable && <span className="text-loss"> Note: the corpus runs dry before you finish the installments — you&apos;d need to top it up.</span>}
                  </p>

                  <p className="text-[11px] text-zinc-500 mt-4 mb-1">
                    Each year: pay the installment, split what&apos;s left {Number(fdPct)}/{100 - Number(fdPct)} into FD & market, earn returns, carry the closing balance forward.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                      <thead>
                        <tr>
                          <th className="th">Year</th>
                          <th className="th text-right">Opening</th>
                          <th className="th text-right">Pay (15%)</th>
                          <th className="th text-right">Invest left</th>
                          <th className="th text-right">FD @{Number(fdRet)}%</th>
                          <th className="th text-right">Market @{Number(stockRet)}%</th>
                          <th className="th text-right">Return</th>
                          <th className="th text-right">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combined.rows.map((r) => (
                          <tr key={r.year}>
                            <td className="td font-mono text-xs">Y{r.year}</td>
                            <td className="td text-right font-mono text-xs text-muted">{inr(r.openingCorpus)}</td>
                            <td className="td text-right font-mono text-xs text-loss">−{inr(r.installment)}</td>
                            <td className="td text-right font-mono text-xs">{inr(r.invested)}</td>
                            <td className="td text-right font-mono text-xs text-muted">{inr(r.fdStart)}<span className="text-gain"> +{inr(r.fdGain)}</span></td>
                            <td className="td text-right font-mono text-xs text-muted">{inr(r.mktStart)}<span className="text-gain"> +{inr(r.mktGain)}</span></td>
                            <td className="td text-right font-mono text-xs text-gain">+{inr(r.gain)}</td>
                            <td className="td text-right font-mono text-xs font-medium">{inr(r.corpusEnd)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-border">
                          <td className="td font-mono text-xs font-medium" colSpan={7}>
                            + Flip cash received in year {combined.horizon}
                          </td>
                          <td className="td text-right font-mono text-xs text-gain">+{inr(combined.flipCash)}</td>
                        </tr>
                        <tr>
                          <td className="td text-xs font-medium" colSpan={7}>= Total wealth</td>
                          <td className="td text-right font-mono text-sm font-semibold">{inr(combined.totalWealth)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Why the flip works */}
              {res.mode === "flip" && (
                <div className="card border-accent/20 bg-accent/5">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-medium">Why the flip juices the return</h3>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    You deploy only <span className="text-zinc-100">{inr(res.paidSoFar)}</span> of installments, yet the flat
                    appreciates on its <span className="text-zinc-100">full {inr(res.purchase)}</span> value — so a{" "}
                    {(((Number(rateExit) - Number(rateNow)) / Number(rateNow)) * 100).toFixed(0)}% price rise turns into a{" "}
                    <span className="font-mono text-gain">{fmtPct(res.propertyXirr)}</span> money-weighted return. Skipping
                    registration saves the ~{Number(extraPct)}% stamp/GST you'd bear on possession. The catch: you must actually
                    find a buyer for the allotment near possession — if the market is soft you may have to discount, and the whole
                    plan assumes the {inr(res.endValue / Number(size))}/sqft exit rate holds.
                  </p>
                </div>
              )}

              {/* Beyond the numbers */}
              <div className="card">
                <h3 className="text-sm font-medium mb-3">Watch-outs before you count on this</h3>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  {[
                    ["Exit liquidity", "Selling an under-construction allotment isn't instant — you need a buyer willing to take over the plan. Near possession supply is highest; a soft market forces a discount."],
                    ["Builder transfer", "Most builders charge a transfer/endorsement fee (₹100–250/sqft or a %) to name the new buyer — modeled here as your transfer cost."],
                    ["Capital-gains tax", "Gain on the allotment held >24 months is LTCG ~12.5%; sell before 24 months and it's taxed at your slab. Not netted in the headline above."],
                    ["GST", "Under-construction installments carry 5% GST that's embedded in the builder's price — it doesn't disappear by flipping."],
                    ["Delivery / builder risk", "Project delays or a stalled builder can trap your paid installments with no easy exit — real risk stocks don't have."],
                    ["Concentration", "Even flipped, it's one project, one city, one builder — vs a diversified stock book you can trim any day."],
                    ["Financing", "You can't take a home loan on something you plan to sell before registration, so it's all your own cash."],
                    ["Assumption stacking", "Both the exit rate AND the stock return are guesses — try a lower exit rate and the flip's edge shrinks fast."],
                  ].map(([h, b]) => (
                    <div key={h}>
                      <span className="text-zinc-200 font-medium">{h}:</span> <span className="text-zinc-400">{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-zinc-500">
                A planning tool, not investment advice. The exit rate, the {Number(stockRet)}% stock return, and finding a buyer
                are all assumptions — stress-test with a lower exit rate and an earlier sale year before leaning on the verdict.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
