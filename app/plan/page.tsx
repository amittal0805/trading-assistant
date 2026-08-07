"use client";

import { useEffect, useMemo, useState } from "react";
import { projectCorpus } from "@/lib/projection";
import { fmtPct } from "@/lib/format";
import { PageTitle, StatCard, Field, NumInput } from "@/components/ui";
import { Target, Info } from "lucide-react";

// Compact INR formatting in lakh/crore, which is how the numbers here read.
function inr(v: number) {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

const SCENARIOS = [
  { key: "cons", label: "Conservative", ret: 12 },
  { key: "base", label: "Base", ret: 18 },
  { key: "aggr", label: "Aggressive", ret: 24 },
] as const;

export default function Plan() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [corpus, setCorpus] = useState<number | "">(25000000); // 2.5 Cr
  const [initialDeploy, setInitialDeploy] = useState<number | "">(10000000); // 1 Cr
  const [trancheSize, setTrancheSize] = useState<number | "">(2500000); // 25 L
  const [trancheEvery, setTrancheEvery] = useState<number | "">(6); // months
  const [years, setYears] = useState<number | "">(5);
  const [ret, setRet] = useState<number | "">(18);
  const [reserveRet, setReserveRet] = useState<number | "">(6);
  const [scenario, setScenario] = useState<string>("base");

  const setScen = (k: string, r: number) => {
    setScenario(k);
    setRet(r);
  };

  const res = useMemo(() => {
    if (!corpus || !years || ret === "") return null;
    return projectCorpus({
      corpus: Number(corpus),
      initialDeploy: Number(initialDeploy) || 0,
      trancheSize: Number(trancheSize) || 0,
      trancheEveryMonths: Number(trancheEvery) || 6,
      years: Number(years),
      annualReturnPct: Number(ret),
      reserveReturnPct: Number(reserveRet) || 0,
    });
  }, [corpus, initialDeploy, trancheSize, trancheEvery, years, ret, reserveRet]);

  if (!mounted) return null;
  const maxTotal = res ? Math.max(...res.rows.map((r) => r.total), Number(corpus)) : 1;

  return (
    <div>
      <PageTitle title="5-Year Plan" subtitle="Project a staggered corpus at your active-trading pace — an estimate, not a promise" />

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="card h-fit">
          <h2 className="text-sm font-medium mb-4">Your plan</h2>
          <div className="space-y-3">
            <Field label="Total corpus (₹)"><NumInput value={corpus} onChange={setCorpus} /></Field>
            <Field label="Deploy now (₹)"><NumInput value={initialDeploy} onChange={setInitialDeploy} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Then add (₹)"><NumInput value={trancheSize} onChange={setTrancheSize} /></Field>
              <Field label="every (months)"><NumInput value={trancheEvery} onChange={setTrancheEvery} /></Field>
            </div>
            <Field label="Years"><NumInput value={years} onChange={setYears} /></Field>

            <div>
              <label className="label">Expected annual return (active capital)</label>
              <div className="inline-flex rounded-lg bg-surface p-0.5 w-full mb-2">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setScen(s.key, s.ret)}
                    className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      scenario === s.key ? "bg-accent text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <NumInput value={ret} onChange={(v) => { setRet(v); setScenario("custom"); }} />
            </div>
            <Field label="Idle reserve return % (liquid fund)"><NumInput value={reserveRet} onChange={setReserveRet} /></Field>
          </div>
        </div>

        <div className="space-y-4">
          {res && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={`Corpus in ${Number(years)}y`} value={inr(res.endTotal)} sub={`from ${inr(Number(corpus))}`} />
                <StatCard label="Total gain" value={inr(res.totalGain)} pnl={res.totalGain} sub="profit over the period" />
                <StatCard label="Return on deployed" value={fmtPct(res.deployedXirr)} pnl={res.deployedXirr} sub="XIRR, money-weighted" />
                <StatCard label="On full corpus" value={fmtPct(res.corpusCagr)} pnl={res.corpusCagr} sub="CAGR incl. idle drag" />
              </div>

              <div className="card p-0 overflow-x-auto">
                <div className="px-4 pt-4">
                  <h2 className="text-sm font-medium">Year by year</h2>
                  <p className="text-[11px] text-zinc-500 mt-1 mb-2">
                    Deployed = capital moved into the market; Reserve = idle corpus waiting to be staggered in.
                  </p>
                </div>
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr>
                      <th className="th">Year</th>
                      <th className="th text-right">Deployed</th>
                      <th className="th text-right">Market value</th>
                      <th className="th text-right">Reserve</th>
                      <th className="th text-right">Total corpus</th>
                      <th className="th text-right">Gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.rows.map((r) => (
                      <tr key={r.year}>
                        <td className="td font-mono text-xs">Y{r.year}</td>
                        <td className="td text-right font-mono text-xs text-muted">{inr(r.deployed)}</td>
                        <td className="td text-right font-mono text-xs">{inr(r.marketValue)}</td>
                        <td className="td text-right font-mono text-xs text-muted">{inr(r.reserveValue)}</td>
                        <td className="td text-right font-mono text-sm font-medium">{inr(r.total)}</td>
                        <td className={`td text-right font-mono text-xs ${r.gain >= 0 ? "text-gain" : "text-loss"}`}>{inr(r.gain)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h2 className="text-sm font-medium mb-3">Corpus growth</h2>
                <div className="space-y-2">
                  {res.rows.map((r) => (
                    <div key={r.year} className="flex items-center gap-3">
                      <span className="text-xs text-muted w-8 shrink-0">Y{r.year}</span>
                      <div className="flex-1 h-4 rounded bg-surface overflow-hidden flex">
                        <div className="h-full bg-accent" style={{ width: `${(r.marketValue / maxTotal) * 100}%` }} title="Market value" />
                        <div className="h-full bg-zinc-600" style={{ width: `${(r.reserveValue / maxTotal) * 100}%` }} title="Idle reserve" />
                      </div>
                      <span className="text-xs font-mono w-20 text-right">{inr(r.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 text-[10px] text-muted mt-2">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent inline-block" /> deployed & compounding</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-600 inline-block" /> idle reserve</span>
                </div>
              </div>

              <div className="card border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-medium">The staggering trade-off</h3>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Your active capital is assumed to compound at <span className="text-zinc-100">{Number(ret)}%</span>, and the
                  money-weighted return on what you actually deploy comes to{" "}
                  <span className={`font-mono ${res.deployedXirr >= 0 ? "text-gain" : "text-loss"}`}>{fmtPct(res.deployedXirr)}</span>.
                  But because you feed capital in gradually, a chunk sits idle earning only{" "}
                  <span className="text-zinc-100">{Number(reserveRet)}%</span> — so the return on your{" "}
                  <span className="text-zinc-100">full {inr(Number(corpus))}</span> is lower, about{" "}
                  <span className={`font-mono ${res.corpusCagr >= 0 ? "text-gain" : "text-loss"}`}>{fmtPct(res.corpusCagr)}</span> a
                  year. Staggering reduces risk (you're not all-in at one price) but costs some return — the faster you deploy in a
                  rising market, the closer the two numbers get.
                </p>
              </div>

              <p className="text-[11px] text-zinc-500">
                This is a compounding model on an <span className="text-zinc-400">assumed</span> return, not a forecast. Real active
                trading is lumpy — good months and drawdowns — and past results (your BTST, swing and holdings) don&apos;t guarantee
                future ones. Use the Conservative case for planning and treat anything above your own realised track record with
                caution. Not investment advice.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
