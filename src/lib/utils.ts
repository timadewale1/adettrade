export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

export function pipSize(pair: string) {
  return pair.endsWith("JPY") ? 0.01 : 0.0001;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function scoreToBand(score: number) {
  if (score >= 88) return "Elite" as const;
  if (score >= 78) return "High" as const;
  if (score >= 68) return "Medium" as const;
  return "Low" as const;
}
