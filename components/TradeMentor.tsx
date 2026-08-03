"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { yahooSymbol } from "@/lib/quotes";
import { mentor, MentorRead } from "@/lib/mentor";
import type { Indicator } from "@/app/api/indicators/route";
import { fmtMoney, fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { GraduationCap, CheckCircle2, AlertTriangle, Eye, Save } from "lucide-react";

const EMOTIONS = ["Calm", "Confident", "FOMO", "Fear", "Greed", "Revenge", "Impatient", "Disciplined"];

interface Owned {
  symbol: string;
  qty: number;
  avg: number;
  ltp: number;
  prevClose?: number | null;
  value: number;
  exchange: string;
}

export default function TradeMentor() {
  const { holdings, positions, strategies, addJournal } = useStore();
  const [symbol, setSymbol] = useState("");
  const [ind, setInd] = useState<Indicator | null>(null);
  const [loadingInd, setLoadingInd] = useState(false);
  const [note, setNote] = useState("");
  const [mistakes, setMistakes] = useState("");
  const [emotion, setEmotion] = useState("Calm");
  const [saved, setSaved] = useState(false);

  // Net owned per symbol from holdings + open positions.
  const owned = useMemo(() => {
    const m = new Map<string, Owned>();
    const add = (sym: string, qty: number, price: number, ltp: number, prev: number | null | undefined, exch: string) => {
      const o = m.get(sym) ?? { symbol: sym, qty: 0, avg: 0, ltp, prevClose: prev, value: 0, exchange: exch };
      const cost = o.avg * o.qty + price * qty;
      o.qty += qty;
      o.avg = o.qty !== 0 ? cost / o.qty : 0;
      o.ltp = ltp;
      o.prevClose = prev ?? o.prevClose;
      m.set(sym, o);
    };
    holdings.forEach((h) => add(h.symbol, h.qty, h.avgPrice, h.currentPrice, h.prevClose, h.exchange));
    positions.filter((p) => p.status === "open").forEach((p) => add(p.symbol, p.qty, p.entryPrice, p.currentPrice, p.prevClose, p.exchange));
    const list = Array.from(m.values()).filter((o) => o.qty !== 0);
    list.forEach((o) => (o.value = o.qty * o.ltp));
    list.sort((a, b) => b.value - a.value);
    return list;
  }, [holdings, positions]);

  const portfolioValue = useMemo(() => owned.reduce((a, o) => a + o.value, 0), [owned]);
  const sectorOf = useMemo(() => {
    const m: Record<string, string> = {};
    strategies.forEach((st) => st.stocks.forEach((x) => (m[x.symbol] = st.name)));
    return m;
  }, [strategies]);

  const sel = owned.find((o) => o.symbol === symbol) ?? null;

  useEffect(() => {
    setInd(null);
    setSaved(false);
    if (!sel) return;
    let cancel = false;
    setLoadingInd(true);
    fetch(`/api/indicators?symbols=${encodeURIComponent(yahooSymbol(sel.symbol, sel.exchange as never))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const key = yahooSymbol(sel.symbol, sel.exchange as never);
        setInd(j?.data?.[key] ?? null);
      })
      .catch(() => {})
      .finally(() => !cancel && setLoadingInd(false));
    return () => {
      cancel = true;
    };
  }, [sel]);

  const read: MentorRead | null = useMemo(() => {
    if (!sel) return null;
    return mentor({
      symbol: sel.symbol,
      qty: sel.qty,
      avg: sel.avg,
      ltp: ind?.price ?? sel.ltp,
      prevClose: sel.prevClose,
      sma50: ind?.sma50,
      sma200: ind?.sma200,
      rsi: ind?.rsi,
      high52: ind?.high52,
      low52: ind?.low52,
      sector: sectorOf[sel.symbol] ?? null,
      positionValue: sel.value,
      portfolioValue,
    });
  }, [sel, ind, sectorOf, portfolioValue]);

  const save = () => {
    if (!sel || !read) return;
    const analysis = [
      read.summary,
      read.rights.length ? `Right: ${read.rights.join(" ")}` : "",
      read.wrongs.length ? `Wrong: ${read.wrongs.join(" ")}` : "",
      read.watch.length ? `Watch: ${read.watch.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    addJournal({
      date: new Date().toISOString().slice(0, 10),
      symbol: sel.symbol,
      reason: sectorOf[sel.symbol] ? `Review · ${sectorOf[sel.symbol]}` : "Review",
      emotion,
      tradeType: "Swing",
      entry: sel.avg,
      exit: read.pl / sel.qty + sel.avg, // = ltp
      qty: sel.qty,
      outcome: read.pl,
      mistakes,
      learning: note,
      analysis,
    });
    setSaved(true);
    setNote("");
    setMistakes("");
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold tracking-tight">Trade Mentor</h2>
        <span className="text-xs text-muted">pick a stock you hold — get a candid read, then log your learning</span>
      </div>

      {owned.length === 0 ? (
        <div className="card text-sm text-zinc-500">
          No holdings or open positions found. Import them (Holdings / Positions) to use the mentor.
        </div>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          <div className="card h-fit">
            <label className="label">Stock from your portfolio</label>
            <select className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              <option value="">— select a stock —</option>
              {owned.map((o) => (
                <option key={o.symbol} value={o.symbol}>
                  {o.symbol} · {o.qty} @ {fmtNum(o.avg, 2)}
                </option>
              ))}
            </select>

            {sel && (
              <div className="mt-4 space-y-1.5 text-sm">
                <Row k="Quantity" v={fmtNum(sel.qty, 0)} />
                <Row k="Avg cost" v={fmtMoney(sel.avg)} />
                <Row k="Last price" v={fmtMoney(ind?.price ?? sel.ltp)} />
                <Row k="P/L" v={`${fmtMoney((( ind?.price ?? sel.ltp) - sel.avg) * sel.qty)}`} cls={pnlClass(((ind?.price ?? sel.ltp) - sel.avg))} />
                {sectorOf[sel.symbol] && <Row k="Sector" v={sectorOf[sel.symbol]} />}
                <div className="pt-2 border-t border-border/60 mt-2 text-[11px] text-muted">
                  {loadingInd ? "Loading technicals…" : ind ? "Technicals loaded" : "Technicals unavailable"}
                </div>
                {ind && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
                    <span className="text-muted">50 DMA</span>
                    <span className={ind.sma50 && (ind.price ?? sel.ltp) >= ind.sma50 ? "text-gain" : "text-loss"}>
                      {ind.sma50 ? fmtNum(ind.sma50, 1) : "—"}
                    </span>
                    <span className="text-muted">200 DMA</span>
                    <span className={ind.sma200 && (ind.price ?? sel.ltp) >= ind.sma200 ? "text-gain" : "text-loss"}>
                      {ind.sma200 ? fmtNum(ind.sma200, 1) : "—"}
                    </span>
                    <span className="text-muted">RSI</span>
                    <span>{ind.rsi != null ? ind.rsi.toFixed(0) : "—"}</span>
                    <span className="text-muted">52W range</span>
                    <span>
                      {ind.high52 != null && ind.low52 != null
                        ? `${fmtNum(ind.low52, 0)}–${fmtNum(ind.high52, 0)}`
                        : "—"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {!read ? (
              <div className="card text-sm text-zinc-500">Select a stock to get the mentor&apos;s read.</div>
            ) : (
              <>
                <div className="card border-accent/30">
                  <h3 className="font-semibold">{read.headline}</h3>
                  <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{read.summary}</p>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <Bucket title="What you did right" icon={<CheckCircle2 className="w-4 h-4 text-gain" />} items={read.rights} dot="text-gain" />
                  <Bucket title="What went wrong" icon={<AlertTriangle className="w-4 h-4 text-loss" />} items={read.wrongs} dot="text-loss" />
                  <Bucket title="What to watch" icon={<Eye className="w-4 h-4 text-amber-400" />} items={read.watch} dot="text-amber-400" />
                </div>

                <div className="card">
                  <h3 className="text-sm font-medium mb-3">Your learning from today</h3>
                  <div className="space-y-3">
                    <textarea
                      className="input min-h-[80px]"
                      placeholder="What did you learn about this trade today? What will you do differently?"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="input"
                        placeholder="Mistakes made (optional)"
                        value={mistakes}
                        onChange={(e) => setMistakes(e.target.value)}
                      />
                      <select className="input" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
                        {EMOTIONS.map((e) => (
                          <option key={e}>{e}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="btn-primary flex items-center gap-2" onClick={save} disabled={!note.trim()}>
                        <Save className="w-4 h-4" /> Save to journal
                      </button>
                      {saved && <span className="text-xs text-gain">Saved — the mentor&apos;s read is attached.</span>}
                      {!note.trim() && <span className="text-[11px] text-zinc-500">Add a note to save.</span>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className={`font-mono ${cls ?? ""}`}>{v}</span>
    </div>
  );
}

function Bucket({ title, icon, items, dot }: { title: string; icon: React.ReactNode; items: string[]; dot: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={i} className="text-sm text-zinc-300 flex gap-2">
            <span className={`mt-0.5 ${dot}`}>•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
