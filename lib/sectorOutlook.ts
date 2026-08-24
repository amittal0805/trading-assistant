// A dated, news-based sectoral-rotation outlook. This is a manual snapshot
// compiled from financial news for the given date — it does NOT auto-update, so
// refresh it when you want a fresh read. Descriptive synthesis of public news
// and index momentum, not investment advice.

export type Stance = "Favoured" | "Neutral" | "Cautious" | "Avoid";

export interface SectorView {
  sector: string;
  stance: Stance;
  note: string;
}

export interface SectorOutlook {
  date: string; // YYYY-MM-DD the read is for
  asOf: string; // basis (e.g. previous close)
  headline: string;
  drivers: string[];
  views: SectorView[];
  sources: { title: string; url: string }[];
}

export const STANCE_TONE: Record<Stance, string> = {
  Favoured: "bg-gain/15 text-gain border border-gain/30",
  Neutral: "bg-surface text-zinc-300 border border-border",
  Cautious: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  Avoid: "bg-loss/15 text-loss border border-loss/30",
};

export const SECTOR_OUTLOOK: SectorOutlook = {
  date: "2026-08-12",
  asOf: "Based on the 11-Aug-2026 close and the latest market news",
  headline: "Defensive rotation — Pharma and IT catch a bid while crude, a softer rupee and weak financials pressure banks, metals and realty.",
  drivers: [
    "Crude oil pushed higher and the rupee softened, weighing on importers, OMCs and rate-sensitives.",
    "Financials were the biggest drag on 11 Aug (Sensex −388, Nifty back below ~24,500); PSU banks led the weakness the prior session.",
    "Money rotated into defensives — Pharma led (Dr Reddy's) with IT firm on a weak-rupee export tailwind; FMCG, Realty and Metal each fell ~1%.",
    "Medium-term the Nifty is still above its 200-day EMA with India VIX low (~12) and a balanced PCR (~1.1) — a buy-on-dips backdrop as long as key supports hold.",
  ],
  views: [
    { sector: "Pharma & Healthcare", stance: "Favoured", note: "Sector leadership on 11 Aug (Dr Reddy's) — classic defensive bid; favoured while crude/rupee pressure risk assets." },
    { sector: "IT", stance: "Favoured", note: "Firm on a weaker rupee (export tailwind); has been among the leaders — relative strength, buy dips in leaders." },
    { sector: "Energy / Oil & Gas", stance: "Neutral", note: "Rising crude helps upstream but squeezes OMCs — mixed; be selective, upstream over downstream." },
    { sector: "Auto", stance: "Neutral", note: "Soft (~−0.5% on 11 Aug); a firmer rupee would help, but no clear leadership yet — hold, don't chase." },
    { sector: "Banking / Financials", stance: "Cautious", note: "The session's main drag; PSU banks weak. Wait for financials to stabilise before adding." },
    { sector: "Metal", stance: "Cautious", note: "Down ~1%; sensitive to global cues and the stronger dollar/crude — trim strength, avoid fresh longs." },
    { sector: "Real Estate", stance: "Cautious", note: "Whippy — led on 10 Aug (DLF, Brigade) then fell ~1% on 11 Aug; rate-sensitive, so choppy while yields/crude rise." },
    { sector: "FMCG", stance: "Cautious", note: "Dragging despite its defensive tag — profit-booking; no momentum edge right now." },
  ],
  sources: [
    { title: "Share Market Today — 11 Aug 2026 (Pharma leads, FMCG/Realty drag) · Liquide", url: "https://blog.liquide.life/share-market-today-sensex-falls-388-points-nifty-ends-below-24-500-pharma-leads-as-dr-reddys-eternal-rally-fmcg-realty-drag/" },
    { title: "Sensex, Nifty slip as crude climbs; Realty & Metals drag — 11 Aug 2026 · HDFC Sky", url: "https://hdfcsky.com/news/bse-nse-sensex-august-11-2026-close-report-sensex-nifty-decline-as-oil-financials-weigh-on-benchmarks" },
    { title: "Share Market Today — 10 Aug 2026 (Realty leads, PSU banks drag) · Liquide", url: "https://blog.liquide.life/share-market-today-sensex-nifty-end-flat-near-24-600-realty-leads-as-titan-tata-consumer-rally-psu-banks-drag/" },
    { title: "Nifty 50 Prediction — 10 Aug 2026 (IT leads) · Univest", url: "https://univest.in/blogs/nifty-50-prediction-for-tomorrow-10-august-2026" },
    { title: "Market Prediction Today · Choice India", url: "https://choiceindia.com/blog/market-prediction-today" },
  ],
};
