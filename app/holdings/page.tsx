"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, Holding } from "@/lib/store";
import { Exchange, Broker } from "@/lib/charges";
import { fmtMoney, fmtPct, pnlClass, currencyFor } from "@/lib/format";
import { PageTitle, Field, NumInput, Empty } from "@/components/ui";
import { Trash2, RefreshCw, Upload } from "lucide-react";
import { fetchQuotes, yahooSymbol } from "@/lib/quotes";
import { parseKiteRows } from "@/lib/kite";

type SortKey = "symbol" | "qty" | "avgPrice" | "currentPrice" | "invested" | "value" | "pl" | "plPct" | "dayPl" | "dayPct";

export default function Holdings() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { holdings, addHolding, importHoldings, updateHolding, removeHolding } = useStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [qty, setQty] = useState<number | "">("");
  const [avg, setAvg] = useState<number | "">("");
  const [cur, setCur] = useState<number | "">("");
  const [type, setType] = useState<"longterm" | "swing">("longterm");

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
    return [...holdings].sort((a, b) => {
      const ma = metric(a), mb = metric(b);
      const cmp = typeof ma === "string" ? ma.localeCompare(mb as string) : ma - (mb as number);
      return cmp * sortDir;
    });
  }, [holdings, sortKey, sortDir]);

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

  const onImportFile = async (f: File) => {
    const rows = parseKiteRows(await f.text());
    if (rows.length === 0) {
      setImportMsg("No valid rows found — is this a Kite holdings CSV?");
      return;
    }
    importHoldings(
      rows.map((r) => ({
        symbol: r.symbol,
        qty: r.qty,
        avgPrice: r.avgPrice,
        currentPrice: r.currentPrice,
        exchange: "NSE" as const,
        broker: "zerodha" as const,
        type: "longterm" as const,
      }))
    );
    setImportMsg(`Imported ${rows.length} holdings (zero-qty rows skipped)`);
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
          {(importMsg || lastRefresh) && (
            <span className="text-[10px] text-zinc-500">{importMsg ?? lastRefresh}</span>
          )}
        </div>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
          <Field label="Stock">
            <input className="input" value={symbol} placeholder="TCS" onChange={(e) => setSymbol(e.target.value)} />
          </Field>
          <Field label="Exchange">
            <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)}>
              <option>NSE</option><option>BSE</option><option>NYSE</option><option>NASDAQ</option>
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

      {holdings.length === 0 ? (
        <Empty text="No holdings yet. Add one above or import your Kite CSV." />
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
                      <button onClick={() => removeHolding(h.id)} className="text-zinc-600 hover:text-loss">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
