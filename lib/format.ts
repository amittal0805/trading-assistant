export function fmtMoney(v: number, currency: "INR" | "USD" = "INR", digits = 2) {
  if (!isFinite(v)) return "—";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(v);
}

export function fmtNum(v: number, digits = 2) {
  if (!isFinite(v)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(v);
}

export function fmtPct(v: number, digits = 2) {
  if (!isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function pnlClass(v: number) {
  return v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-zinc-400";
}

export function currencyFor(exchange: string): "INR" | "USD" {
  return exchange === "NYSE" || exchange === "NASDAQ" ? "USD" : "INR";
}
