"use client";

import { useEffect, useState } from "react";
import { useStore, Position } from "@/lib/store";
import { Exchange, Broker, netPnl } from "@/lib/charges";
import { requiredExitPrice } from "@/lib/calc";
import { fmtMoney, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Empty } from "@/components/ui";
import { Trash2, ArrowRightLeft, CheckCircle2, RefreshCw, Upload } from "lucide-react";
import { fetchQuotes, yahooSymbol } from "@/lib/quotes";
import { parseKiteRows } from "@/lib/kite";
import { useMemo, useRef } from "react";

type SortKey = "newest" | "symbol" | "netpl" | "capital";

export default function Positions() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { positions, addPosition, importPositions, updatePosition, closePosition, removePosition, convertToDelivery } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const onImportFile = async (f: File) => {
    const rows = parseKiteRows(await f.text());
    if (rows.length === 0) {
      setImportMsg("No valid rows found — is this a Kite positions CSV?");
      return;
    }
    importPositions(
      rows.map((r) => ({
        symbol: r.symbol,
        exchange: "NSE" as const,
        broker: "zerodha" as const,
        qty: r.qty,
        entryPrice: r.avgPrice,
        currentPrice: r.currentPrice,
        targetProfit: 0,
        stopLoss: 0,
      }))
    );
    setImportMsg(`Imported ${rows.length} position(s)`);
  };

  const refreshPrices = async () => {
    const openPos = positions.filter((p) => p.status === "open");
    if (openPos.length === 0 || refreshing) return;
    setRefreshing(true);
    try {
      const quotes = await fetchQuotes(openPos);
      openPos.forEach((p) => {
        const q = quotes[yahooSymbol(p.symbol, p.exchange)];
        if (q) updatePosition(p.id, { currentPrice: q.price, prevClose: q.prevClose ?? undefined });
      });
    } catch {
      // keep manual prices on failure
    } finally {
      setRefreshing(false);
    }
  };

  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [qty, setQty] = useState<number | "">("");
  const [entry, setEntry] = useState<number | "">("");
  const [target, setTarget] = useState<number | "">("");
  const [sl, setSl] = useState<number | "">("");

  const open = useMemo(() => {
    const arr = positions.filter((p) => p.status === "open");
    const net = (p: Position) =>
      netPnl({ buyPrice: p.entryPrice, sellPrice: p.currentPrice, qty: p.qty, exchange: p.exchange, segment: "intraday" }, p.broker).net;
    switch (sortKey) {
      case "symbol": return arr.sort((a, b) => a.symbol.localeCompare(b.symbol));
      case "netpl": return arr.sort((a, b) => net(b) - net(a));
      case "capital": return arr.sort((a, b) => b.entryPrice * b.qty - a.entryPrice * a.qty);
      default: return arr.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    }
  }, [positions, sortKey]);

  if (!mounted) return null;

  const closed = positions.filter((p) => p.status === "closed").slice(-10).reverse();

  const submit = () => {
    if (!symbol || !qty || !entry) return;
    const broker: Broker = exchange === "NSE" || exchange === "BSE" ? "zerodha" : "vested";
    addPosition({
      symbol: symbol.toUpperCase(), exchange, broker,
      qty: Number(qty), entryPrice: Number(entry), currentPrice: Number(entry),
      targetProfit: Number(target) || 0, stopLoss: Number(sl) || 0,
    });
    setSymbol(""); setQty(""); setEntry(""); setTarget(""); setSl("");
  };

  const pnlFor = (p: Position, sell: number) =>
    netPnl({ buyPrice: p.entryPrice, sellPrice: sell, qty: p.qty, exchange: p.exchange, segment: "intraday" }, p.broker);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Intraday Positions" subtitle="Track open trades with live net P/L after charges" />
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> Import Kite CSV
            </button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={refreshPrices} disabled={refreshing}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Fetching…" : "Refresh Prices"}
            </button>
          </div>
          {importMsg && <span className="text-[10px] text-zinc-500">{importMsg}</span>}
        </div>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
          <Field label="Stock"><input className="input" value={symbol} placeholder="RELIANCE" onChange={(e) => setSymbol(e.target.value)} /></Field>
          <Field label="Exchange">
            <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
              <option>NSE</option><option>BSE</option><option>NYSE</option><option>NASDAQ</option>
            </select>
          </Field>
          <Field label="Quantity"><NumInput value={qty} onChange={setQty} placeholder="500" /></Field>
          <Field label="Entry Price"><NumInput value={entry} onChange={setEntry} placeholder="100" /></Field>
          <Field label="Target Profit"><NumInput value={target} onChange={setTarget} placeholder="5000" /></Field>
          <Field label="Stop Loss Price"><NumInput value={sl} onChange={setSl} placeholder="98" /></Field>
          <button className="btn-primary" onClick={submit}>Add</button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">Open Positions</h2>
        <select className="input !w-auto !py-1 text-xs" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="newest">Sort: Newest</option>
          <option value="symbol">Sort: Symbol A–Z</option>
          <option value="netpl">Sort: Net P/L</option>
          <option value="capital">Sort: Capital Used</option>
        </select>
      </div>
      {open.length === 0 ? (
        <Empty text="No open positions." />
      ) : (
        <div className="space-y-3 mb-8">
          {open.map((p) => {
            const ccy = currencyFor(p.exchange);
            const r = pnlFor(p, p.currentPrice);
            const riskPct = p.stopLoss > 0 ? ((p.entryPrice - p.stopLoss) / p.entryPrice) * 100 : 0;
            const targetHit = p.targetProfit > 0 && r.net >= p.targetProfit;
            const slHit = p.stopLoss > 0 && p.currentPrice <= p.stopLoss;
            return (
              <div key={p.id} className={`card ${targetHit ? "border-gain/50" : slHit ? "border-loss/50" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="min-w-[100px]">
                    <div className="font-medium">{p.symbol}</div>
                    <div className="text-xs text-muted">{p.exchange} · {p.qty} qty @ {fmtMoney(p.entryPrice, ccy)}</div>
                  </div>
                  <div>
                    <div className="label !mb-1">Current Price</div>
                    <input type="number" className="input !py-1 w-28 font-mono"
                      value={p.currentPrice}
                      onChange={(e) => updatePosition(p.id, { currentPrice: Number(e.target.value) })} />
                  </div>
                  <div>
                    <div className="text-xs text-muted">Gross P/L</div>
                    <div className={`font-mono text-sm ${pnlClass(r.gross)}`}>{fmtMoney(r.gross, ccy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Charges</div>
                    <div className="font-mono text-sm text-zinc-400">{fmtMoney(r.charges.total, ccy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Net P/L</div>
                    <div className={`font-mono text-sm font-semibold ${pnlClass(r.net)}`}>{fmtMoney(r.net, ccy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Live Value</div>
                    <div className="font-mono text-sm">{fmtMoney(p.currentPrice * p.qty, ccy)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Day %</div>
                    <div className={`font-mono text-sm ${p.prevClose ? pnlClass(p.currentPrice - p.prevClose) : "text-zinc-600"}`}>
                      {p.prevClose ? fmtPct(((p.currentPrice - p.prevClose) / p.prevClose) * 100) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Risk (SL)</div>
                    <div className="font-mono text-sm">{riskPct > 0 ? `${riskPct.toFixed(2)}%` : "—"}</div>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button className="btn-ghost !py-1.5 text-xs" onClick={() => closePosition(p.id, p.currentPrice)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Close @ current
                    </button>
                    <button className="btn-ghost !py-1.5 text-xs" title="Convert to delivery (moves to Holdings)"
                      onClick={() => convertToDelivery(p.id)}>
                      <ArrowRightLeft className="w-3.5 h-3.5" /> To CNC
                    </button>
                    <button className="btn-danger !py-1.5 text-xs" onClick={() => removePosition(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {targetHit && <div className="mt-2 text-xs text-gain">Target achieved — consider booking profit.</div>}
                {slHit && <div className="mt-2 text-xs text-loss">Stop loss breached — exit or convert to delivery consciously, not by default.</div>}
                {p.broker === "zerodha" && (() => {
                  const cnc = netPnl(
                    { buyPrice: p.entryPrice, sellPrice: p.currentPrice, qty: p.qty, exchange: p.exchange, segment: "delivery" },
                    "zerodha"
                  );
                  const be = requiredExitPrice({
                    buyPrice: p.entryPrice, qty: p.qty, targetNet: 0,
                    broker: "zerodha", exchange: p.exchange, segment: "delivery",
                  });
                  return (
                    <div className="mt-2 text-[11px] text-zinc-500 border-t border-border/60 pt-2">
                      <span className="text-zinc-400">If converted to CNC:</span> charges become{" "}
                      <span className="font-mono">{fmtMoney(cnc.charges.total, ccy)}</span> vs{" "}
                      <span className="font-mono">{fmtMoney(r.charges.total, ccy)}</span> intraday
                      (Δ <span className={`font-mono ${pnlClass(r.charges.total - cnc.charges.total)}`}>{fmtMoney(cnc.charges.total - r.charges.total, ccy)}</span>, mostly STT + DP).
                      Net if sold today as delivery: <span className={`font-mono ${pnlClass(cnc.net)}`}>{fmtMoney(cnc.net, ccy)}</span>.
                      {be && <> Breakeven price: <span className="font-mono text-zinc-300">{fmtMoney(be.exitPrice, ccy)}</span>.</>}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="text-sm font-medium mb-3">Recently Closed</h2>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th">Stock</th><th className="th">Qty</th><th className="th">Entry</th><th className="th">Exit</th><th className="th">Net P/L</th></tr></thead>
              <tbody>
                {closed.map((p) => {
                  const ccy = currencyFor(p.exchange);
                  const r = pnlFor(p, p.exitPrice ?? p.entryPrice);
                  return (
                    <tr key={p.id}>
                      <td className="td">{p.symbol}</td>
                      <td className="td font-mono">{p.qty}</td>
                      <td className="td font-mono">{fmtMoney(p.entryPrice, ccy)}</td>
                      <td className="td font-mono">{fmtMoney(p.exitPrice ?? 0, ccy)}</td>
                      <td className={`td font-mono ${pnlClass(r.net)}`}>{fmtMoney(r.net, ccy)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
