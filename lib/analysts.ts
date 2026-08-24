// SEBI-registered research analysts — seed list for the Analyst Feed.
//
// This is the framework's single source of truth. To add an analyst, append an
// entry below. To make their content show up in the merged feed, give them a
// source of type "rss" with a working feed URL — the /api/analyst-feed route
// fetches every rss source server-side and tags each item with the analyst.
//
// Other source types ("x", "youtube") are recognised by the data model so the
// UI can render profile links today and so feed adapters can be plugged in
// later without touching this file's shape.
//
// NOTE ON SEBI REG NUMBERS: verify each analyst's current registration on the
// SEBI intermediary registry before relying on it — registrations lapse and
// change. Left blank here where not independently confirmed; fill `sebiRegNo`.

export type SourceType = "rss" | "x" | "youtube" | "website";

export interface AnalystSource {
  type: SourceType;
  url: string;
  // Only rss sources are fetched into the feed today. `verified` marks feeds
  // we've confirmed return live items; unverified ones are safe to try — the
  // route degrades gracefully if a feed 404s or is empty.
  fetch?: boolean;
  verified?: boolean;
  label?: string;
}

export interface Analyst {
  id: string;
  name: string;
  firm: string;
  // Short specialty tags used for filtering/labelling in the UI.
  tags: string[];
  blurb: string;
  website?: string;
  x?: string; // handle without the leading @
  sebiRegNo?: string;
  sources: AnalystSource[];
}

export const ANALYSTS: Analyst[] = [
  {
    id: "nooresh-merani",
    name: "Nooresh Merani",
    firm: "NooreshTech / Analyse India",
    tags: ["Technical Analysis", "Charts"],
    blurb:
      "Technical analyst known for chart-led market commentary and educational breakdowns of Indian equities.",
    website: "https://www.nooreshtech.co.in",
    x: "nooreshtech",
    sebiRegNo: "",
    sources: [
      { type: "rss", url: "https://www.nooreshtech.co.in/feed/", fetch: true, verified: true, label: "Blog" },
      { type: "x", url: "https://x.com/nooreshtech" },
      { type: "website", url: "https://www.nooreshtech.co.in" },
    ],
  },
  {
    id: "deepak-shenoy",
    name: "Deepak Shenoy",
    firm: "Capitalmind",
    tags: ["Quant", "Portfolios", "Macro"],
    blurb:
      "Founder of Capitalmind — data-driven research, model portfolios and momentum strategies for Indian markets.",
    website: "https://www.capitalmind.in",
    x: "deepakshenoy",
    sebiRegNo: "",
    sources: [
      { type: "rss", url: "https://premium.capitalmind.in/feed/", fetch: true, verified: true, label: "Research" },
      { type: "x", url: "https://x.com/deepakshenoy" },
      { type: "website", url: "https://www.capitalmind.in" },
    ],
  },
  {
    id: "5paisa-research",
    name: "5paisa Research",
    firm: "5paisa Capital",
    tags: ["Markets", "IPO", "News"],
    blurb:
      "Research desk publishing daily market moves, earnings and IPO coverage across Indian equities.",
    website: "https://www.5paisa.com",
    x: "5paisa",
    sebiRegNo: "",
    sources: [
      { type: "rss", url: "https://www.5paisa.com/rss/news.xml", fetch: true, verified: true, label: "News" },
      { type: "x", url: "https://x.com/5paisa" },
      { type: "website", url: "https://www.5paisa.com" },
    ],
  },
  {
    id: "saurabh-mukherjea",
    name: "Saurabh Mukherjea",
    firm: "Marcellus Investment Managers",
    tags: ["Quality Investing", "Long-term"],
    blurb:
      "Founder of Marcellus — long-horizon 'quality' investing in high-return, moaty Indian franchises.",
    website: "https://marcellus.in",
    x: "MarcellusInvest",
    sebiRegNo: "",
    sources: [
      { type: "x", url: "https://x.com/MarcellusInvest" },
      { type: "website", url: "https://marcellus.in/blog/" },
    ],
  },
  {
    id: "equitymaster",
    name: "Equitymaster",
    firm: "Equitymaster",
    tags: ["Equity Research", "Newsletters"],
    blurb:
      "One of India's oldest independent equity research houses — stock ideas, screens and daily market notes.",
    website: "https://www.equitymaster.com",
    x: "equitymaster",
    sebiRegNo: "",
    sources: [
      { type: "rss", url: "https://feeds.equitymaster.com/5MinWrapup", fetch: true, verified: false, label: "5 Min WrapUp" },
      { type: "x", url: "https://x.com/equitymaster" },
      { type: "website", url: "https://www.equitymaster.com" },
    ],
  },
  {
    id: "vivek-bajaj",
    name: "Vivek Bajaj",
    firm: "StockEdge / Elearnmarkets",
    tags: ["Analytics", "Education"],
    blurb:
      "Co-founder of StockEdge and Elearnmarkets — analytics-first stock research and market education.",
    website: "https://www.stockedge.com",
    x: "vivbajaj",
    sebiRegNo: "",
    sources: [
      { type: "x", url: "https://x.com/vivbajaj" },
      { type: "website", url: "https://www.stockedge.com" },
    ],
  },
  {
    id: "pranjal-kamra",
    name: "Pranjal Kamra",
    firm: "Finology",
    tags: ["Value Investing", "Education"],
    blurb:
      "Founder of Finology — value-investing research and financial education for retail investors.",
    website: "https://www.finology.in",
    x: "pranjalkamra",
    sebiRegNo: "",
    sources: [
      { type: "x", url: "https://x.com/pranjalkamra" },
      { type: "website", url: "https://www.finology.in" },
    ],
  },
  {
    id: "alok-jain",
    name: "Alok Jain",
    firm: "Weekend Investing",
    tags: ["Momentum", "Systematic"],
    blurb:
      "Founder of Weekend Investing — rules-based momentum strategies and smallcase portfolios.",
    website: "https://weekendinvesting.com",
    x: "weekendinvestng",
    sebiRegNo: "",
    sources: [
      { type: "x", url: "https://x.com/weekendinvestng" },
      { type: "website", url: "https://weekendinvesting.com" },
    ],
  },
  {
    id: "marketsmith-india",
    name: "MarketSmith India",
    firm: "MarketSmith (William O'Neil India)",
    tags: ["Growth", "CANSLIM"],
    blurb:
      "Growth-stock research applying the CAN SLIM framework — ratings, screens and idea lists for Indian equities.",
    website: "https://www.marketsmithindia.com",
    x: "MarketSmithIND",
    sebiRegNo: "",
    sources: [
      { type: "x", url: "https://x.com/MarketSmithIND" },
      { type: "website", url: "https://www.marketsmithindia.com" },
    ],
  },
  {
    id: "trendlyne",
    name: "Trendlyne",
    firm: "Trendlyne",
    tags: ["Data", "Screeners"],
    blurb:
      "Analytics platform surfacing analyst targets, screeners and quantitative signals across Indian stocks.",
    website: "https://trendlyne.com",
    x: "Trendlyne",
    sebiRegNo: "",
    sources: [
      { type: "x", url: "https://x.com/Trendlyne" },
      { type: "website", url: "https://trendlyne.com" },
    ],
  },
];

export const analystById = (id: string): Analyst | undefined =>
  ANALYSTS.find((a) => a.id === id);
