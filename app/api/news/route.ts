import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Live Indian market news, merged from a few public RSS feeds. Fetched
// server-side (from the machine running the app) so the browser isn't blocked by
// CORS, then parsed with light regex (no XML dependency).

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
  ts: number; // epoch ms
}

const FEEDS: { name: string; url: string }[] = [
  { name: "ET Markets", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
  { name: "Moneycontrol", url: "https://www.moneycontrol.com/rss/marketreports.xml" },
  { name: "Business Standard", url: "https://www.business-standard.com/rss/markets-106.rss" },
  { name: "Livemint", url: "https://www.livemint.com/rss/markets" },
];

const strip = (s: string) =>
  s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();

const pick = (block: string, tag: string): string => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? strip(m[1]) : "";
};

async function fetchFeed(name: string, url: string): Promise<NewsItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml, application/xml, text/xml, */*" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
    return items
      .slice(0, 15)
      .map((block) => {
        const title = pick(block, "title");
        const link = pick(block, "link") || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
        const pub = pick(block, "pubDate") || pick(block, "dc:date");
        const ts = pub ? Date.parse(pub) : NaN;
        return { title, link, source: name, pubDate: isFinite(ts) ? new Date(ts).toISOString() : "", ts: isFinite(ts) ? ts : 0 };
      })
      .filter((i) => i.title && i.link);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

let cache: { items: NewsItem[]; ts: number } = { items: [], ts: 0 };
const TTL = 4 * 60_000; // 4 min — the page polls every 5

export async function GET() {
  if (cache.items.length && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ items: cache.items, fetchedAt: new Date(cache.ts).toISOString(), cached: true });
  }
  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.name, f.url)));
  const seen = new Set<string>();
  const items = results
    .flat()
    .filter((i) => {
      const k = i.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 40);

  if (items.length) cache = { items, ts: Date.now() };
  return NextResponse.json({ items, fetchedAt: new Date().toISOString(), cached: false, feeds: FEEDS.length });
}
