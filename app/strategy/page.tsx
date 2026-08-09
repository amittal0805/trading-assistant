"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { evalStrategy, BucketInput } from "@/lib/strategy";
import { currencyFor, fmtPct, pnlClass } from "@/lib/format";
import { PageTitle, StatCard, Field, NumInput } from "@/components/ui";
import { Goal, Info, Wallet, PieChart, CalendarClock, Gauge, Calculator } from "lucide-react";

function inr(v: number) {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export default function StrategyPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings, mutualFunds, strategies, pnl } = useStore();

  // Objective
  const [total, setTotal] = useState<number | "">(22500000); // 2.25 Cr to deploy (25 L now + 2 Cr later)
  const [targetPct, setTargetPct] = useState<number | "">(20);

  // Phase 1 — ready now, staggered by 24 Aug (mix of Anand Rathi / MF / sector)
  const [p1Anand, setP1Anand] = useState<number | "">(1000000); // 10 L
  const [p1Mf, setP1Mf] = useState<number | "">(800000); // 8 L
  const [p1Sector, setP1Sector] = useState<number | "">(700000); // 7 L

  // Phase 2 — from 24 Aug, staggered
  const [p2Total, setP2Total] = useState<number | "">(20000000); // 2 Cr
  const [p2Tranche, setP2Tranche] = useState<number | "">(2500000); // 25 L per tranche
  const [p2Every, setP2Every] = useState<number | "">(2); // months

  // Target allocation (planned ₹ + expected annual return)
  const [anandPlan, setAnandPlan] = useState<number | "">(10000000); // ≤ 1 Cr
  const [anandRet, setAnandRet] = useState<number | "">(22);
  const [rotPlan, setRotPlan] = useState<number | "">(4000000); // 40 L
  const [rotRet, setRotRet] = useState<number | "">(20);
  const [mfPlan, setMfPlan] = useState<number | "">(2500000); // 25 L
  const [mfRet, setMfRet] = useState<number | "">(12);
  const [flatPlan, setFlatPlan] = useState<number | "">(6000000); // 60 L (20% flat booking)
  const [flatRet, setFlatRet] = useState<number | "">(20);
  const [fdPlan, setFdPlan] = useState<number | "">(0);
  const [fdRet, setFdRet] = useState<number | "">(6.5);

  // Deployment so far (not read from holdings)
  const [fdNow, setFdNow] = useState<number | "">(1800000); // 18 L parked in FD
  const [bookingPaid, setBookingPaid] = useState<number | "">(0);

  // Pace-to-target: horizon, base for the target (so it scales with what's
  // actually deployed), and booked realized P/L (from the Trading Style P&L upload)
  const [horizon, setHorizon] = useState<number | "">(12);
  const [paceMode, setPaceMode] = useState<"deployed" | "plan" | "custom">("deployed");
  const [customBase, setCustomBase] = useState<number | "">(10000000);

  // Technique-mix calculator: from the monthly target, back-solve the capital
  // each style needs, given its share of the target and its monthly return.
  const [techs, setTechs] = useState([
    { key: "scalp", name: "Scalping", sharePct: 6, retPct: 4 },
    { key: "intraday", name: "Intraday", sharePct: 14, retPct: 3 },
    { key: "btst", name: "BTST", sharePct: 11, retPct: 2.5 },
    { key: "swing", name: "Swing trading", sharePct: 31, retPct: 2 },
    { key: "long", name: "Long-term", sharePct: 38, retPct: 1.2 },
  ]);
  const setTech = (key: string, patch: Partial<{ sharePct: number; retPct: number }>) =>
    setTechs((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  // Live Indian portfolio, from holdings + mutual funds.
  const basketSymbols = useMemo(() => {
    const s = new Set<string>();
    strategies.forEach((st) => st.stocks.forEach((x) => s.add(x.symbol.toUpperCase())));
    return s;
  }, [strategies]);

  const portfolio = useMemo(() => {
    const stocks = holdings
      .filter((h) => currencyFor(h.exchange) === "INR" && h.qty > 0)
      .map((h) => {
        const invested = h.qty * h.avgPrice;
        const value = h.qty * h.currentPrice;
        const sym = h.symbol.toUpperCase();
        const bucket = sym.includes("ANANDRATHI") ? "Anand Rathi" : basketSymbols.has(sym) ? "Sectoral Rotation" : "Other";
        return { kind: "Stock", symbol: h.symbol, bucket, invested, value, pnl: value - invested };
      });
    const funds = mutualFunds.map((f) => ({
      kind: "MF",
      symbol: f.name,
      bucket: "Mutual Funds" as const,
      invested: f.currentInvestment,
      value: f.currentValue,
      pnl: f.currentValue - f.currentInvestment,
    }));
    const all = [...stocks, ...funds];
    const byVal = (b: string) => all.filter((x) => x.bucket === b).reduce((a, x) => a + x.value, 0);
    return {
      rows: all.sort((a, b) => b.value - a.value),
      value: all.reduce((a, x) => a + x.value, 0),
      invested: all.reduce((a, x) => a + x.invested, 0),
      anand: byVal("Anand Rathi"),
      rotation: byVal("Sectoral Rotation"),
      mf: byVal("Mutual Funds"),
      other: byVal("Other"),
    };
  }, [holdings, mutualFunds, basketSymbols]);

  const buckets: BucketInput[] = useMemo(
    () => [
      { key: "anand", name: "Anand Rathi Wealth (stock)", planned: Number(anandPlan) || 0, expReturnPct: Number(anandRet) || 0, deployed: portfolio.anand, cap: 10000000, kind: "equity" },
      { key: "rotation", name: "Sectoral Rotation", planned: Number(rotPlan) || 0, expReturnPct: Number(rotRet) || 0, deployed: portfolio.rotation, kind: "equity" },
      { key: "mf", name: "Mutual Funds", planned: Number(mfPlan) || 0, expReturnPct: Number(mfRet) || 0, deployed: portfolio.mf, kind: "equity" },
      { key: "flat", name: "Flat booking (20% down)", planned: Number(flatPlan) || 0, expReturnPct: Number(flatRet) || 0, deployed: Number(bookingPaid) || 0, kind: "property" },
      { key: "fd", name: "Fixed deposit (parked)", planned: Number(fdPlan) || 0, expReturnPct: Number(fdRet) || 0, deployed: Number(fdNow) || 0, kind: "fd" },
    ],
    [anandPlan, anandRet, rotPlan, rotRet, mfPlan, mfRet, flatPlan, flatRet, fdPlan, fdRet, bookingPaid, fdNow, portfolio]
  );

  const res = useMemo(() => evalStrategy(Number(total) || 0, Number(targetPct) || 0, buckets), [total, targetPct, buckets]);

  if (!mounted) return null;

  // Pace to the 20% target, given what's already booked. The target scales with
  // the chosen base — capital actually deployed, the full plan, or a custom sum.
  const bookedPL = pnl?.summary.totalRealized ?? 0;
  const months = Number(horizon) || 12;
  const paceBase =
    paceMode === "deployed" ? portfolio.value : paceMode === "plan" ? Number(total) || 0 : Number(customBase) || 0;
  const paceTargetGain = (paceBase * (Number(targetPct) || 0)) / 100;
  const monthlyPctComp = (Math.pow(1 + (Number(targetPct) || 0) / 100, 1 / 12) - 1) * 100;
  const monthlySimple = paceTargetGain / 12;
  const bookedPctOfTarget = paceTargetGain > 0 ? (bookedPL / paceTargetGain) * 100 : 0;
  const remainingGain = Math.max(0, paceTargetGain - bookedPL);
  const monthlyToCatch = months > 0 ? remainingGain / months : 0;

  // Technique calculator — driven by the monthly need from the pace card.
  const techTargetN = monthlyToCatch;
  const techRows = techs.map((t) => {
    const profit = (techTargetN * t.sharePct) / 100;
    const capital = t.retPct > 0 ? profit / (t.retPct / 100) : 0;
    return { ...t, profit, capital };
  });
  const techProfit = techRows.reduce((a, t) => a + t.profit, 0);
  const techCapital = techRows.reduce((a, t) => a + t.capital, 0);
  const techBlended = techCapital > 0 ? (techProfit / techCapital) * 100 : 0;
  const shareSum = techs.reduce((a, t) => a + t.sharePct, 0);

  const p1Sum = (Number(p1Anand) || 0) + (Number(p1Mf) || 0) + (Number(p1Sector) || 0);
  const p2Tranches = Number(p2Tranche) > 0 ? Math.ceil((Number(p2Total) || 0) / Number(p2Tranche)) : 0;
  const p2Months = p2Tranches * (Number(p2Every) || 0);
  const planTotal = p1Sum + (Number(p2Total) || 0);

  return (
    <div>
      <PageTitle title="Strategy" subtitle="Your staggered deployment plan and the 20% objective — tracked against your live portfolio" />

      {/* Objective */}
      <div className="card mb-6 border-accent/30 bg-accent/5">
        <div className="flex items-center gap-2 mb-2">
          <Goal className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium">Objective — {Number(targetPct)}% a year on capital deployed</h2>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">
          Deploying {inr(planTotal)} in two waves toward a {inr(res.targetGain)}/yr target. Your allocation blends to an expected{" "}
          <span className={`font-mono ${pnlClass(res.gapPct)}`}>{fmtPct(res.blendedReturnPct)}</span>
          {res.meetsTarget ? " — clears the goal." : ` — ${fmtPct(Math.abs(res.gapPct)).replace("+", "")} short.`}{" "}
          FD aside, your market + property buckets need to average{" "}
          <span className="font-mono text-zinc-100">{fmtPct(res.nonFdHurdlePct)}</span> to hit {Number(targetPct)}%.
        </p>
      </div>

      {/* Pace to target — booked so far + required monthly aggressiveness */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Gauge className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium">Monthly pace to hit {Number(targetPct)}%</h2>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
            over
            <span className="w-14"><NumInput value={horizon} onChange={setHorizon} /></span>
            months
          </span>
        </div>

        {/* Base for the target — so it scales with what's actually invested */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] text-muted">Target based on:</span>
          <div className="inline-flex rounded-lg bg-surface p-0.5">
            {([
              ["deployed", `Deployed now (${inr(portfolio.value)})`],
              ["plan", `Plan total (${inr(Number(total))})`],
              ["custom", "Custom"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setPaceMode(m)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${paceMode === m ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {paceMode === "custom" && <span className="w-32"><NumInput value={customBase} onChange={setCustomBase} /></span>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Booked so far" value={inr(bookedPL)} pnl={bookedPL} sub={pnl ? `${bookedPctOfTarget.toFixed(0)}% of target · from P&L` : "upload P&L on Trading Style"} />
          <StatCard label="Target / year" value={inr(paceTargetGain)} sub={`${Number(targetPct)}% on ${inr(paceBase)}`} />
          <StatCard label="Need / month" value={inr(monthlyToCatch)} sub={`${inr(remainingGain)} left ÷ ${months} mo`} />
          <StatCard label="Monthly return" value={fmtPct(monthlyPctComp)} pnl={monthlyPctComp} sub={`compounded, to reach ${Number(targetPct)}%/yr`} />
        </div>
        <p className="text-sm text-zinc-300 mt-3 leading-relaxed">
          To earn {Number(targetPct)}% ({inr(paceTargetGain)}) a year on{" "}
          <span className="text-zinc-100">{inr(paceBase)}</span>
          {paceMode === "deployed" ? " actually deployed" : paceMode === "plan" ? " (full plan)" : ""}, you need about{" "}
          <span className="font-mono text-zinc-100">{inr(monthlySimple)}</span> a month —{" "}
          <span className="font-mono text-zinc-100">{fmtPct(monthlyPctComp)}</span> per month on that capital. You&apos;ve already
          booked <span className={`font-mono ${pnlClass(bookedPL)}`}>{inr(bookedPL)}</span>
          {pnl ? ` (${bookedPctOfTarget.toFixed(0)}% of the target)` : ""}, leaving ~{inr(remainingGain)} — about{" "}
          <span className="font-mono text-zinc-100">{inr(monthlyToCatch)}</span> a month over the next {months}. Keep it on
          &ldquo;Deployed now&rdquo; for a target you can actually justify today; switch to &ldquo;Plan total&rdquo; to see where it
          heads once the full corpus is invested.
        </p>
      </div>

      {/* Technique-mix calculator — driven by Need/month */}
      <div className="card mb-6 p-0 overflow-hidden">
        <div className="px-4 pt-4 flex items-center gap-2 flex-wrap">
          <Calculator className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-medium">Technique mix — capital needed to earn the monthly target</h2>
          <span className="ml-auto text-[11px] text-muted">
            target = <span className="font-mono text-zinc-200">{inr(techTargetN)}/mo</span> (Need/month)
          </span>
        </div>
        <p className="px-4 pt-1 text-[11px] text-zinc-500">
          Give each style a share of the monthly target and a realistic monthly return; the calculator back-solves the capital it
          needs. Change the target above (base, return % or horizon) and every row updates. Returns are assumptions — anchor them to
          your realised numbers on the Trading Style &amp; BTST pages.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] mt-2">
            <thead>
              <tr>
                <th className="th">Technique</th>
                <th className="th text-right">Share of target</th>
                <th className="th text-right">Monthly return</th>
                <th className="th text-right">Monthly profit</th>
                <th className="th text-right">Capital required</th>
              </tr>
            </thead>
            <tbody>
              {techRows.map((t) => (
                <tr key={t.key}>
                  <td className="td text-sm">{t.name}</td>
                  <td className="td text-right">
                    <div className="w-16 ml-auto"><NumInput value={t.sharePct} onChange={(v) => setTech(t.key, { sharePct: Number(v) || 0 })} /></div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">% of target</div>
                  </td>
                  <td className="td text-right">
                    <div className="w-16 ml-auto"><NumInput value={t.retPct} onChange={(v) => setTech(t.key, { retPct: Number(v) || 0 })} /></div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">%/mo</div>
                  </td>
                  <td className="td text-right font-mono text-xs text-gain">{inr(t.profit)}</td>
                  <td className="td text-right font-mono text-sm font-medium">{inr(t.capital)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="td text-xs font-medium">Total · blended {fmtPct(techBlended)}/mo</td>
                <td className={`td text-right font-mono text-xs font-medium ${Math.abs(shareSum - 100) > 0.5 ? "text-amber-400" : "text-muted"}`}>{shareSum.toFixed(0)}%</td>
                <td className="td"></td>
                <td className="td text-right font-mono text-xs font-semibold text-gain">{inr(techProfit)}</td>
                <td className="td text-right font-mono text-sm font-semibold">{inr(techCapital)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-4 py-3 text-sm border-t border-border text-zinc-300">
          To earn <span className="font-mono text-zinc-100">{inr(techTargetN)}</span>/month you&apos;d need about{" "}
          <span className="font-mono text-zinc-100">{inr(techCapital)}</span> of capital deployed across these techniques
          {portfolio.value > 0 && (
            <> — you have <span className="font-mono">{inr(portfolio.value)}</span> in the market{" "}
            {techCapital <= portfolio.value ? <span className="text-gain">(enough)</span> : <span className="text-amber-400">({inr(techCapital - portfolio.value)} short)</span>}</>
          )}
          .
          {Math.abs(shareSum - 100) > 0.5 && <span className="text-amber-400"> Shares add to {shareSum.toFixed(0)}%, not 100% — adjust so the mix covers the whole target.</span>}
        </div>
      </div>

      {/* Deployment plan — the two staggered waves */}
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold tracking-tight">Deployment plan</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Phase 1 */}
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium">Phase 1 · ready now → by 24 Aug</h3>
            <span className="text-sm font-mono font-semibold">{inr(p1Sum)}</span>
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            Investable straight away — stagger it across a few tranches before 24 Aug, split between Anand Rathi, mutual funds and sector stocks.
          </p>
          <div className="space-y-2.5">
            <div className="grid grid-cols-[1fr_120px] items-center gap-2">
              <span className="text-xs text-zinc-300">Anand Rathi stock</span>
              <NumInput value={p1Anand} onChange={setP1Anand} />
            </div>
            <div className="grid grid-cols-[1fr_120px] items-center gap-2">
              <span className="text-xs text-zinc-300">Mutual funds</span>
              <NumInput value={p1Mf} onChange={setP1Mf} />
            </div>
            <div className="grid grid-cols-[1fr_120px] items-center gap-2">
              <span className="text-xs text-zinc-300">Sector stocks</span>
              <NumInput value={p1Sector} onChange={setP1Sector} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px]">
            {[
              ["Anand Rathi", Number(p1Anand) || 0],
              ["MF", Number(p1Mf) || 0],
              ["Sector", Number(p1Sector) || 0],
            ].map(([label, v]) => (
              <span key={label as string} className="flex-1">
                <span className="text-muted">{label}</span>{" "}
                <span className="font-mono">{p1Sum > 0 ? (((v as number) / p1Sum) * 100).toFixed(0) : 0}%</span>
              </span>
            ))}
          </div>
          <div className="mt-2 h-2 rounded-full bg-surface overflow-hidden flex">
            <div className="h-full bg-accent" style={{ width: `${p1Sum ? ((Number(p1Anand) || 0) / p1Sum) * 100 : 0}%` }} />
            <div className="h-full bg-blue-500" style={{ width: `${p1Sum ? ((Number(p1Mf) || 0) / p1Sum) * 100 : 0}%` }} />
            <div className="h-full bg-gain" style={{ width: `${p1Sum ? ((Number(p1Sector) || 0) / p1Sum) * 100 : 0}%` }} />
          </div>
        </div>

        {/* Phase 2 */}
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium">Phase 2 · from 24 Aug, staggered</h3>
            <span className="text-sm font-mono font-semibold">{inr(Number(p2Total) || 0)}</span>
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            The main corpus — fed into the market in tranches (never all at once), across Anand Rathi, sector stocks, the flat booking and FD.
          </p>
          <div className="space-y-2.5">
            <Field label="Total to deploy (₹)"><NumInput value={p2Total} onChange={setP2Total} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tranche size (₹)"><NumInput value={p2Tranche} onChange={setP2Tranche} /></Field>
              <Field label="Every (months)"><NumInput value={p2Every} onChange={setP2Every} /></Field>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 mt-3">
            ≈ <span className="font-mono text-zinc-200">{p2Tranches}</span> tranches of {inr(Number(p2Tranche) || 0)} over ~
            <span className="font-mono text-zinc-200">{p2Months}</span> months, fully deployed around{" "}
            <span className="text-zinc-200">{monthsFrom("2026-08-24", p2Months)}</span>.
          </p>
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Plan total" value={inr(planTotal)} sub={`${inr(p1Sum)} now + ${inr(Number(p2Total) || 0)} later`} />
        <StatCard label="Target / year" value={inr(res.targetGain)} sub={`${Number(targetPct)}% objective`} />
        <StatCard label="Expected / year" value={inr(res.blendedGain)} pnl={res.gapPct} sub={`blended ${fmtPct(res.blendedReturnPct)}`} />
        <StatCard label="In market now" value={inr(portfolio.value)} sub={`+ ${inr(Number(fdNow) || 0)} in FD`} />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Allocation plan */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 pt-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-medium">Target allocation — where it all lands</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] mt-2">
              <thead>
                <tr>
                  <th className="th">Bucket</th>
                  <th className="th text-right">Planned</th>
                  <th className="th text-right">Share</th>
                  <th className="th text-right">Exp. return</th>
                  <th className="th text-right">Exp. gain/yr</th>
                  <th className="th text-right">Deployed</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => {
                  const setPlan =
                    r.key === "anand" ? setAnandPlan : r.key === "rotation" ? setRotPlan : r.key === "mf" ? setMfPlan : r.key === "flat" ? setFlatPlan : setFdPlan;
                  const setRet =
                    r.key === "anand" ? setAnandRet : r.key === "rotation" ? setRotRet : r.key === "mf" ? setMfRet : r.key === "flat" ? setFlatRet : setFdRet;
                  const planVal = r.key === "anand" ? anandPlan : r.key === "rotation" ? rotPlan : r.key === "mf" ? mfPlan : r.key === "flat" ? flatPlan : fdPlan;
                  const retVal = r.key === "anand" ? anandRet : r.key === "rotation" ? rotRet : r.key === "mf" ? mfRet : r.key === "flat" ? flatRet : fdRet;
                  return (
                    <tr key={r.key}>
                      <td className="td">
                        <div className="text-sm">{r.name}</div>
                        {r.cap != null && (
                          <div className={`text-[10px] ${r.overCap ? "text-loss" : "text-zinc-500"}`}>max {inr(r.cap)}{r.overCap ? " — over cap" : ""}</div>
                        )}
                        <div className="mt-1 h-1 w-28 rounded-full bg-surface overflow-hidden">
                          <div className="h-full bg-accent/60" style={{ width: `${Math.min(100, r.fillPct)}%` }} title={`${r.fillPct.toFixed(0)}% deployed`} />
                        </div>
                      </td>
                      <td className="td text-right">
                        <div className="w-28 ml-auto"><NumInput value={planVal} onChange={setPlan} /></div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{inr(r.planned)}</div>
                      </td>
                      <td className="td text-right font-mono text-xs text-muted">{r.sharePct.toFixed(0)}%</td>
                      <td className="td text-right">
                        <div className="w-16 ml-auto"><NumInput value={retVal} onChange={setRet} /></div>
                      </td>
                      <td className="td text-right font-mono text-xs text-gain">{inr(r.expGain)}</td>
                      <td className="td text-right font-mono text-xs">
                        {inr(r.deployed)}
                        <span className="block text-[10px] text-zinc-500">{r.fillPct.toFixed(0)}% filled</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="td text-xs font-medium">Total</td>
                  <td className={`td text-right font-mono text-xs font-medium ${res.overAllocated ? "text-loss" : ""}`}>{inr(res.plannedSum)}</td>
                  <td className="td text-right font-mono text-xs text-muted">{Number(total) > 0 ? ((res.plannedSum / Number(total)) * 100).toFixed(0) : 0}%</td>
                  <td className="td"></td>
                  <td className="td text-right font-mono text-xs text-gain font-medium">{inr(res.blendedGain)}</td>
                  <td className="td text-right font-mono text-xs">{inr(res.deployedTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {res.overAllocated && <p className="px-4 pb-3 text-[11px] text-loss">Buckets exceed the plan total — trim an allocation.</p>}
        </div>

        {/* Objective + status inputs */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-medium mb-3">Objective</h3>
            <div className="space-y-3">
              <Field label="Total to deploy (₹)"><NumInput value={total} onChange={setTotal} /></Field>
              <Field label="Target return (%/yr)"><NumInput value={targetPct} onChange={setTargetPct} /></Field>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-medium">Cash status</h3>
            </div>
            <div className="space-y-3">
              <Field label="In FD now (₹)"><NumInput value={fdNow} onChange={setFdNow} /></Field>
              <Field label="Flat booking paid (₹)"><NumInput value={bookingPaid} onChange={setBookingPaid} /></Field>
            </div>
            <div className="mt-3 rounded-lg bg-surface p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted">In the market (live)</span><span className="font-mono">{inr(portfolio.value)}</span></div>
              <div className="flex justify-between"><span className="text-muted">In FD</span><span className="font-mono">{inr(Number(fdNow) || 0)}</span></div>
              <div className="flex justify-between border-t border-border/60 pt-1">
                <span className="text-muted">Deployed of plan</span>
                <span className="font-mono">{inr(res.deployedTotal)} / {inr(res.plannedSum)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-accent/20 bg-accent/5 flex gap-2 mt-6">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p className="text-[11px] text-zinc-400">
          Phase 1 is the ₹25 L you can invest now (staggered by 24 Aug); Phase 2 is the ₹2 Cr deployed in tranches after that.
          Holdings auto-tag into buckets — <span className="text-accent">Anand Rathi</span>, <span className="text-gain">Sectoral Rotation</span>,{" "}
          <span className="text-blue-400">Mutual Funds</span> — and fill the &ldquo;Deployed&rdquo; column; anything else shows as{" "}
          <span className="text-zinc-300">Other</span> (legacy positions to rebalance). Returns are your assumptions. Planning tool, not investment advice.
        </p>
      </div>
    </div>
  );
}

// Add whole months to a YYYY-MM-DD date and return "Mon YYYY".
function monthsFrom(date: string, months: number): string {
  const d = new Date(date + "T00:00:00");
  d.setMonth(d.getMonth() + Math.round(months));
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
