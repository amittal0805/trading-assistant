"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Broker, Exchange } from "./charges";
import { TradebookResult } from "./tradebook";
import { SEED_HOLDINGS, SEED_POSITIONS, ownedBySymbol } from "./seedData";
import { PnlSummary } from "./pnl";

export interface TradebookImport {
  fileName: string;
  importedAt: string;
  result: TradebookResult;
}

export interface PnlImport {
  fileName: string;
  importedAt: string;
  summary: PnlSummary;
}

// Vested Finance (US brokerage) portfolio summary, in USD.
export interface VestedSummary {
  valueUSD: number;
  investedUSD: number;
  asOf: string;
}

export interface Holding {
  id: string;
  symbol: string;
  exchange: Exchange;
  broker: Broker;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  prevClose?: number; // previous session close, set by price refresh
  type: "longterm" | "swing";
}

export interface Position {
  id: string;
  symbol: string;
  exchange: Exchange;
  broker: Broker;
  qty: number;
  entryPrice: number;
  currentPrice: number;
  prevClose?: number; // previous session close, set by price refresh
  targetProfit: number;
  stopLoss: number;
  openedAt: string;
  status: "open" | "closed";
  exitPrice?: number;
  closedAt?: string;
}

export type JournalTradeType = "Scalp" | "Intraday" | "Swing" | "Delivery";

export interface JournalEntry {
  id: string;
  date: string;
  symbol: string;
  reason: string;
  emotion: string;
  tradeType?: JournalTradeType;
  entry: number;
  exit: number;
  qty: number;
  outcome: number; // net P/L
  mistakes: string;
  learning: string;
  analysis?: string; // mentor's read at time of logging
}

export interface WatchItem {
  id: string;
  symbol: string;
  exchange: Exchange;
}

export interface RotationStock {
  id: string;
  symbol: string; // NSE trading symbol, used for live quotes
  name?: string; // display name
  qty: number; // target ("New Qty") after rebalance
  heldQty?: number; // current holding (0 for a fresh buy); Change = qty - heldQty
  addedPrice?: number; // avg buy / reference price (for P/L)
  lastPrice?: number; // last known price, fallback when live quotes unavailable
  exchange: Exchange;
}

export interface Strategy {
  id: string;
  name: string;
  sector?: string;
  indexSymbol?: string; // NSE index used as the basket's benchmark
  baselineDate?: string; // basket entry/snapshot date, anchors the benchmark baseline
  benchmarkEntry?: { level: number; date: string }; // index level when tracking began
  note?: string;
  createdAt: string;
  stocks: RotationStock[];
}

export interface MutualFund {
  id: string;
  name: string;
  category: string; // e.g. "Direct - Growth"
  nav: number;
  navChangePct?: number;
  units: number;
  avgBuyNav: number;
  currentInvestment: number;
  currentValue: number;
}

export interface Settings {
  capitalINR: number;
  capitalUSD: number;
  maxDailyLossPct: number;
  defaultBroker: Broker;
}

