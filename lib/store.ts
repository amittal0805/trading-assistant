"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Broker, Exchange } from "./charges";
import { TradebookResult } from "./tradebook";
import { SEED_HOLDINGS, SEED_POSITIONS, ownedBySymbol } from "./seedData";

export interface TradebookImport {
  fileName: string;
  importedAt: string;
  result: TradebookResult;
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
  addedPrice?: number; // reference price when added (for P/L)
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
  strategies: Strategy[];
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
      exchange: "NSE" as const,
    };
  });
};

const seedStrategies = (): Strategy[] => [
  {
    id: uid(),
    name: "Pharma",
    sector: "Pharma & Healthcare",
    indexSymbol: "NIFTY PHARMA",
    createdAt: new Date().toISOString(),
    stocks: mkStocks([
      ["VIJAYA", "Vijaya Diagnostic Centre Ltd", 9, 1313.9],
      ["THYROCARE", "Thyrocare Technologies Ltd", 20, 564.25],
      ["METROPOLIS", "Metropolis Healthcare Ltd", 20, 570.25],
      ["SAILIFE", "Sai Life Sciences Ltd", 9, 1232.9],
      ["LAURUSLABS", "Laurus Labs Ltd", 7, 1601.2],
      ["IOLCP", "IOL Chemicals and Pharmaceuticals Ltd", 76, 149.22],
      ["EMCURE", "Emcure Pharmaceuticals Ltd", 6, 1881.0],
      ["JLHL", "Jupiter Life Line Hospitals Ltd", 35, 323.2],
      ["ASTERDM", "Aster DM Quality Care Ltd", 14, 785.65],
    ]),
  },
  {
    id: uid(),
    name: "Energy Stars",
    sector: "Energy",
    indexSymbol: "NIFTY ENERGY",
    createdAt: new Date().toISOString(),
    stocks: mkStocks([
      ["THERMAX", "Thermax Limited", 2, 4514.0],
      ["SOTL", "Savita Oil Technologies Ltd", 12, 645.75],
      ["ONGC", "Oil and Natural Gas Corporation Ltd", 31, 248.76],
      ["NLCINDIA", "NLC India Ltd", 27, 292.8],
      ["COALINDIA", "Coal India Ltd", 19, 427.4],
      ["CHENNPETRO", "Chennai Petroleum Corporation Ltd", 7, 1214.8],
      ["AEGISLOG", "Aegis Logistics Ltd", 6, 1349.6],
      ["ADANIPOWER", "Adani Power Ltd", 37, 213.66],
      ["ADANIENSOL", "Adani Energy Solutions Ltd", 5, 1702.2],
    ]),
  },
  {
    id: uid(),
    name: "Real Estate Stars",
    sector: "Real Estate",
    indexSymbol: "NIFTY REALTY",
    createdAt: new Date().toISOString(),
    // Target ("New Qty") from the rebalance screenshots; held comes from actuals.
    stocks: mkStocks([
      ["LODHA", "Lodha Developers Ltd", 29, 1144.09],
      ["GOLDBEES", "Nippon India ETF Gold BeES", 289, 117.91],
      ["PRESTIGE", "Prestige Estates Projects Ltd", 21, 1592.8],
      ["PHOENIXLTD", "Phoenix Mills Ltd", 17, 2010.7],
      ["OBEROIRLTY", "Oberoi Realty Ltd", 18, 1821.2],
      ["GODREJPROP", "Godrej Properties Ltd", 17, 2028.7],
      ["DLF", "DLF Ltd", 52, 645.2],
      ["ANANTRAJ", "Anant Raj Ltd", 57, 586.54],
      ["ABREL", "Aditya Birla Real Estate Ltd", 24, 1374.2],
      ["SOBHA", "Sobha Ltd", 0, 1362.3],
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

      strategies: seedStrategies(),
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
      version: 3,
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
        return state as Store;
      },
    }
  )
);
