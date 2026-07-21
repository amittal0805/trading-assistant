"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Broker, Exchange } from "./charges";

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

export interface JournalEntry {
  id: string;
  date: string;
  symbol: string;
  reason: string;
  emotion: string;
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

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      holdings: [],
      positions: [],
      journal: [],
      watchlist: [],
      settings: { capitalINR: 200000, capitalUSD: 2000, maxDailyLossPct: 2, defaultBroker: "zerodha" },

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
    { name: "trading-assistant", storage: createJSONStorage(() => localStorage) }
  )
);