interface Store {
  holdings: Holding[];
  positions: Position[];
  journal: JournalEntry[];
  watchlist: WatchItem[];
  settings: Settings;
  tradebook: TradebookImport | null;
  setTradebook: (t: TradebookImport | null) => void;
  pnl: PnlImport | null;
  setPnl: (p: PnlImport | null) => void;
  vested: VestedSummary | null;
  setVested: (v: VestedSummary | null) => void;
  mutualFunds: MutualFund[];
  addFund: (f: Omit<MutualFund, "id">) => void;
  updateFund: (id: string, patch: Partial<MutualFund>) => void;
  removeFund: (id: string) => void;
  strategies: Strategy[];
  restoreBaskets: () => void;
  setStrategyStocks: (id: string, stocks: Omit<RotationStock, "id">[]) => void;
  addStrategyWithStocks: (s: {
    name: string;
    sector?: string;
    indexSymbol?: string;
    stocks: Omit<RotationStock, "id">[];
  }) => void;
  addStrategy: (name: string, sector?: string) => void;
  updateStrategy: (id: string, patch: Partial<Omit<Strategy, "id" | "stocks">>) => void;
  removeStrategy: (id: string) => void;
  addRotationStock: (strategyId: string, stock: Omit<RotationStock, "id">) => void;
  updateRotationStock: (strategyId: string, stockId: string, patch: Partial<RotationStock>) => void;
  removeRotationStock: (strategyId: string, stockId: string) => void;
  addWatch: (w: Omit<WatchItem, "id">) => void;
  removeWatch: (id: string) => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  sellHolding: (id: string, qty: number, exitPrice: number) => void;
  importHoldings: (rows: Omit<Holding, "id">[]) => void;
  replaceHoldings: (rows: Omit<Holding, "id">[], currency: "INR" | "USD") => void;
  updateHolding: (id: string, patch: Partial<Holding>) => void;
  removeHolding: (id: string) => void;
  addPosition: (p: Omit<Position, "id" | "openedAt" | "status">) => void;
  importPositions: (rows: Omit<Position, "id" | "openedAt" | "status">[]) => void;
  updatePosition: (id: string, patch: Partial<Position>) => void;
  closePosition: (id: string, exitPrice: number) => void;
  removePosition: (id: string) => void;
  convertToDelivery: (id: string) => void;
  addJournal: (j: Omit<JournalEntry, "id">) => void;
  removeJournal: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// Seed rotation baskets. Tuple: [symbol, name, targetQty (New Qty), fallbackPrice].
// heldQty and the entry (avg) price come from the user's actual holdings +
// positions (ownedBySymbol) so every tab shows the same exact numbers; the
// fallback price is only used when the stock isn't currently owned.
type Seed = [string, string, number, number];

const mkStocks = (rows: Seed[]): RotationStock[] => {
  const owned = ownedBySymbol();
  return rows.map(([symbol, name, qty, fallbackPrice]) => {
    const o = owned[symbol];
    return {
      id: uid(),
      symbol,
      name,
      qty,
      heldQty: o ? o.qty : 0,
      addedPrice: o ? o.avg : fallbackPrice,
      lastPrice: o ? o.ltp : fallbackPrice,
      exchange: "NSE" as const,
    };
  });
};

// Self-contained custom-portfolio basket: [symbol, name, shares, avgBuy, currentPrice].
// Held = shares (the basket's own holding), so P/L matches the broker portfolio
// exactly regardless of what else you own of that symbol.
type Portfolio = [string, string, number, number, number];

const mkPortfolio = (rows: Portfolio[]): RotationStock[] =>
  rows.map(([symbol, name, shares, avg, cur]) => ({
    id: uid(),
    symbol,
    name,
    qty: shares,
    heldQty: shares,
    addedPrice: avg,
    lastPrice: cur,
    exchange: "NSE" as const,
  }));

const seedStrategies = (): Strategy[] => [
  {
    id: uid(),
    name: "Pharma",
    sector: "Pharma & Healthcare",
    indexSymbol: "NIFTY PHARMA",
    baselineDate: "2026-07-30",
    createdAt: new Date().toISOString(),
    // Pharma Stars Tracker snapshot (30-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["AARTIPHARM", "Aarti Pharmalabs Ltd", 70, 861.49, 674.3],
      ["BLUEJET", "Blue Jet Healthcare Ltd", 53, 882.36, 612.45],
    ]),
  },
  {
    id: uid(),
    name: "Energy Stars",
    sector: "Energy",
    indexSymbol: "NIFTY ENERGY",
    baselineDate: "2026-07-30",
    createdAt: new Date().toISOString(),
    // Energy custom portfolio (30-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["THERMAX", "Thermax Limited", 5, 4374.8, 4251.5],
      ["SOTL", "Savita Oil Technologies Ltd", 35, 616.65, 588.1],
      ["ONGC", "Oil and Natural Gas Corporation Ltd", 85, 241.49, 241.59],
      ["NLCINDIA", "NLC India Ltd", 75, 295.83, 291.89],
      ["COALINDIA", "Coal India Ltd", 55, 416.11, 417.2],
      ["CHENNPETRO", "Chennai Petroleum Corporation Ltd", 20, 1211.75, 1238.2],
      ["AEGISLOG", "Aegis Logistics Ltd", 15, 1272.97, 1249.3],
      ["ADANIPOWER", "Adani Power Ltd", 100, 210.33, 208.97],
      ["ADANIENSOL", "Adani Energy Solutions Ltd", 15, 1665.43, 1659.0],
    ]),
  },
  {
    id: uid(),
    name: "Real Estate Stars",
    sector: "Real Estate",
    indexSymbol: "NIFTY REALTY",
    baselineDate: "2026-07-30",
    createdAt: new Date().toISOString(),
    // Real estate custom portfolio (30-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["GOLDBEES", "Nippon India ETF Gold BeES", 268, 117.86, 117.37],
      ["LODHA", "Lodha Developers Ltd", 21, 1231.83, 1287.15],
      ["PRESTIGE", "Prestige Estates Projects Ltd", 21, 1642.02, 1594.8],
      ["PHOENIXLTD", "Phoenix Mills Ltd", 12, 2006.98, 1887.9],
      ["OBEROIRLTY", "Oberoi Realty Ltd", 21, 1834.53, 1814.4],
      ["GODREJPROP", "Godrej Properties Ltd", 12, 2077.59, 2110.9],
      ["DLF", "DLF Ltd", 52, 653.52, 654.85],
      ["ANANTRAJ", "Anant Raj Ltd", 48, 606.53, 609.6],
      ["ABCAPITAL", "Aditya Birla Capital Ltd", 79, 395.46, 394.05],
      ["SOBHA", "Sobha Ltd", 21, 1368.16, 1344.4],
    ]),
  },
  {
    id: uid(),
    name: "Auto Stars",
    sector: "Auto",
    indexSymbol: "NIFTY AUTO",
    baselineDate: "2026-07-30",
    createdAt: new Date().toISOString(),
    // Auto Stars Tracker snapshot (30-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["UNIPARTS", "Uniparts India Ltd", 22, 704.63, 738.2],
      ["SJS", "SJS Enterprises Ltd", 7, 2352.87, 2359.0],
      ["SHRIPISTON", "SPR Auto Technologies Ltd", 4, 4279.85, 4339.5],
      ["SANSERA", "Sansera Engineering Ltd", 5, 3209.44, 3235.2],
      ["GABRIEL", "Gabriel India Ltd", 12, 1417.08, 1392.0],
      ["DIVGIITTS", "Divgi TorqTransfer Systems Ltd", 16, 962.4, 954.1],
      ["BHARATFORG", "Bharat Forge Ltd", 8, 2165.77, 2164.69],
      ["BELRISE", "Belrise Industries Ltd", 71, 229.72, 232.79],
      ["ATHERENERG", "Ather Energy Ltd", 13, 1230.06, 1240.9],
    ]),
  },
  {
    id: uid(),
    name: "Banking Beyond",
    sector: "Banking & Financials",
    indexSymbol: "NIFTY BANK",
    baselineDate: "2026-07-29",
    createdAt: new Date().toISOString(),
    // Banking Beyond Tracker (29-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["UNIONBANK", "Union Bank of India Ltd", 30, 170.92, 171.08],
      ["SBIN", "State Bank of India", 4, 1014.05, 1013.7],
      ["MAHABANK", "Bank of Maharashtra Ltd", 80, 80.53, 80.73],
      ["INDIANB", "Indian Bank", 6, 832.07, 827.7],
      ["CANBK", "Canara Bank Ltd", 52, 124.79, 124.72],
      ["BANKINDIA", "Bank of India Ltd", 56, 137.59, 137.65],
      ["BANKBARODA", "Bank of Baroda Ltd", 19, 243.59, 243.35],
      ["NORTHARC", "Northern ARC Capital Ltd", 11, 285.56, 288.8],
      ["LICHSGFIN", "LIC Housing Finance Ltd", 12, 552.17, 553.45],
      ["J&KBANK", "Jammu and Kashmir Bank Ltd", 21, 166.03, 154.63],
      ["HDBFS", "HDB Financial Services Ltd", 8, 681.02, 679.7],
      ["CREDITACC", "CreditAccess Grameen Ltd", 2, 1587.6, 1590.4],
      ["ABSLAMC", "Aditya Birla Sun Life AMC Ltd", 3, 1014.36, 1017.5],
    ]),
  },
  {
    id: uid(),
    name: "Metal Stars",
    sector: "Metals",
    indexSymbol: "NIFTY METAL",
    baselineDate: "2026-07-29",
    createdAt: new Date().toISOString(),
    // Metal Stars Tracker (29-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["WELCORP", "Welspun Corp Ltd", 6, 1694.11, 1697.0],
      ["NATIONALUM", "National Aluminium Co Ltd", 29, 344.3, 344.7],
      ["HINDALCO", "Hindalco Industries Ltd", 11, 961.67, 962.45],
      ["LLOYDSME", "Lloyds Metals and Energy Ltd", 5, 2052.04, 2051.3],
      ["ASHAPURMIN", "Ashapura Minechem Ltd", 15, 705.21, 707.7],
      ["JSWSTEEL", "JSW Steel Ltd", 8, 1277.2, 1276.59],
      ["IMFA", "Indian Metals and Ferro Alloys Ltd", 8, 1358.97, 1372.7],
      ["HINDCOPPER", "Hindustan Copper Ltd", 21, 481.34, 483.45],
      ["GOLDBEES", "Nippon India ETF Gold BeES", 88, 116.91, 116.85],
    ]),
  },
  {
    id: uid(),
    name: "Microcap Mavericks",
    sector: "Microcap",
    indexSymbol: "NIFTY MICROCAP 250",
    baselineDate: "2026-07-29",
    createdAt: new Date().toISOString(),
    // Microcap Mavericks Quant (29-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["VARROC", "Varroc Engineering Ltd", 10, 659.9, 664.55],
      ["SANSERA", "Sansera Engineering Ltd", 2, 3242.6, 3233.1],
      ["VAIBHAVGBL", "Vaibhav Global Ltd", 23, 267.93, 266.6],
      ["SHILPAMED", "Shilpa Medicare Ltd", 11, 605.17, 604.6],
      ["SFL", "Sheela Foam Ltd", 8, 793.5, 789.35],
      ["METROPOLIS", "Metropolis Healthcare Ltd", 11, 591.27, 591.6],
      ["LLOYDSENT", "Lloyds Enterprises Ltd", 80, 81.14, 80.37],
      ["GREAVESCOT", "Greaves Cotton Ltd", 26, 240.58, 239.64],
      ["DIACABS", "Diamond Power Infrastructure Ltd", 10, 331.0, 337.45],
      ["ASTRAMICRO", "Astra Microwave Products Ltd", 4, 1771.94, 1773.8],
    ]),
  },
];

