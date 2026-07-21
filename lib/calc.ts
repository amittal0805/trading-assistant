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

/**
 * Intraday scalp on top of an existing holding.
 *
 * You sell `sellQty` shares high and buy the same quantity back lower the SAME
 * day. Because the net position returns to where it started, the core holding
 * (quantity AND average) is untouched — the round trip is booked as intraday
 * P/L equal to the sell-minus-buyback spread, less charges.
 *
 * `buyBackPrice` is optional: pass it once you know (or plan) the re-entry
 * price. Until then, the plan shows breakeven and target buy-back levels.
 */
export function scalpPlan(opts: {
  totalQty: number;
  avgPrice: number;
  sellPrice: number;
  sellQty: number;
  buyBackPrice?: number | null;
  broker: Broker;
  exchange: Exchange;
}) {
  const { totalQty, avgPrice, sellPrice, sellQty, buyBackPrice, broker, exchange } = opts;
  if (sellQty <= 0 || sellQty > totalQty || sellPrice <= 0 || avgPrice <= 0) return null;

  const sellValue = sellPrice * sellQty;

  // Core holding is unchanged by a completed round trip.
  const coreQty = totalQty;
  const coreAvg = avgPrice;

  // Breakeven buy-back: highest price you can re-buy at and still net >= 0 after
  // the intraday round-trip charges. Charges depend on the buy price, so iterate.
  let breakevenBuy = sellPrice;
  for (let i = 0; i < 30; i++) {
    const charges = roundTripCharges(
      { buyPrice: breakevenBuy, sellPrice, qty: sellQty, exchange, segment: "intraday" },
      broker
    );
    const next = sellPrice - charges.total / sellQty;
    if (Math.abs(next - breakevenBuy) < 1e-6) {
      breakevenBuy = next;
      break;
    }
    breakevenBuy = next;
  }

  // Target buy-back prices to net a given profit (charges included, iterated).
  const buyBackForNet = (targetNet: number) => {
    let price = sellPrice - targetNet / sellQty;
    for (let i = 0; i < 30; i++) {
      const charges = roundTripCharges(
        { buyPrice: price, sellPrice, qty: sellQty, exchange, segment: "intraday" },
        broker
      );
      const next = sellPrice - (targetNet + charges.total) / sellQty;
      if (Math.abs(next - price) < 1e-6) {
        price = next;
        break;
      }
      price = next;
    }
    return price;
  };

  // Ladder of buy-backs at small drops below the sell price → profit at each.
  const buyBackLevels = [0.25, 0.5, 1, 1.5, 2].map((dropPct) => {
    const price = sellPrice * (1 - dropPct / 100);
    const r = netPnl({ buyPrice: price, sellPrice, qty: sellQty, exchange, segment: "intraday" }, broker);
    return { dropPct, price, gross: r.gross, charges: r.charges.total, net: r.net };
  });

  // If a buy-back price is supplied, compute the realised round-trip result.
  let executed: {
    buyBackPrice: number;
    buyBackValue: number;
    grossProfit: number;
    charges: ReturnType<typeof netPnl>["charges"];
    netProfit: number;
    spreadPct: number;
    effectiveAvg: number; // core avg notionally reduced by booked profit across the position
  } | null = null;

  if (buyBackPrice && buyBackPrice > 0) {
    const r = netPnl(
      { buyPrice: buyBackPrice, sellPrice, qty: sellQty, exchange, segment: "intraday" },
      broker
    );
    executed = {
      buyBackPrice,
      buyBackValue: buyBackPrice * sellQty,
      grossProfit: r.gross,
      charges: r.charges,
      netProfit: r.net,
      spreadPct: ((sellPrice - buyBackPrice) / sellPrice) * 100,
      effectiveAvg: coreQty > 0 ? coreAvg - r.net / coreQty : coreAvg,
    };
  }

  return {
    coreQty,
    coreAvg,
    sellValue,
    breakevenBuy,
    targets: [250, 500, 1000].map((net) => ({ net, price: buyBackForNet(net) })),
    buyBackLevels,
    executed,
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
