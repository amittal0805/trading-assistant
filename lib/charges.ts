// Charge schedules. Rates are configurable defaults (verify against your broker's
// latest published schedule — these change over time).

export type Broker = "zerodha" | "vested";
export type Segment = "intraday" | "delivery";
export type Exchange = "NSE" | "BSE" | "NYSE" | "NASDAQ";

export interface ChargeBreakdown {
  brokerage: number;
  stt: number; // STT (IN) or SEC fee (US)
  exchange: number; // exchange txn charges (IN) or FINRA TAF (US)
  gst: number;
  sebi: number;
  stampDuty: number;
  dp: number; // DP charge on delivery sell (Zerodha)
  total: number;
  currency: "INR" | "USD";
}

export interface ZerodhaRates {
  intradayBrokeragePct: number; // % of turnover per order
  intradayBrokerageCap: number; // ₹ cap per order
  deliveryBrokerage: number;
  sttIntradaySellPct: number;
  sttDeliveryPct: number; // each side
  exchangeNsePct: number;
  exchangeBsePct: number;
  sebiPct: number;
  stampIntradayPct: number; // buy side
  stampDeliveryPct: number; // buy side
  gstPct: number;
  dpChargePerSell: number; // ₹ per scrip per day, on delivery sell (incl. GST)
}

export const DEFAULT_ZERODHA: ZerodhaRates = {
  intradayBrokeragePct: 0.03,
  intradayBrokerageCap: 20,
  deliveryBrokerage: 0,
  sttIntradaySellPct: 0.025,
  sttDeliveryPct: 0.1,
  exchangeNsePct: 0.00307, // NSE transaction charges (zerodha.com/charges)
  exchangeBsePct: 0.00375, // BSE transaction charges
  sebiPct: 0.0001, // ₹10 / crore
  stampIntradayPct: 0.003, // buy side
  stampDeliveryPct: 0.015, // buy side
  gstPct: 18, // on brokerage + SEBI + transaction charges
  dpChargePerSell: 15.34, // ₹3.5 CDSL + ₹9.5 Zerodha + ₹2.34 GST, per scrip on sell
};

export interface VestedRates {
  commissionPerTrade: number; // USD flat per order
  secFeePerMillion: number; // USD per $1M of sell value
  finraTafPerShare: number; // USD per share sold
  finraTafCap: number; // USD cap per trade
}

export const DEFAULT_VESTED: VestedRates = {
  commissionPerTrade: 0,
  secFeePerMillion: 27.8,
  finraTafPerShare: 0.000166,
  finraTafCap: 8.3,
};

export interface TradeLeg {
  buyPrice: number;
  sellPrice: number;
  qty: number;
  exchange: Exchange;
  segment: Segment;
}

export function zerodhaCharges(
  { buyPrice, sellPrice, qty, exchange, segment }: TradeLeg,
  r: ZerodhaRates = DEFAULT_ZERODHA
): ChargeBreakdown {
  const buyVal = buyPrice * qty;
  const sellVal = sellPrice * qty;
  const turnover = buyVal + sellVal;

  let brokerage: number;
  let stt: number;
  let stamp: number;
  let dp = 0;

  if (segment === "intraday") {
    brokerage =
      Math.min((r.intradayBrokeragePct / 100) * buyVal, r.intradayBrokerageCap) +
      Math.min((r.intradayBrokeragePct / 100) * sellVal, r.intradayBrokerageCap);
    stt = (r.sttIntradaySellPct / 100) * sellVal;
    stamp = (r.stampIntradayPct / 100) * buyVal;
  } else {
    brokerage = r.deliveryBrokerage * 2;
    stt = (r.sttDeliveryPct / 100) * (buyVal + sellVal);
    stamp = (r.stampDeliveryPct / 100) * buyVal;
    dp = r.dpChargePerSell;
  }

  const exchPct = exchange === "BSE" ? r.exchangeBsePct : r.exchangeNsePct;
  const exch = (exchPct / 100) * turnover;
  const sebi = (r.sebiPct / 100) * turnover;
  const gst = (r.gstPct / 100) * (brokerage + exch + sebi);

  const total = brokerage + stt + exch + sebi + gst + stamp + dp;
  return { brokerage, stt, exchange: exch, gst, sebi, stampDuty: stamp, dp, total, currency: "INR" };
}

export function vestedCharges(
  { sellPrice, qty }: TradeLeg,
  r: VestedRates = DEFAULT_VESTED
): ChargeBreakdown {
  const sellVal = sellPrice * qty;
  const brokerage = r.commissionPerTrade * 2;
  const sec = (r.secFeePerMillion / 1_000_000) * sellVal;
  const taf = Math.min(r.finraTafPerShare * qty, r.finraTafCap);
  const total = brokerage + sec + taf;
  return { brokerage, stt: sec, exchange: taf, gst: 0, sebi: 0, stampDuty: 0, dp: 0, total, currency: "USD" };
}

export function roundTripCharges(leg: TradeLeg, broker: Broker): ChargeBreakdown {
  return broker === "zerodha" ? zerodhaCharges(leg) : vestedCharges(leg);
}

/** Net P/L after all charges for a completed round trip. */
export function netPnl(leg: TradeLeg, broker: Broker) {
  const gross = (leg.sellPrice - leg.buyPrice) * leg.qty;
  const charges = roundTripCharges(leg, broker);
  return { gross, charges, net: gross - charges.total };
}
