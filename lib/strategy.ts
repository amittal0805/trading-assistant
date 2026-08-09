// Portfolio strategy: allocate a total corpus across buckets (a concentrated
// stock, the rotation book, the flat booking, and FD), each with an expected
// return, and test whether the blend clears a target return on the whole
// corpus. Also reports the hurdle the non-FD buckets must clear, since FD drags
// the blend down. Deterministic and testable — not investment advice.

export type BucketKind = "equity" | "property" | "fd";

export interface BucketInput {
  key: string;
  name: string;
  planned: number; // ₹ allocated
  expReturnPct: number; // assumed annual return
  deployed: number; // ₹ actually deployed so far
  cap?: number; // optional max allocation
  kind: BucketKind;
}

export interface BucketRow extends BucketInput {
  sharePct: number; // planned as % of total
  expGain: number; // planned × return
  fillPct: number; // deployed / planned
  overCap: boolean;
}

export interface StrategyResult {
  total: number;
  targetPct: number;
  targetGain: number;
  plannedSum: number;
  unallocated: number; // total − plannedSum
  overAllocated: boolean;
  deployedTotal: number;
  blendedReturnPct: number; // expected return on the whole corpus
  blendedGain: number;
  gapPct: number; // blended − target
  meetsTarget: boolean;
  nonFdHurdlePct: number; // return the non-FD buckets must average to hit target
  rows: BucketRow[];
}

export function evalStrategy(total: number, targetPct: number, buckets: BucketInput[]): StrategyResult {
  const plannedSum = buckets.reduce((a, b) => a + b.planned, 0);
  const deployedTotal = buckets.reduce((a, b) => a + b.deployed, 0);
  const blendedGain = buckets.reduce((a, b) => a + (b.planned * b.expReturnPct) / 100, 0);
  const blendedReturnPct = total > 0 ? (blendedGain / total) * 100 : 0;
  const targetGain = (total * targetPct) / 100;

  const fdGain = buckets.filter((b) => b.kind === "fd").reduce((a, b) => a + (b.planned * b.expReturnPct) / 100, 0);
  const nonFdPlanned = buckets.filter((b) => b.kind !== "fd").reduce((a, b) => a + b.planned, 0);
  const nonFdHurdlePct = nonFdPlanned > 0 ? ((targetGain - fdGain) / nonFdPlanned) * 100 : 0;

  const rows: BucketRow[] = buckets.map((b) => ({
    ...b,
    sharePct: total > 0 ? (b.planned / total) * 100 : 0,
    expGain: (b.planned * b.expReturnPct) / 100,
    fillPct: b.planned > 0 ? (b.deployed / b.planned) * 100 : 0,
    overCap: b.cap != null && b.planned > b.cap,
  }));

  return {
    total,
    targetPct,
    targetGain,
    plannedSum,
    unallocated: total - plannedSum,
    overAllocated: plannedSum > total + 1,
    deployedTotal,
    blendedReturnPct,
    blendedGain,
    gapPct: blendedReturnPct - targetPct,
    meetsTarget: blendedGain >= targetGain - 1,
    nonFdHurdlePct,
    rows,
  };
}
