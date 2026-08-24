"use client";

import { useEffect, useMemo, useState } from "react";
import { ANALYSTS } from "@/lib/analysts";
import type { Ticker } from "@/lib/stockMatch";
import { PageTitle, StatCard } from "@/components/ui";
import { RefreshCw, ExternalLink, Rss, Twitter, Globe, TrendingUp, X } from "lucide-react";

interface FeedItem {
  analystId: string;
  analystName: string;
  firm: string;
  title: string;
  link: string;
  source: string;
  summary: string;
  pubDate: string;
  ts: number;
  tickers: Ticker[];
}

interface Quote {
  price: number;
  prevClose: number | null;
  changePct: number | null;
}

interface StockAgg {
  symbol: string;
  name: string;
  mentions: number;
  latestTs: number;
  latestLink: string;
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const pnlClass = (v: number | null | undefined) =>
  v == null ? "text-zinc-400" : v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-zinc-400";

export default function Analysts() {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => setMounted(true), []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analyst-feed", { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setFetchedAt(data.fetchedAt ?? "");
    } catch {
      /* keep whatever we had */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60_000); // refresh every 5 min
    return () => clearInterval(id);
  }, []);

  // Items in the current analyst scope (before the stock filter) — drives the
  // "stocks they're talking about" panel.
  const scopeItems = useMemo(
    () => (selected ? items.filter((i) => i.analystId === selected) : items),
    [items, selected]
  );

  // Aggregate the stocks mentioned across the scope.
  const stockAgg = useMemo<StockAgg[]>(() => {
    const map = new Map<string, StockAgg>();
    for (const it of scopeItems) {
      for (const t of it.tickers ?? []) {
        const cur = map.get(t.symbol);
        if (cur) {
          cur.mentions += 1;
          if (it.ts > cur.latestTs) {
            cur.latestTs = it.ts;
            cur.latestLink = it.link;
          }
        } else {
          map.set(t.symbol, { symbol: t.symbol, name: t.name, mentions: 1, latestTs: it.ts, latestLink: it.link });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.latestTs - a.latestTs || b.mentions - a.mentions);
  }, [scopeItems]);

  // Live quotes for the stocks currently in the panel (cap to keep it light).
  const panelSymbols = useMemo(() => stockAgg.slice(0, 24).map((s) => s.symbol), [stockAgg]);
  const symbolsKey = panelSymbols.join(",");

  useEffect(() => {
    if (!panelSymbols.length) return;
    const yh = panelSymbols.map((s) => `${s}.NS`).join(",");
    let cancelled = false;
    fetch(`/api/quote?symbols=${encodeURIComponent(yh)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((q) => {
        if (!cancelled) setQuotes((prev) => ({ ...prev, ...q }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  // Final visible feed: analyst scope + optional stock filter.
  const visible = useMemo(
    () => (stockFilter ? scopeItems.filter((i) => (i.tickers ?? []).some((t) => t.symbol === stockFilter)) : scopeItems),
    [scopeItems, stockFilter]
  );

  const liveCount = useMemo(
    () => ANALYSTS.filter((a) => a.sources.some((s) => s.type === "rss" && s.fetch)).length,
    []
  );

  if (!mounted) return null;

  const selectedName = selected ? ANALYSTS.find((a) => a.id === selected)?.name : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle
          title="Analyst Feed"
          subtitle="Latest from SEBI-registered research analysts — and the stocks they're talking about"
        />
        <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Analysts tracked" value={String(ANALYSTS.length)} sub="seed list" />
        <StatCard label="Live feeds" value={String(liveCount)} sub="RSS sources wired" />
        <StatCard label="Feed items" value={String(items.length)} sub={selected ? "1 analyst" : "all analysts"} />
        <StatCard label="Stocks detected" value={String(stockAgg.length)} sub={selected ? `by ${selectedName}` : "across feed"} />
      </div>

      {/* Analyst directory */}
      <h2 className="text-sm font-medium text-muted mb-3">Analysts</h2>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {ANALYSTS.map((a) => {
          const hasFeed = a.sources.some((s) => s.type === "rss" && s.fetch);
          const active = selected === a.id;
          return (
            <div
              key={a.id}
              className={`card cursor-pointer transition-colors ${active ? "border-accent" : "hover:border-zinc-600"}`}
              onClick={() => {
                setSelected(active ? null : a.id);
                setStockFilter(null);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold leading-snug">{a.name}</h3>
                  <div className="text-xs text-muted mt-0.5">{a.firm}</div>
                </div>
                {hasFeed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-gain/10 text-gain shrink-0">
                    <Rss className="w-3 h-3" /> Live
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-surface text-zinc-500 shrink-0">
                    Profile
                  </span>
                )}
              </div>

              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{a.blurb}</p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {a.tags.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent">
                    {t}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60">
                {a.x && (
                  <a
                    href={`https://x.com/${a.x}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-500 hover:text-accent"
                    title={`@${a.x} on X`}
                  >
                    <Twitter className="w-4 h-4" />
                  </a>
                )}
                {a.website && (
                  <a
                    href={a.website}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-500 hover:text-accent"
                    title="Website"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                )}
                {a.sebiRegNo ? (
                  <span className="text-[10px] text-zinc-600 ml-auto font-mono">SEBI: {a.sebiRegNo}</span>
                ) : (
                  <span className="text-[10px] text-zinc-700 ml-auto">SEBI RA — verify no.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stocks they're talking about */}
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-medium">
          {selected ? `Stocks ${selectedName} is talking about` : "Stocks across the feed"}
        </h2>
        {stockFilter && (
          <button
            className="ml-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            onClick={() => setStockFilter(null)}
          >
            <X className="w-3 h-3" /> clear filter
          </button>
        )}
      </div>

      {stockAgg.length === 0 ? (
        <div className="card text-sm text-zinc-500 mb-8">
          {selected
            ? "No stocks detected in this analyst's recent posts yet."
            : "No stocks detected yet — feeds populate this once the app is running locally."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          {stockAgg.slice(0, 24).map((s) => {
            const q = quotes[`${s.symbol}.NS`];
            const on = stockFilter === s.symbol;
            return (
              <div
                key={s.symbol}
                className={`card cursor-pointer transition-colors ${on ? "border-accent" : "hover:border-zinc-600"}`}
                onClick={() => setStockFilter(on ? null : s.symbol)}
                title="Filter the feed to this stock"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm font-mono">{s.symbol}</div>
                    <div className="text-[11px] text-muted truncate">{s.name}</div>
                  </div>
                  <a
                    href={s.latestLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-zinc-600 hover:text-accent shrink-0"
                    title="Open the latest post mentioning this stock"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm">{q ? `₹${q.price.toLocaleString("en-IN")}` : "—"}</div>
                    <div className={`text-[11px] font-mono ${pnlClass(q?.changePct)}`}>
                      {q?.changePct != null ? `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-zinc-400">{s.mentions}×</div>
                    <div className="text-[10px] text-zinc-600">{timeAgo(s.latestTs)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Merged feed */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted">
          {selected ? `Feed — ${selectedName}` : "Latest feed"}
          {stockFilter && <span className="text-accent"> · {stockFilter}</span>}
        </h2>
        {(selected || stockFilter) && (
          <button
            className="text-xs text-accent hover:underline"
            onClick={() => {
              setSelected(null);
              setStockFilter(null);
            }}
          >
            Show all
          </button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="card text-center py-10 text-sm text-zinc-500">Loading feeds…</div>
      ) : visible.length === 0 ? (
        <div className="card text-center py-10 text-sm text-zinc-500">
          {stockFilter
            ? "No posts mention this stock in the current view."
            : selected
            ? "No live feed wired for this analyst yet — add an RSS source in lib/analysts.ts."
            : "No feed items yet. Try Refresh."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((it, idx) => (
            <div key={`${it.link}-${idx}`} className="card hover:border-zinc-600 transition-colors">
              <div className="flex items-center gap-2 text-[11px] text-muted mb-1.5 flex-wrap">
                <span className="text-zinc-300 font-medium">{it.analystName}</span>
                <span className="text-zinc-600">·</span>
                <span>{it.firm}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-zinc-400">{it.source}</span>
                <span className="ml-auto font-mono text-zinc-500">{timeAgo(it.ts)}</span>
              </div>
              <a
                href={it.link}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium leading-snug hover:text-accent transition-colors flex items-start gap-1.5 group"
              >
                <span>{it.title}</span>
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-600 group-hover:text-accent" />
              </a>
              {it.summary && <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed line-clamp-2">{it.summary}</p>}
              {it.tickers?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {it.tickers.map((t) => (
                    <button
                      key={t.symbol}
                      onClick={() => setStockFilter(stockFilter === t.symbol ? null : t.symbol)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                        stockFilter === t.symbol
                          ? "bg-accent text-white"
                          : "bg-accent/10 text-accent hover:bg-accent/20"
                      }`}
                      title={t.name}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-zinc-600 mt-6">
        Informational only — not investment advice. Stocks are auto-detected from each analyst&apos;s public feed text and
        may miss or misattribute mentions; a mention is not a recommendation. Live prices via Yahoo Finance. Verify SEBI
        registration on the SEBI intermediary registry before acting.
      </p>
    </div>
  );
}
