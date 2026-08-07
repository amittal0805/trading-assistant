// Staggered-deployment corpus projection. You don't put the whole corpus in at
// once — you deploy an initial slug, then feed the rest in tranches while the
// deployed money compounds at an assumed active-trading return and the idle
// reserve earns a low liquid-fund rate. Returns year-by-year values plus a
// money-weighted XIRR on the capital actually put to work.

export interface ProjInput {
  corpus: number; // total capital available (e.g. 2.5 Cr)
  initialDeploy: number; // deployed on day one (e.g. 1 Cr)
  trancheSize: number; // added each interval
  trancheEveryMonths: number; // interval between tranches
  years: number;
  annualReturnPct: number; // blended active-trading return on deployed capital
  reserveReturnPct: number; // idle corpus (liquid fund) return
}

export interface YearRow {
  year: number;
  deployed: number; // cumulative capital moved into the market
  marketValue: number; // value of the deployed/compounding book
  reserveValue: number; // idle capital not yet deployed
  total: number; // marketValue + reserveValue
  gain: number; // total − corpus (profit so far)
  returnOnDeployedPct: number; // marketValue/deployed − 1
}

export interface ProjResult {
  rows: YearRow[];
  endMarket: number;
  endReserve: number;
  endTotal: number;
  totalDeployed: number;
  totalGain: number;
  corpusCagr: number; // CAGR on the full corpus
  deployedXirr: number; // money-weighted IRR on capital put to work
  fullyDeployedMonth: number | null;
}

/** XIRR via Newton's method. cashflows: negative = money in, positive = value out. */
export function xirr(flows: { t: number; amt: number }[]): number {
  if (flows.length < 2) return 0;
  const npv = (r: number) => flows.reduce((s, f) => s + f.amt / Math.pow(1 + r, f.t), 0);
  const dnpv = (r: number) => flows.reduce((s, f) => s - (f.t * f.amt) / Math.pow(1 + r, f.t + 1), 0);
  let r = 0.15;
  for (let i = 0; i < 100; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (Math.abs(d) < 1e-9) break;
    const next = r - v / d;
    if (!isFinite(next)) break;
    if (Math.abs(next - r) < 1e-7) return next;
    r = Math.max(-0.99, next);
  }
  return r;
}

export function projectCorpus(input: ProjInput): ProjResult {
  const { corpus, years, trancheEveryMonths, annualReturnPct, reserveReturnPct } = input;
  const initialDeploy = Math.min(input.initialDeploy, corpus);
  const trancheSize = Math.max(0, input.trancheSize);
  const months = Math.max(1, Math.round(years * 12));
  const mMkt = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const mRes = Math.pow(1 + reserveReturnPct / 100, 1 / 12) - 1;

  let market = initialDeploy;
  let reserve = corpus - initialDeploy;
  let deployed = initialDeploy;
  let fullyDeployedMonth: number | null = reserve <= 0 ? 0 : null;

  const flows: { t: number; amt: number }[] = [{ t: 0, amt: -initialDeploy }];
  const rows: YearRow[] = [];

  for (let m = 1; m <= months; m++) {
    market *= 1 + mMkt;
    reserve *= 1 + mRes;
    // Deploy a tranche at each interval (not month 0).
    if (trancheEveryMonths > 0 && m % trancheEveryMonths === 0 && reserve > 0 && trancheSize > 0) {
      const add = Math.min(trancheSize, reserve);
      market += add;
      reserve -= add;
      deployed += add;
      flows.push({ t: m / 12, amt: -add });
      if (reserve <= 1 && fullyDeployedMonth === null) fullyDeployedMonth = m;
    }
    if (m % 12 === 0) {
      const total = market + reserve;
      rows.push({
        year: m / 12,
        deployed,
        marketValue: market,
        reserveValue: reserve,
        total,
        gain: total - corpus,
        returnOnDeployedPct: deployed > 0 ? (market / deployed - 1) * 100 : 0,
      });
    }
  }

  const endTotal = market + reserve;
  flows.push({ t: months / 12, amt: market }); // realise the market book at the end
  const deployedXirr = xirr(flows) * 100;
  const corpusCagr = (Math.pow(endTotal / corpus, 1 / years) - 1) * 100;

  return {
    rows,
    endMarket: market,
    endReserve: reserve,
    endTotal,
    totalDeployed: deployed,
    totalGain: endTotal - corpus,
    corpusCagr,
    deployedXirr,
    fullyDeployedMonth,
  };
}