const seedHoldings = (): Holding[] =>
  SEED_HOLDINGS.map((h) => ({
    id: uid(),
    symbol: h.symbol,
    exchange: "NSE" as const,
    broker: "zerodha" as const,
    qty: h.qty,
    avgPrice: h.avgPrice,
    currentPrice: h.currentPrice,
    type: "longterm" as const,
  }));

const seedPositions = (): Position[] =>
  SEED_POSITIONS.map((p) => ({
    id: uid(),
    symbol: p.symbol,
    exchange: "NSE" as const,
    broker: "zerodha" as const,
    qty: p.qty,
    entryPrice: p.entryPrice,
    currentPrice: p.currentPrice,
    targetProfit: 0,
    stopLoss: 0,
    openedAt: new Date().toISOString(),
    status: "open" as const,
  }));

// Seed mutual-fund holdings from the user's platform screenshots (27-Jul-2026).
const seedFunds = (): MutualFund[] =>
  (
    [
      ["Invesco India Focused Fund", "Direct - Growth", 32.13, 1.32, 21760.999, 28.57, 621800, 699180],
      ["Kotak Multicap Fund", "Direct - Growth", 21.8, 1.0, 26923.564, 20.51, 552336, 586933],
      ["HDFC Small Cap Fund", "Direct - Growth", 163.69, 1.83, 3754.593, 150.6, 565451, 614626],
    ] as [string, string, number, number, number, number, number, number][]
  ).map(([name, category, nav, navChangePct, units, avgBuyNav, currentInvestment, currentValue]) => ({
    id: uid(),
    name,
    category,
    nav,
    navChangePct,
    units,
    avgBuyNav,
    currentInvestment,
    currentValue,
  }));

