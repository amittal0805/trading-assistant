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
  note?: string;
  createdAt: string;
  stocks: RotationStock[];
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
  strategies: Strategy[];
  restoreBaskets: () => void;
  addStrategy: (name: string, sector?: string) => void;
  updateStrategy: (id: string, patch: Partial<Omit<Strategy, "id" | "stocks">>) => void;
  removeStrategy: (id: string) => void;
  addRotationStock: (strategyId: string, stock: Omit<RotationStock, "id">) => void;
  updateRotationStock: (strategyId: string, stockId: string, patch: Partial<RotationStock>) => void;
  removeRotationStock: (strategyId: string, stockId: string) => void;
  addWatch: (w: Omit<WatchItem, "id">) => void;
  removeWatch: (id: string) => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  importHoldings: (rows: Omit<Holding, "id">[]) => void;
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
    createdAt: new Date().toISOString(),
    // Custom portfolio snapshot (27-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["VIJAYA", "Vijaya Diagnostic Centre Ltd", 4, 1336.5, 1350.8],
      ["THYROCARE", "Thyrocare Technologies Ltd", 9, 592.0, 584.04],
      ["METROPOLIS", "Metropolis Healthcare Ltd", 9, 586.85, 577.35],
      ["SAILIFE", "Sai Life Sciences Ltd", 4, 1247.4, 1287.0],
      ["LAURUSLABS", "Laurus Labs Ltd", 3, 1651.9, 1713.4],
      ["IOLCP", "IOL Chemicals and Pharmaceuticals Ltd", 37, 151.28, 151.46],
      ["EMCURE", "Emcure Pharmaceuticals Ltd", 3, 1895.7, 1924.8],
      ["JLHL", "Jupiter Life Line Hospitals Ltd", 17, 319.09, 327.0],
      ["ASTERDM", "Aster DM Quality Care Ltd", 7, 795.5, 801.5],
    ]),
  },
  {
    id: uid(),
    name: "Energy Stars",
    sector: "Energy",
    indexSymbol: "NIFTY ENERGY",
    createdAt: new Date().toISOString(),
    // Custom portfolio snapshot (27-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["THERMAX", "Thermax Limited", 1, 4459.5, 4454.5],
      ["SOTL", "Savita Oil Technologies Ltd", 7, 637.75, 649.35],
      ["ONGC", "Oil and Natural Gas Corporation Ltd", 17, 245.48, 238.56],
      ["NLCINDIA", "NLC India Ltd", 15, 296.0, 298.45],
      ["COALINDIA", "Coal India Ltd", 11, 426.6, 427.5],
      ["CHENNPETRO", "Chennai Petroleum Corporation Ltd", 4, 1189.7, 1168.8],
      ["AEGISLOG", "Aegis Logistics Ltd", 3, 1313.5, 1291.3],
      ["ADANIPOWER", "Adani Power Ltd", 20, 215.45, 213.96],
      ["ADANIENSOL", "Adani Energy Solutions Ltd", 3, 1710.0, 1703.3],
    ]),
  },
  {
    id: uid(),
    name: "Real Estate Stars",
    sector: "Real Estate",
    indexSymbol: "NIFTY REALTY",
    createdAt: new Date().toISOString(),
    // Custom portfolio snapshot (27-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["GOLDBEES", "Nippon India ETF Gold BeES", 140, 118.63, 118.62],
      ["LODHA", "Lodha Developers Ltd", 11, 1182.33, 1198.7],
      ["PRESTIGE", "Prestige Estates Projects Ltd", 11, 1627.51, 1644.6],
      ["PHOENIXLTD", "Phoenix Mills Ltd", 7, 2038.35, 2036.6],
      ["OBEROIRLTY", "Oberoi Realty Ltd", 11, 1838.7, 1832.6],
      ["GODREJPROP", "Godrej Properties Ltd", 7, 2042.98, 2078.8],
      ["DLF", "DLF Ltd", 27, 646.62, 650.9],
      ["ANANTRAJ", "Anant Raj Ltd", 26, 598.76, 616.9],
      ["ABCAPITAL", "Aditya Birla Capital Ltd", 41, 397.49, 400.45],
      ["SOBHA", "Sobha Ltd", 11, 1379.85, 1361.2],
    ]),
  },
  {
    id: uid(),
    name: "Auto Stars",
    sector: "Auto",
    indexSymbol: "NIFTY AUTO",
    createdAt: new Date().toISOString(),
    // Auto Stars Tracker snapshot (27-Jul-2026): [symbol, name, shares, avgBuy, current].
    stocks: mkPortfolio([
      ["UNIPARTS", "Uniparts India Ltd", 6, 699.0, 704.8],
      ["SJS", "SJS Enterprises Ltd", 2, 2355.5, 2419.3],
      ["SHRIPISTON", "SPR Auto Technologies Ltd", 1, 4258.0, 4241.8],
      ["SANSERA", "Sansera Engineering Ltd", 1, 3260.0, 3273.0],
      ["GABRIEL", "Gabriel India Ltd", 3, 1411.9, 1437.8],
      ["DIVGIITTS", "Divgi TorqTransfer Systems Ltd", 4, 967.15, 962.35],
      ["BHARATFORG", "Bharat Forge Ltd", 2, 2171.69, 2181.3],
      ["BELRISE", "Belrise Industries Ltd", 18, 228.64, 232.66],
      ["ATHERENERG", "Ather Energy Ltd", 3, 1211.4, 1214.9],
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

      strategies: seedStrategies(),
      restoreBaskets: () =>
        set((s) => {
          const names = new Set(s.strategies.map((x) => x.name));
          const toAdd = seedStrategies().filter((seed) => !names.has(seed.name));
          return toAdd.length ? { strategies: [...s.strategies, ...toAdd] } : s;
        }),
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
        return merged;
      },
      version: 8,
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
        // v5–v8: make sure EVERY seeded basket exists and matches its corrected
        // custom-portfolio definition. Rebuild existing baskets by name (keeping
        // their id), append any that are missing (e.g. Auto Stars), and keep any
        // baskets the user created themselves.
        if (version < 8) {
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
        return state as Store;
      },
    }
  )
);
