"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, Holding } from "@/lib/store";
import { Exchange, Broker, netPnl } from "@/lib/charges";
import { fmtMoney, fmtNum, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Empty } from "@/components/ui";
import { Trash2, RefreshCw, Upload, HandCoins, X } from "lucide-react";
import { fetchQuotes, yahooSymbol } from "@/lib/quotes";
import { parseKiteRows } from "@/lib/kite";

type SortKey = "symbol" | "qty" | "avgPrice" | "currentPrice" | "invested" | "value" | "pl" | "plPct" | "dayPl" | "dayPct";

export default function Holdings() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings, addHolding, sellHolding, importHoldings, replaceHoldings, updateHolding, removeHolding } = useStore();

  // Sell panel state
  const [sellId, setSellId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState<number | "">("");
  const [sellPrice, setSellPrice] = useState<number | "">("");
  const [soldMsg, setSoldMsg] = useState<string | null>(null);

  const openSell = (h: Holding) => {
    setSellId(h.id);
    setSellQty(h.qty);
    setSellPrice(h.currentPrice);
    setSoldMsg(null);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [market, setMarket] = useState<"IN" | "US">("IN");

  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [qty, setQty] = useState<number | "">("");
  const [avg, setAvg] = useState<number | "">("");
  const [cur, setCur] = useState<number | "">("");
  const [type, setType] = useState<"longterm" | "swing">("longterm");

  const inTab = (h: Holding) => (market === "IN") === (currencyFor(h.exchange) === "INR");

  const sorted = useMemo(() => {
    const metric = (h: Holding): number | string => {
      const inv = h.qty * h.avgPrice;
      const val = h.qty * h.currentPrice;
      switch (sortKey) {
        case "symbol": return h.symbol;
        case "qty": return h.qty;
        case "avgPrice": return h.avgPrice;
        case "currentPrice": return h.currentPrice;
        case "invested": return inv;
        case "value": return val;
        case "pl": return val - inv;
        case "plPct": return inv > 0 ? (val - inv) / inv : 0;
        case "dayPl": return h.prevClose ? (h.currentPrice - h.prevClose) * h.qty : -Infinity;
        case "dayPct": return h.prevClose ? (h.currentPrice - h.prevClose) / h.prevClose : -Infinity;
      }
    };
    return holdings.filter(inTab).sort((a, b) => {
      const ma = metric(a), mb = metric(b);
      const cmp = typeof ma === "string" ? ma.localeCompare(mb as string) : ma - (mb as number);
      return cmp * sortDir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, sortKey, sortDir, market]);

  if (!mounted) return null;

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? 1 : -1); // numbers default to descending
    }
  };

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="th cursor-pointer select-none hover:text-zinc-200" onClick={() => onSort(k)}>
      {label}
      {sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  const num = (v: unknown) => Number(String(v ?? "").replace(/,/g, ""));

  // Vested Finance holdings export (.xlsx with a "Holdings" sheet).
  const importVested = async (f: File) => {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer());
    const ws = wb.Sheets["Holdings"] ?? wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
    if (!ws) return 0;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    const parsed = rows
      .map((r) => {
        const price = num(r["Current Price (USD)"]);
        const dailyChg = num(r["Daily Change (USD)"]);
        return {
          symbol: String(r["Ticker"] ?? "").toUpperCase(),
          qty: num(r["Total Shares Held"]),
          avgPrice: num(r["Average Cost (USD)"]),
          currentPrice: price,
          prevClose: isFinite(price) && isFinite(dailyChg) ? price - dailyChg : undefined,
          exchange: "NASDAQ" as const,
          broker: "vested" as const,
          type: "longterm" as const,
        };
      })
      .filter((r) => r.symbol && isFinite(r.qty) && r.qty > 0 && isFinite(r.avgPrice) && r.avgPrice > 0);
    if (parsed.length > 0) replaceHoldings(parsed, "USD");
    return parsed.length;
  };

  const onImportFile = async (f: File) => {
    if (f.name.toLowerCase().endsWith(".xlsx")) {
      const n = await importVested(f);
      setImportMsg(n > 0 ? `Imported ${n} US holdings from Vested — replaced the existing US set` : "No holdings found — is this a Vested export?");
      return;
    }
    const rows = parseKiteRows(await f.text());
    if (rows.length === 0) {
      setImportMsg("No valid rows found — is this a Kite holdings CSV?");
      return;
    }
    replaceHoldings(
      rows.map((r) => ({
        symbol: r.symbol,
        qty: r.qty,
        avgPrice: r.avgPrice,
        currentPrice: r.currentPrice,
        exchange: "NSE" as const,
        broker: "zerodha" as const,
        type: "longterm" as const,
      })),
      "INR"
    );
    setImportMsg(`Imported ${rows.length} Indian holdings — replaced the existing Indian set (zero-qty rows skipped)`);
  };

  const refreshPrices = async () => {
    if (holdings.length === 0 || refreshing) return;
    setRefreshing(true);
    try {
      const quotes = await fetchQuotes(holdings);
      let updated = 0;
      holdings.forEach((h) => {
        const q = quotes[yahooSymbol(h.symbol, h.exchange)];
        if (q) {
          updateHolding(h.id, { currentPrice: q.price, prevClose: q.prevClose ?? undefined });
          updated++;
        }
      });
      setLastRefresh(`${updated}/${holdings.length} updated · ${new Date().toLocaleTimeString()}`);
    } catch {
      setLastRefresh("Fetch failed — check connection");
    } finally {
      setRefreshing(false);
    }
  };

  const submit = () => {
    if (!symbol || !qty || !avg || !cur) return;
    const broker: Broker = exchange === "NSE" || exchange === "BSE" ? "zerodha" : "vested";
    addHolding({ symbol: symbol.toUpperCase(), exchange, broker, qty: Number(qty), avgPrice: Number(avg), currentPrice: Number(cur), type });
    setSymbol(""); setQty(""); setAvg(""); setCur("");
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Holdings" subtitle="Track your delivery holdings — prices via Yahoo Finance" />
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> Import Kite CSV / Vested XLSX
            </button>
            <button className="btn-ghost !py-1.5 text-xs" onClick={refreshPrices} disabled={refreshing}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Fetching…" : "Refresh Prices"}
            </button>
          </div>
          {(importMsg || lastRefresh) && (
            <span className="text-[10px] text-zinc-500">{importMsg ?? lastRefresh}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(
          [
            ["IN", "India (NSE/BSE)"],
            ["US", "US (NYSE/NASDAQ)"],
          ] as const
        ).map(([id, label]) => {
          const count = holdings.filter((h) => (id === "IN") === (currencyFor(h.exchange) === "INR")).length;
          return (
            <button
              key={id}
              onClick={() => {
                setMarket(id);
                setExchange(id === "IN" ? "NSE" : "NASDAQ");
              }}
              className={`btn !py-1.5 text-xs ${
                market === id
                  ? "bg-accent/15 text-accent border border-accent/40"
                  : "bg-surface border border-border text-zinc-400"
              }`}
            >
              {label} <span className="opacity-60 ml-1">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
          <Field label="Stock">
            <input className="input" value={symbol} placeholder={market === "IN" ? "TCS" : "AAPL"} onChange={(e) => setSymbol(e.target.value)} />
          </Field>
          <Field label="Exchange">
            <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
              {market === "IN" ? (
                <>
                  <option>NSE</option><option>BSE</option>
                </>
              ) : (
                <>
                  <option>NASDAQ</option><option>NYSE</option>
                </>
              )}
            </select>
          </Field>
          <Field label="Quantity"><NumInput value={qty} onChange={setQty} placeholder="120" /></Field>
          <Field label="Avg Price"><NumInput value={avg} onChange={setAvg} placeholder="3480" /></Field>
          <Field label="Current Price"><NumInput value={cur} onChange={setCur} placeholder="3550" /></Field>
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as "longterm" | "swing")}>
              <option value="longterm">Long Term</option>
              <option value="swing">Swing</option>
            </select>
          </Field>
          <button className="btn-primary" onClick={submit}>Add</button>
        </div>
      </div>

      {soldMsg && <p className="text-xs text-gain mb-3">{soldMsg}</p>}

      {(() => {
        const h = holdings.find((x) => x.id === sellId);
        if (!h) return null;
        const ccy = currencyFor(h.exchange);
        const q = Math.min(Number(sellQty) || 0, h.qty);
        const px = Number(sellPrice) || 0;
        const gross = (px - h.avgPrice) * q;
        const est =
          q > 0 && px > 0
            ? netPnl({ buyPrice: h.avgPrice, sellPrice: px, qty: q, exchange: h.exchange, segment: "delivery" }, h.broker)
            : null;
        return (
          <div className="card mb-4 border-accent/30">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-accent" />
                Sell {h.symbol} <span className="text-muted font-normal">· holding {fmtNum(h.qty, 0)} @ {fmtMoney(h.avgPrice, ccy)}</span>
              </h2>
              <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setSellId(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-28">
                <Field label="Quantity"><NumInput value={sellQty} onChange={setSellQty} /></Field>
              </div>
              <div className="w-32">
                <Field label={`Exit Price (${ccy})`}><NumInput value={sellPrice} onChange={setSellPrice} /></Field>
              </div>
              <div className="text-sm pb-1.5 flex-1 min-w-[240px]">
                {q > 0 && px > 0 ? (
                  <span className="text-muted">
                    Realized:{" "}
                    <span className={`font-mono font-semibold ${pnlClass(gross)}`}>{fmtMoney(gross, ccy)}</span>
                    {est && (
                      <>
                        {" "}· net of est. charges{" "}
                        <span className={`font-mono ${pnlClass(est.net)}`}>{fmtMoney(est.net, ccy)}</span>
                      </>
                    )}
                    {q < h.qty && <span className="text-zinc-500"> · {fmtNum(h.qty - q, 0)} shares remain</span>}
                    {q >= h.qty && <span className="text-amber-400"> · full exit</span>}
                  </span>
                ) : (
                  <span className="text-zinc-500">Enter quantity and exit price.</span>
                )}
              </div>
              <button
                className="btn-primary"
                disabled={!(q > 0 && px > 0)}
                onClick={() => {
                  sellHolding(h.id, q, px);
                  setSellId(null);
                  setSoldMsg(
                    `Sold ${fmtNum(q, 0)} ${h.symbol} @ ${fmtMoney(px, ccy)} — booked ${fmtMoney(gross, ccy)}. It now shows under Booked P&L in your sectors.`
                  );
                }}
              >
                Confirm sale
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">
              This records the sale in the app (booked P&amp;L, sector + dashboard) — it does not place a broker order.
            </p>
          </div>
        );
      })()}

      {sorted.length === 0 ? (
        <Empty
          text={
            market === "IN"
              ? "No Indian holdings yet — add one above or import your Kite CSV."
              : "No US holdings yet — add one above or import your Vested XLSX."
          }
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <Th k="symbol" label="Stock" />
                <th className="th">Exch</th>
                <Th k="qty" label="Qty" />
                <Th k="avgPrice" label="Avg" />
                <Th k="currentPrice" label="Current" />
                <Th k="invested" label="Invested" />
                <Th k="value" label="Value" />
                <Th k="pl" label="P/L" />
                <Th k="plPct" label="P/L %" />
                <Th k="dayPl" label="Day P/L" />
                <Th k="dayPct" label="Day %" />
                <th className="th">Type</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((h: Holding) => {
                const ccy = currencyFor(h.exchange);
                const inv = h.qty * h.avgPrice;
                const val = h.qty * h.currentPrice;
                const pl = val - inv;
                return (
                  <tr key={h.id} className="hover:bg-surface/50">
                    <td className="td font-medium">{h.symbol}</td>
                    <td className="td text-muted">{h.exchange}</td>
                    <td className="td font-mono">{h.qty}</td>
                    <td className="td font-mono">{fmtMoney(h.avgPrice, ccy)}</td>
                    <td className="td">
                      <input
                        type="number"
                        className="input !py-1 w-24 font-mono"
                        value={h.currentPrice}
                        onChange={(e) => updateHolding(h.id, { currentPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td className="td font-mono">{fmtMoney(inv, ccy)}</td>
                    <td className="td font-mono">{fmtMoney(val, ccy)}</td>
                    <td className={`td font-mono ${pnlClass(pl)}`}>{fmtMoney(pl, ccy)}</td>
                    <td className={`td font-mono text-xs ${pnlClass(pl)}`}>{fmtPct(inv > 0 ? (pl / inv) * 100 : 0)}</td>
                    <td className={`td font-mono ${h.prevClose ? pnlClass(h.currentPrice - h.prevClose) : "text-zinc-600"}`}>
                      {h.prevClose ? fmtMoney((h.currentPrice - h.prevClose) * h.qty, ccy) : "—"}
                    </td>
                    <td className={`td font-mono text-xs ${h.prevClose ? pnlClass(h.currentPrice - h.prevClose) : "text-zinc-600"}`}>
                      {h.prevClose ? fmtPct(((h.currentPrice - h.prevClose) / h.prevClose) * 100) : "—"}
                    </td>
                    <td className="td text-xs text-muted">{h.type === "longterm" ? "Long Term" : "Swing"}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openSell(h)} className="text-zinc-500 hover:text-accent" title="Sell (books realized P&L)">
                          <HandCoins className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeHolding(h.id)} className="text-zinc-600 hover:text-loss" title="Remove without booking">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const ccy = market === "IN" ? ("INR" as const) : ("USD" as const);
                const inv = sorted.reduce((a, h) => a + h.qty * h.avgPrice, 0);
                const val = sorted.reduce((a, h) => a + h.qty * h.currentPrice, 0);
                const day = sorted.reduce(
                  (a, h) => a + (h.prevClose ? (h.currentPrice - h.prevClose) * h.qty : 0),
                  0
                );
                return (
                  <tr className="bg-surface/60">
                    <td className="td font-medium" colSpan={5}>Total ({sorted.length})</td>
                    <td className="td font-mono font-semibold">{fmtMoney(inv, ccy)}</td>
                    <td className="td font-mono font-semibold">{fmtMoney(val, ccy)}</td>
                    <td className={`td font-mono font-semibold ${pnlClass(val - inv)}`}>{fmtMoney(val - inv, ccy)}</td>
                    <td className={`td font-mono text-xs ${pnlClass(val - inv)}`}>
                      {fmtPct(inv > 0 ? ((val - inv) / inv) * 100 : 0)}
                    </td>
                    <td className={`td font-mono text-xs ${pnlClass(day)}`} colSpan={3}>
                      Day: {fmtMoney(day, ccy)}
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
