import { Broker, Exchange, Segment, netPnl, roundTripCharges } from "./charges";

/**
 * Solve for the sell price that yields `targetNet` profit after all charges.
 * Charges depend on sell price, so iterate to convergence.
 */
export function requiredExitPrice(opts: {
  buyPrice: number;
  qty: number;
  targetNet: number;
  broker: Broker;
  exchange: Exchange;
  segment: Segment;
  slippagePct?: number; // extra buffer added to required move
}) {
  const { buyPrice, qty, targetNet, broker, exchange, segment, slippagePct = 0 } = opts;
  if (qty <= 0 || buyPrice <= 0) return null;

  let sell = buyPrice + targetNet / qty;
  for (let i = 0; i < 20; i++) {
    const charges = roundTripCharges({ buyPrice, sellPrice: sell, qty, exchange, segment }, broker);
    const next = buyPrice + (targetNet + charges.total) / qty;
    if (Math.abs(next - sell) < 1e-6) {
      sell = next;
      break;
    }
    sell = next;
  }

  const withSlippage = sell * (1 + slippagePct / 100);
  const res = netPnl({ buyPrice, sellPrice: sell, qty, exchange, segment }, broker);
  return {
    exitPrice: sell,
    exitPriceWithSlippage: withSlippage,
    movePct: ((sell - buyPrice) / buyPrice) * 100,
    charges: res.charges,
    gross: res.gross,
    net: res.net,
  };
}

/** Max/ideal quantity for a desired profit given capital. */
export function quantityPlan(opts: {
  price: number;
  desiredProfit: number;
  capital: number;
  broker: Broker;
  exchange: Exchange;
  segment: Segment;
  capitalUsePct?: number; // ideal qty uses this % of capital
}) {
  const { price, desiredProfit, capital, broker, exchange, segment, capitalUsePct = 60 } = opts;
  if (price <= 0 || capital <= 0) return null;

  const maxQty = Math.floor(capital / price);
  const idealQty = Math.floor((capital * (capitalUsePct / 100)) / price);
  const plan = (qty: number) =>
    qty > 0 ? requiredExitPrice({ buyPrice: price, qty, targetNet: desiredProfit, broker, exchange, segment }) : null;

  return {
    maxQty,
    idealQty,
    max: plan(maxQty),
    ideal: plan(idealQty),
  };
}

export type AveragingStrategy = "conservative" | "balanced" | "aggressive";

/** Ladder of averaging buys as price dips below current average. */
export function averagingPlan(opts: {
  qty: number;
  avgPrice: number;
  currentPrice: number;
  availableCapital: number;
  strategy: AveragingStrategy;
}) {
  const { qty, avgPrice, currentPrice, availableCapital, strategy } = opts;
  if (qty <= 0 || avgPrice <= 0 || currentPrice <= 0) return null;

  const cfg = {
    conservative: { capitalPct: 20, steps: [1.5, 3, 5], sizeMult: [0.2, 0.3, 0.5] },
    balanced: { capitalPct: 40, steps: [1, 2, 3.5], sizeMult: [0.25, 0.35, 0.4] },
    aggressive: { capitalPct: 60, steps: [0.75, 1.5, 2.5], sizeMult: [0.3, 0.3, 0.4] },
  }[strategy];

  const budget = availableCapital * (cfg.capitalPct / 100);
  const base = currentPrice < avgPrice ? currentPrice : avgPrice;

  let runQty = qty;
  let runCost = qty * avgPrice;
  let spent = 0;

  const ladder = cfg.steps.map((dipPct, i) => {
    const price = base * (1 - dipPct / 100);
    const alloc = budget * cfg.sizeMult[i];
    const buyQty = Math.floor(alloc / price);
    const cost = buyQty * price;
    runQty += buyQty;
    runCost += cost;
    spent += cost;
    const newAvg = runCost / runQty;
    return {
      dipPct,
      price,
      buyQty,
      cost,
      cumulativeQty: runQty,
      newAvg,
      recoveryTarget: newAvg * 1.01, // ~1% above new average
    };
  });

  const dipFromAvg = ((avgPrice - currentPrice) / avgPrice) * 100;
  const totalExposure = runCost;
  const exposurePctOfCapital =
    availableCapital + qty * avgPrice > 0
      ? (totalExposure / (availableCapital + qty * avgPrice)) * 100
      : 0;

  return {
    ladder,
    budget,
    spent,
    finalQty: runQty,
    finalAvg: runCost / runQty,
    totalExposure,
    exposurePctOfCapital,
    dipFromAvg,
    suggestion:
      dipFromAvg > 8
        ? ("Deep drawdown — consider waiting or converting to delivery rather than averaging further." as const)
        : dipFromAvg > 4
        ? ("Significant dip — average cautiously or convert to delivery if conviction is long-term." as const)
        : ("Normal dip — averaging per ladder below is reasonable if thesis is intact." as const),
  };
}

/** Partial profit booking from an existing holding. */
export function scalpPlan(opts: {
  totalQty: number;
  avgPrice: number;
  currentPrice: number;
  sellQty: number;
  broker: Broker;
  exchange: Exchange;
}) {
  const { totalQty, avgPrice, currentPrice, sellQty, broker, exchange } = opts;
  if (sellQty <= 0 || sellQty > totalQty) return null;

  const res = netPnl(
    { buyPrice: avgPrice, sellPrice: currentPrice, qty: sellQty, exchange, segment: "delivery" },
    broker
  );
  const remainingQty = totalQty - sellQty;
  // Cost basis of remaining shares is unchanged (avg stays the same); but net
  // effective average falls if you treat booked profit as cost reduction:
  const effectiveAvg = remainingQty > 0 ? (avgPrice * totalQty - currentPrice * sellQty) / remainingQty : 0;

  const buyBackLevels = [2, 3, 5].map((dropPct) => {
    const price = currentPrice * (1 - dropPct / 100);
    const reQty = sellQty;
    const newQty = remainingQty + reQty;
    const newAvg = (remainingQty * avgPrice + reQty * price) / newQty;
    return { dropPct, price, reQty, newQty, newAvg };
  });

  return {
    grossProfit: res.gross,
    charges: res.charges,
    netProfit: res.net,
    remainingQty,
    avgUnchanged: avgPrice,
    effectiveAvg: Math.max(effectiveAvg, 0),
    nextTargets: [1, 2, 3].map((p) => currentPrice * (1 + p / 100)),
    buyBackLevels,
  };
}

/** Daily profit goal → trade plan. */
export function profitGoalPlan(opts: {
  dailyTarget: number;
  capital: number;
  riskPct: number; // max % of capital risked per day
  broker: Broker;
}) {
  const { dailyTarget, capital, riskPct } = opts;
  if (dailyTarget <= 0 || capital <= 0) return null;
  const trades = Math.max(2, Math.min(6, Math.ceil(dailyTarget / (capital * 0.005))));
  const perTrade = dailyTarget / trades;
  const maxDayLoss = capital * (riskPct / 100);
  const maxLossPerTrade = maxDayLoss / trades;
  return {
    trades,
    perTrade,
    maxDayLoss,
    maxLossPerTrade,
    riskReward: perTrade / maxLossPerTrade,
  };
}
