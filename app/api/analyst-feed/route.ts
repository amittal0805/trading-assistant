import { NextResponse } from "next/server";
import { ANALYSTS } from "@/lib/analysts";
import { extractTickers, Ticker } from "@/lib/stockMatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Merged feed of SEBI-registered analysts. Every analyst source of type "rss"
// with fetch:true is pulled server-side (so the browser isn't blocked by CORS),
// parsed with light regex (no XML dependency), tagged with its analyst, then
// merged newest-first. Feeds that fail or are empty are skipped silently — the
// framework degrades gracefully so one dead feed never breaks the page.
//
// This mirrors the parsing approach in /api/news. To add a new source type
// (e.g. an X or YouTube adapter), add a branch in fetchSource() keyed on
// source.type and push FeedItems the same shape.

export interface FeedItem {
  analystId: string;
  analystName: string;
  firm: string;
  title: string;
  link: string;
  source: string; // human label, e.g. "Blog"
  summary: string;
  pubDate: string; // ISO
  ts: number; // epoch ms
  tickers: Ticker[]; // NSE stocks detected in title + summary
}

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

async function fetchRss(
  url: string,
  label: string,
  analyst: { id: string; name: string; firm: string }
): Promise<FeedItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    // Supports both RSS <item> and Atom <entry>.
    const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
    return blocks
      .slice(0, 10)
      .map((block) => {
        const title = pick(block, "title");
        const link =
          pick(block, "link") ||
          block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ||
          "";
        const pub =
          pick(block, "pubDate") ||
          pick(block, "dc:date") ||
          pick(block, "published") ||
          pick(block, "updated");
        const summary = (pick(block, "description") || pick(block, "summary") || pick(block, "content")).slice(0, 220);
        const ts = pub ? Date.parse(pub) : NaN;
        return {
          analystId: analyst.id,
          analystName: analyst.name,
          firm: analyst.firm,
          title,
          link,
          source: label,
          summary,
          pubDate: isFinite(ts) ? new Date(ts).toISOString() : "",
          ts: isFinite(ts) ? ts : 0,
          tickers: extractTickers(`${title}. ${summary}`),
        };
      })
      .filter((i) => i.title && i.link);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

let cache: { items: FeedItem[]; ts: number } = { items: [], ts: 0 };
const TTL = 5 * 60_000; // 5 min

export async function GET() {
  if (cache.items.length && Date.now() - cache.ts < TTL) {
    return NextResponse.json({
      items: cache.items,
      fetchedAt: new Date(cache.ts).toISOString(),
      cached: true,
    });
  }

  const jobs: Promise<FeedItem[]>[] = [];
  for (const a of ANALYSTS) {
    for (const s of a.sources) {
      if (s.type === "rss" && s.fetch) {
        jobs.push(fetchRss(s.url, s.label ?? "Feed", { id: a.id, name: a.name, firm: a.firm }));
      }
    }
  }

  const results = await Promise.all(jobs);
  const seen = new Set<string>();
  const items = results
    .flat()
    .filter((i) => {
      const k = `${i.analystId}:${i.title.toLowerCase().slice(0, 60)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);

  if (items.length) cache = { items, ts: Date.now() };

  return NextResponse.json({
    items,
    fetchedAt: new Date().toISOString(),
    cached: false,
    analysts: ANALYSTS.length,
    liveSources: jobs.length,
  });
}
