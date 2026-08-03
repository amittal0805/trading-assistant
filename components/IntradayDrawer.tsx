"use client";

import { useEffect, useState, useCallback } from "react";
import { analyzeIntraday, IntradayRead } from "@/lib/intraday";
import { analyzeCandles, patternsSpotted, CandleInfo } from "@/lib/candles";
import type { Bar } from "@/app/api/intraday/route";
import { fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { X, RefreshCw, TrendingUp, TrendingDown, Minus, Flame } from "lucide-react";

const timeIST = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

export default function IntradayDrawer({
  symbol,
  name,
  onClose,
}: {
  symbol: string | null;
  name?: string;
  onClose: () => void;
}) {
  const [read, setRead] = useState<IntradayRead | null>(null);
  const [candles, setCandles] = useState<CandleInfo[]>([]);
  const [selCandle, setSelCandle] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (sym: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/intraday?symbol=${encodeURIComponent(sym)}.NS`, { cache: "no-store" });
      const j = (await r.json()) as { bars?: Bar[]; prevClose?: number | null; error?: string };
      if (!r.ok || j.error) {
        setError(j.error || `Request failed (${r.status})`);
        setRead(null);
        return;
      }
      const a = analyzeIntraday(sym, j.bars ?? [], j.prevClose ?? null);
      if (!a) {
        setError("Not enough intraday data yet (market may be closed or the stock illiquid).");
        setRead(null);
        setCandles([]);
      } else {
        setRead(a);
        setCandles(analyzeCandles(j.bars ?? []));
        setSelCandle(null);
      }
    } catch {
      setError("Network error loading intraday data.");
      setRead(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (symbol) {
      setRead(null);
      load(symbol);
    }
  }, [symbol, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!symbol) return null;

  const TrendIcon = read?.trend === "up" ? TrendingUp : read?.trend === "down" ? TrendingDown : Minus;
  const trendCls = read?.trend === "up" ? "text-gain" : read?.trend === "down" ? "text-loss" : "text-amber-400";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-bg border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold tracking-tight">{name || symbol}</h2>
            <p className="text-[11px] text-muted">{symbol} · 15-minute intraday read</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost py-1.5" onClick={() => load(symbol)} disabled={loading} title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button className="text-zinc-500 hover:text-zinc-200 p-1" onClick={onClose} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {error ? (
            <div className="card border-loss/30 bg-loss/5 text-sm text-zinc-300">{error}</div>
          ) : loading && !read ? (
            <div className="text-sm text-zinc-500 text-center py-10">Reading the tape…</div>
          ) : read ? (
            <>
              {/* Snapshot */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Stat label="Now" value={fmtNum(read.last, 2)} sub={fmtPct(read.dayChangePct)} tone={read.dayChangePct} />
                <Stat label="Day range" value={`${fmtNum(read.low, 0)}–${fmtNum(read.high, 0)}`} />
                <Stat label="VWAP" value={fmtNum(read.vwap, 2)} sub={`${fmtPct(read.fromVwapPct)} vs price`} tone={read.fromVwapPct} />
                <div className="card">
                  <div className="text-xs text-muted">Trend</div>
                  <div className={`text-lg font-semibold mt-1 flex items-center gap-1.5 ${trendCls}`}>
                    <TrendIcon className="w-4 h-4" />
                    <span className="capitalize">{read.trend}</span>
                  </div>
                </div>
              </div>

              {/* Narrative */}
              <div className="card mb-5">
                <h3 className="text-sm font-medium mb-2">The read</h3>
                <div className="space-y-2">
                  {read.summary.map((p, i) => (
                    <p key={i} className={`text-sm leading-relaxed ${i === read.summary.length - 1 ? "text-zinc-100 font-medium" : "text-zinc-300"}`}>
                      {p}
                    </p>
                  ))}
                </div>
              </div>

              {/* Candles: learn the patterns */}
              {candles.length > 0 && (
                <div className="card mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Flame className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-medium">The candles — tap one to learn it</h3>
                  </div>
                  {(() => {
                    const hi = Math.max(...candles.map((c) => c.h));
                    const lo = Math.min(...candles.map((c) => c.l));
                    const span = Math.max(hi - lo, 1e-9);
                    const H = 120; // px
                    return (
                      <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: H + 8 }}>
                        {candles.map((c, i) => {
                          const top = ((hi - c.h) / span) * H;
                          const wickH = (c.range / span) * H;
                          const bodyTop = ((hi - Math.max(c.o, c.c)) / span) * H;
                          const bodyH = Math.max((Math.abs(c.c - c.o) / span) * H, 2);
                          const color = c.bull ? "bg-gain" : "bg-loss";
                          const hasPattern = c.patterns.length > 0;
                          return (
                            <button
                              key={i}
                              className={`relative shrink-0 w-4 group ${selCandle === i ? "outline outline-1 outline-accent rounded-sm" : ""}`}
                              style={{ height: H }}
                              onClick={() => setSelCandle(selCandle === i ? null : i)}
                              title={`${timeIST(c.t)} O ${fmtNum(c.o, 1)} H ${fmtNum(c.h, 1)} L ${fmtNum(c.l, 1)} C ${fmtNum(c.c, 1)}`}
                            >
                              {/* wick */}
                              <span
                                className={`absolute left-1/2 -translate-x-1/2 w-[2px] ${c.bull ? "bg-gain/60" : "bg-loss/60"}`}
                                style={{ top, height: Math.max(wickH, 2) }}
                              />
                              {/* body */}
                              <span
                                className={`absolute left-1/2 -translate-x-1/2 w-3 rounded-[2px] ${color}`}
                                style={{ top: bodyTop, height: bodyH }}
                              />
                              {hasPattern && (
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <div className="flex justify-between text-[10px] text-zinc-600 font-mono mt-1">
                    <span>{timeIST(candles[0].t)}</span>
                    <span className="text-amber-400">• = pattern</span>
                    <span>{timeIST(candles[candles.length - 1].t)}</span>
                  </div>

                  {selCandle !== null && candles[selCandle] && (
                    <div className="mt-3 p-3 rounded-lg bg-surface/60 border border-border">
                      {(() => {
                        const c = candles[selCandle]!;
                        return (
                          <>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
                              <span className="text-zinc-200 font-medium">{timeIST(c.t)}</span>
                              <span>O {fmtNum(c.o, 2)}</span>
                              <span>H {fmtNum(c.h, 2)}</span>
                              <span>L {fmtNum(c.l, 2)}</span>
                              <span className={c.bull ? "text-gain" : "text-loss"}>C {fmtNum(c.c, 2)}</span>
                            </div>
                            <p className="text-[11px] text-muted mt-1.5">
                              Body {c.bodyPct.toFixed(0)}% of the range · upper wick {c.upperPct.toFixed(0)}% · lower wick{" "}
                              {c.lowerPct.toFixed(0)}%.{" "}
                              {c.bodyPct >= 60
                                ? c.bull
                                  ? "A conviction candle — buyers dominated."
                                  : "A conviction candle — sellers dominated."
                                : c.bodyPct <= 15
                                ? "Barely any body — pure indecision."
                                : "A contested candle — neither side fully in control."}
                            </p>
                            {c.patterns.length > 0 ? (
                              <div className="mt-2 space-y-1.5">
                                {c.patterns.map((p, j) => (
                                  <div key={j} className="text-xs">
                                    <span
                                      className={`font-medium ${
                                        p.bias === "bullish" ? "text-gain" : p.bias === "bearish" ? "text-loss" : "text-amber-400"
                                      }`}
                                    >
                                      {p.name}
                                    </span>{" "}
                                    <span className="text-zinc-400">— {p.note}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-zinc-500 mt-2">No textbook pattern on this candle.</p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {(() => {
                    const spotted = patternsSpotted(candles);
                    if (spotted.length === 0)
                      return <p className="text-[11px] text-zinc-500 mt-3">No textbook patterns in this session yet.</p>;
                    return (
                      <div className="mt-3">
                        <h4 className="text-xs font-medium text-zinc-300 mb-1.5">Patterns spotted this session</h4>
                        <div className="space-y-1">
                          {spotted.slice(0, 6).map((s, i) => (
                            <div key={i} className="text-xs flex gap-2">
                              <span className="font-mono text-zinc-500 shrink-0">{timeIST(s.time)}</span>
                              <span
                                className={`font-medium shrink-0 ${
                                  s.hit.bias === "bullish" ? "text-gain" : s.hit.bias === "bearish" ? "text-loss" : "text-amber-400"
                                }`}
                              >
                                {s.hit.name}
                              </span>
                              <span className="text-zinc-500 truncate">{s.hit.note}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Interval-by-interval */}
              <div className="card p-0 overflow-hidden">
                <h3 className="text-sm font-medium px-4 pt-4 pb-2">Every 15 minutes</h3>
                <div className="max-h-[40vh] overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-bg">
                      <tr>
                        <th className="th">Time</th>
                        <th className="th text-right">Close</th>
                        <th className="th text-right">Move</th>
                        <th className="th">What happened</th>
                      </tr>
                    </thead>
                    <tbody>
                      {read.intervals.map((iv, i) => (
                        <tr key={i}>
                          <td className="td font-mono text-xs">{iv.label}</td>
                          <td className="td text-right font-mono text-xs">{fmtNum(iv.close, 2)}</td>
                          <td className={`td text-right font-mono text-xs ${pnlClass(iv.changePct)}`}>{fmtPct(iv.changePct)}</td>
                          <td className="td text-xs text-zinc-400 capitalize">
                            {iv.note}
                            {iv.volSpike && <span className="ml-1 text-accent">•</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 mt-4">
                Based on the latest session&apos;s 15-minute candles from Yahoo. Descriptive analysis, not a
                recommendation. Data may lag ~15 minutes and is unavailable when markets are closed.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold mt-1 font-mono">{value}</div>
      {sub && <div className={`text-[11px] font-mono mt-0.5 ${tone !== undefined ? pnlClass(tone) : "text-zinc-500"}`}>{sub}</div>}
    </div>
  );
}