// Auto Stars full exit on 3-Aug-2026 (broker batch, 9/9 filled, sell value
// ₹2,30,096). [symbol, qty, exitAvg, entryAvg(30-Jul basket)]. Entry uses the
// 30-Jul basket avg — gross ≈ ₹9,437; user-reported net after later batches and
// charges was ≈ ₹8,800.
const AUTO_EXIT: [string, number, number, number][] = [
  ["UNIPARTS", 34, 735.14, 704.63],
  ["SJS", 11, 2469.29, 2352.87],
  ["SHRIPISTON", 6, 4487.68, 4279.85],
  ["SANSERA", 8, 3443.82, 3209.44],
  ["GABRIEL", 17, 1512.39, 1417.08],
  ["DIVGIITTS", 25, 981.83, 962.4],
  ["BHARATFORG", 11, 2203.6, 2165.77],
  ["BELRISE", 105, 241.06, 229.72],
  ["ATHERENERG", 19, 1245.0, 1230.06],
];
const AUTO_EXIT_DATE = "2026-08-03";

const autoExitJournalEntry = (): JournalEntry => ({
  id: uid(),
  date: AUTO_EXIT_DATE,
  symbol: "AUTO STARS",
  reason: "Full basket exit — sector had been rising for days; took the profit",
  emotion: "Disciplined",
  tradeType: "Swing",
  entry: 221296,
  exit: 230096,
  qty: 1,
  outcome: 8800,
  mistakes: "Possibly exited a bit early while the sector was still trending up",
  learning:
    "Sold the auto sector portfolio completely and booked ~₹8,800 on the total investment (~4% in 4–5 days). " +
    "My read: it may have been slightly early — the sector was rising for many days — but the holding period was only 4–5 days, " +
    "so the annualised clip on this trade was excellent. Booking into strength is rarely a mistake; chasing back in emotionally would be.",
  analysis:
    "Exit record (3 Aug): UNIPARTS 34 @735.14 (+1,037) · SJS 11 @2,469 (+1,281) · SHRIPISTON 6 @4,488 (+1,247) · " +
    "SANSERA 8 @3,444 (+1,875) · GABRIEL 17 @1,512 (+1,620) · DIVGIITTS 25 @982 (+486) · BHARATFORG 11 @2,204 (+416) · " +
    "BELRISE 105 @241 (+1,191) · ATHERENERG 19 @1,245 (+284). Gross vs 30-Jul avgs ≈ ₹9,437; net reported ₹8,800.\n" +
    "\n" +
    "RE-ENTRY STRATEGY — the idea: you sold strength, so you only buy back on either (a) a small pullback into support that holds, " +
    "or (b) a clean breakout above your exit price. Never in between, and never on a gap-up open.\n" +
    "\n" +
    "WORKED EXAMPLE FOR TOMORROW — SANSERA (your biggest earner, exited @ ₹3,443.82):\n" +
    "1) Precondition: NIFTY AUTO verdict on the Rotation page is still 'Good buy' / 'Buy on dips'. If the sector flips Weak, skip the day.\n" +
    "2) Zone A (pullback buy): a 1–2% dip = ₹3,375–3,410. If price enters the zone and the first 15-min candle there holds above VWAP " +
    "(check the stock's drawer — look for a hammer/bullish engulfing rejecting the low), buy the FIRST HALF: ~7 shares @ ~₹3,400 (≈ ₹24k of the freed ₹2.3L).\n" +
    "3) Stop: ₹3,340 (below the zone, ~2%). Risk ≈ 7 × ₹60 = ₹420 — pocket change against the ₹8,800 banked.\n" +
    "4) Confirmation add: if it closes back above your exit ₹3,444, add the SECOND HALF (~7 more). Your avg ≈ ₹3,420 with the trend confirmed.\n" +
    "5) Target: ₹3,550–3,600 (the next 3–4.5% leg, matching this week's pace). That's roughly 2.5:1 reward-to-risk on the first tranche.\n" +
    "6) Zone B (breakout buy, if it never dips): only if a 15-min candle CLOSES above ₹3,460 on heavy volume — then buy half, stop at that candle's low. " +
    "If it gaps up >1% at the open instead, stand aside until it pulls back to VWAP and holds.\n" +
    "\n" +
    "Run the same template on GABRIEL (exit ₹1,512 → zone ₹1,482–1,497, stop ₹1,467, add above ₹1,520) and UNIPARTS " +
    "(exit ₹735 → zone ₹720–728, stop ₹713, add above ₹738). Two or three names max — not the full 9. " +
    "If none of the setups trigger tomorrow, that IS the strategy working: no setup, no trade.",
});

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      holdings: seedHoldings(),
      positions: seedPositions(),
      journal: [],
      watchlist: [],
      settings: { capitalINR: 200000, capitalUSD: 2000, maxDailyLossPct: 2, defaultBroker: "zerodha" },
      tradebook: null,
      setTradebook: (t) => set({ tradebook: t }),
      pnl: null,
      setPnl: (p) => set({ pnl: p }),
      // Seeded from the user's Vested holdings export (as of 20 Jul 2026).
      vested: { valueUSD: 9788.38, investedUSD: 11697.73, asOf: "20 Jul 2026" },
      setVested: (v) => set({ vested: v }),

      mutualFunds: seedFunds(),
      addFund: (f) => set((s) => ({ mutualFunds: [...s.mutualFunds, { ...f, id: uid() }] })),
      updateFund: (id, patch) =>
        set((s) => ({ mutualFunds: s.mutualFunds.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFund: (id) => set((s) => ({ mutualFunds: s.mutualFunds.filter((f) => f.id !== id) })),

      strategies: seedStrategies(),
      restoreBaskets: () =>
        set((s) => {
          const names = new Set(s.strategies.map((x) => x.name));
          const toAdd = seedStrategies().filter((seed) => !names.has(seed.name));
          return toAdd.length ? { strategies: [...s.strategies, ...toAdd] } : s;
        }),
      setStrategyStocks: (id, stocks) =>
        set((s) => ({
          strategies: s.strategies.map((st) =>
            st.id === id ? { ...st, stocks: stocks.map((x) => ({ ...x, id: uid() })) } : st
          ),
        })),
      addStrategyWithStocks: ({ name, sector, indexSymbol, stocks }) =>
        set((s) => ({
          strategies: [
            ...s.strategies,
            {
              id: uid(),
              name,
              sector,
              indexSymbol,
              createdAt: new Date().toISOString(),
              stocks: stocks.map((x) => ({ ...x, id: uid() })),
            },
          ],
        })),
      addStrategy: (name, sector) =>
        set((s) => ({
          strategies: [
            ...s.strategies,
            { id: uid(), name, sector, createdAt: new Date().toISOString(), stocks: [] },
          ],
        })),
      updateStrategy: (id, patch) =>
        set((s) => ({ strategies: s.strategies.map((st) => (st.id === id ? { ...st, ...patch } : st)) })),
      removeStrategy: (id) => set((s) => ({ strategies: s.strategies.filter((st) => st.id !== id) })),
      addRotationStock: (strategyId, stock) =>
        set((s) => ({
          strategies: s.strategies.map((st) =>
            st.id === strategyId ? { ...st, stocks: [...st.stocks, { ...stock, id: uid() }] } : st
          ),
        })),
      updateRotationStock: (strategyId, stockId, patch) =>
        set((s) => ({
          strategies: s.strategies.map((st) =>
            st.id === strategyId
              ? { ...st, stocks: st.stocks.map((x) => (x.id === stockId ? { ...x, ...patch } : x)) }
              : st
          ),
        })),
      removeRotationStock: (strategyId, stockId) =>
        set((s) => ({
          strategies: s.strategies.map((st) =>
            st.id === strategyId ? { ...st, stocks: st.stocks.filter((x) => x.id !== stockId) } : st
          ),
        })),

      addWatch: (w) =>
        set((s) =>
          s.watchlist.some((x) => x.symbol === w.symbol && x.exchange === w.exchange)
            ? s
            : { watchlist: [...s.watchlist, { ...w, id: uid() }] }
        ),
      removeWatch: (id) => set((s) => ({ watchlist: s.watchlist.filter((w) => w.id !== id) })),

      addHolding: (h) => set((s) => ({ holdings: [...s.holdings, { ...h, id: uid() }] })),
      // Sell (part of) a holding at an exit price. Reduces the holding and books
      // the sale as a closed position, so realized P&L flows into the sector
      // baskets and dashboard exactly like a closed trade.
      sellHolding: (id, qty, exitPrice) =>
        set((s) => {
          const h = s.holdings.find((x) => x.id === id);
          if (!h || qty <= 0 || exitPrice <= 0) return s;
          const sellQty = Math.min(qty, h.qty);
          const now = new Date().toISOString();
          const sale: Position = {
            id: uid(),
            symbol: h.symbol,
            exchange: h.exchange,
            broker: h.broker,
            qty: sellQty,
            entryPrice: h.avgPrice,
            currentPrice: exitPrice,
            targetProfit: 0,
            stopLoss: 0,
            openedAt: now,
            status: "closed",
            exitPrice,
            closedAt: now,
          };
          return {
            positions: [...s.positions, sale],
            holdings:
              sellQty >= h.qty
                ? s.holdings.filter((x) => x.id !== id)
                : s.holdings.map((x) => (x.id === id ? { ...x, qty: x.qty - sellQty } : x)),
          };
        }),
      importHoldings: (rows) =>
        set((s) => {
          const holdings = [...s.holdings];
          rows.forEach((r) => {
            const i = holdings.findIndex((h) => h.symbol === r.symbol && h.exchange === r.exchange);
            if (i >= 0) holdings[i] = { ...holdings[i], ...r };
            else holdings.push({ ...r, id: uid() });
          });
          return { holdings };
        }),
      // Replace the holdings for one market (INR or USD) wholesale with the
      // uploaded set, so names no longer in the file are dropped. The other
      // market's holdings are left untouched.
      replaceHoldings: (rows, currency) => {
        const isINR = (exch: Exchange) => exch === "NSE" || exch === "BSE";
        const inScope = (exch: Exchange) => (currency === "INR" ? isINR(exch) : !isINR(exch));
        set((s) => ({
          holdings: [
            ...s.holdings.filter((h) => !inScope(h.exchange)),
            ...rows.map((r) => ({ ...r, id: uid() })),
          ],
        }));
      },
      updateHolding: (id, patch) =>
        set((s) => ({ holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),
      removeHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),

      addPosition: (p) =>
        set((s) => ({
          positions: [
            ...s.positions,
            { ...p, id: uid(), openedAt: new Date().toISOString(), status: "open" as const },
          ],
        })),
      importPositions: (rows) =>
        set((s) => {
          const positions = [...s.positions];
          rows.forEach((r) => {
            const i = positions.findIndex((p) => p.symbol === r.symbol && p.status === "open");
            if (i >= 0) positions[i] = { ...positions[i], ...r };
            else
              positions.push({
                ...r,
                id: uid(),
                openedAt: new Date().toISOString(),
                status: "open" as const,
              });
          });
          return { positions };
        }),
      updatePosition: (id, patch) =>
        set((s) => ({ positions: s.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      closePosition: (id, exitPrice) =>
        set((s) => ({
          positions: s.positions.map((p) =>
            p.id === id
              ? { ...p, status: "closed" as const, exitPrice, closedAt: new Date().toISOString() }
              : p
          ),
        })),
      removePosition: (id) => set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),

      convertToDelivery: (id) => {
        const p = get().positions.find((x) => x.id === id);
        if (!p) return;
        set((s) => ({
          positions: s.positions.filter((x) => x.id !== id),
          holdings: [
            ...s.holdings,
            {
              id: uid(),
              symbol: p.symbol,
              exchange: p.exchange,
              broker: p.broker,
              qty: p.qty,
              avgPrice: p.entryPrice,
              currentPrice: p.currentPrice,
              type: "swing" as const,
            },
          ],
        }));
      },

      addJournal: (j) => set((s) => ({ journal: [{ ...j, id: uid() }, ...s.journal] })),
      removeJournal: (id) => set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: "trading-assistant",
      storage: createJSONStorage(() => localStorage),
      // Runs on every rehydration (independent of version): guarantees every
      // seeded basket (Pharma, Energy, Auto, Real Estate) is present, appending
      // any that a previously-saved state is missing, without touching the rest.
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<Store>;
        const merged = { ...currentState, ...p } as Store;
        const existing = merged.strategies ?? [];
        const names = new Set(existing.map((x) => x.name));
        const toAdd = seedStrategies().filter((seed) => !names.has(seed.name));
        merged.strategies = toAdd.length ? [...existing, ...toAdd] : existing;

        // Ensure the Auto Stars exit record (3-Aug-2026) exists on every load —
        // journal entry + booked closed positions — regardless of version state.
        const journal = merged.journal ?? [];
        if (!journal.some((j) => j.symbol === "AUTO STARS" && j.date === AUTO_EXIT_DATE)) {
          merged.journal = [autoExitJournalEntry(), ...journal];
        } else {
          // Keep the mentor's read current with the latest template (user edits
          // to learning/mistakes are preserved; only the analysis is refreshed).
          const latest = autoExitJournalEntry().analysis;
          merged.journal = journal.map((j) =>
            j.symbol === "AUTO STARS" && j.date === AUTO_EXIT_DATE ? { ...j, analysis: latest } : j
          );
        }
        const autoSyms = new Set(AUTO_EXIT.map(([s]) => s));
        const positions = merged.positions ?? [];
        const alreadyBooked = positions.some(
          (x) => x.status === "closed" && x.closedAt?.startsWith(AUTO_EXIT_DATE) && autoSyms.has(x.symbol)
        );
        if (!alreadyBooked) {
          merged.positions = [
            ...positions.filter((x) => !(x.status === "open" && autoSyms.has(x.symbol))),
            ...AUTO_EXIT.map(([symbol, qty, exitPrice, entryPrice]) => ({
              id: uid(),
              symbol,
              exchange: "NSE" as const,
              broker: "zerodha" as const,
              qty,
              entryPrice,
              currentPrice: exitPrice,
              targetProfit: 0,
              stopLoss: 0,
              openedAt: `${AUTO_EXIT_DATE}T09:15:00.000Z`,
              status: "closed" as const,
              exitPrice,
              closedAt: `${AUTO_EXIT_DATE}T15:15:00.000Z`,
            })),
          ];
        }
        return merged;
      },
      version: 15,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<Store>;
        // v2: ensure the seeded rotation baskets exist.
        if (version < 2) {
          const existing = state.strategies ?? [];
          const names = new Set(existing.map((s) => s.name));
          const merged = [...existing];
          for (const seed of seedStrategies()) if (!names.has(seed.name)) merged.push(seed);
          state.strategies = merged;
        }
        // v3: load the user's exact Kite holdings & positions, and sync each
        // basket's held qty + entry price to the real owned amounts.
        if (version < 3) {
          state.holdings = seedHoldings();
          state.positions = seedPositions();
          const owned = ownedBySymbol();
          state.strategies = (state.strategies ?? []).map((st) => ({
            ...st,
            stocks: st.stocks.map((x0) => {
              // correct the Savita Oil ticker persisted under the wrong symbol
              const x = x0.symbol === "SAVITAOIL" ? { ...x0, symbol: "SOTL" } : x0;
              const o = owned[x.symbol];
              return o ? { ...x, heldQty: o.qty, addedPrice: o.avg } : { ...x, heldQty: 0 };
            }),
          }));
        }
        // v4: append the Auto Stars basket if it isn't already there.
        if (version < 4) {
          const existing = state.strategies ?? [];
          if (!existing.some((s) => s.name === "Auto Stars")) {
            const auto = seedStrategies().find((s) => s.name === "Auto Stars");
            if (auto) state.strategies = [...existing, auto];
          }
        }
        // v5–v10: make sure EVERY seeded basket exists and matches its latest
        // custom-portfolio definition. Rebuild existing baskets by name (keeping
        // their id), append any that are missing (new sectors), and keep any
        // baskets the user created themselves.
        if (version < 10) {
          const existing = state.strategies ?? [];
          const byName = new Map(existing.map((s) => [s.name, s]));
          const seeds = seedStrategies();
          const seedNames = new Set(seeds.map((s) => s.name));
          const merged = seeds.map((seed) => {
            const cur = byName.get(seed.name);
            return cur ? { ...seed, id: cur.id } : seed;
          });
          for (const s of existing) if (!seedNames.has(s.name)) merged.push(s);
          state.strategies = merged;
        }
        // v15: refresh Kite holdings & positions from the latest export.
        if (version < 15) {
          state.holdings = seedHoldings();
          state.positions = seedPositions();
        }
        // v11 & v14: refresh the seeded mutual funds to the latest snapshot
        // values (match by name, keep id), keep any funds the user added.
        if (version < 11 || version < 14) {
          const funds = state.mutualFunds ?? [];
          const seeded = Object.fromEntries(seedFunds().map((f) => [f.name, f]));
          const names = new Set(funds.map((f) => f.name));
          const merged = funds.map((f) => (seeded[f.name] ? { ...seeded[f.name], id: f.id } : f));
          for (const s of seedFunds()) if (!names.has(s.name)) merged.push(s);
          state.mutualFunds = merged;
        }
        // v12: anchor seeded baskets to their snapshot dates and clear any
        // live-set benchmark baseline so it re-baselines from index history.
        if (version < 12) {
          const dates = Object.fromEntries(seedStrategies().map((s) => [s.name, s.baselineDate]));
          state.strategies = (state.strategies ?? []).map((st) =>
            dates[st.name] ? { ...st, baselineDate: dates[st.name], benchmarkEntry: undefined } : st
          );
        }
        // v13: record the Auto Stars full exit (3-Aug-2026) permanently —
        // closed positions book the realized P&L per stock, the open auto
        // positions are removed (they were sold), and the journal entry with
        // the user's views + the mentor plan is added.
        if (version < 13) {
          const autoSyms = new Set(AUTO_EXIT.map(([s]) => s));
          const positions = (state.positions ?? []).filter(
            (p) => !(p.status === "open" && autoSyms.has(p.symbol))
          );
          const alreadyBooked = positions.some(
            (p) => p.status === "closed" && p.closedAt?.startsWith(AUTO_EXIT_DATE) && autoSyms.has(p.symbol)
          );
          if (!alreadyBooked) {
            for (const [symbol, qty, exitPrice, entryPrice] of AUTO_EXIT) {
              positions.push({
                id: uid(),
                symbol,
                exchange: "NSE" as const,
                broker: "zerodha" as const,
                qty,
                entryPrice,
                currentPrice: exitPrice,
                targetProfit: 0,
                stopLoss: 0,
                openedAt: `${AUTO_EXIT_DATE}T09:15:00.000Z`,
                status: "closed" as const,
                exitPrice,
                closedAt: `${AUTO_EXIT_DATE}T15:15:00.000Z`,
              });
            }
          }
          state.positions = positions;
          const journal = state.journal ?? [];
          if (!journal.some((j) => j.symbol === "AUTO STARS" && j.date === AUTO_EXIT_DATE)) {
            state.journal = [autoExitJournalEntry(), ...journal];
          }
        }
        return state as Store;
      },
    }
  )
);
