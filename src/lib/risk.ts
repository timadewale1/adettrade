import { TradeHistoryEntry } from "@/lib/types";
import { clamp, roundTo } from "@/lib/utils";

export function deriveRiskPercent(balance: number, history: TradeHistoryEntry[] = []) {
  let base =
    balance < 50 ? 0.5 : balance < 150 ? 0.75 : balance < 500 ? 1 : balance < 2000 ? 1.25 : 1.5;

  const recentResolved = history.filter((trade) => trade.status !== "CANCELLED").slice(0, 5);
  const recentLosses = recentResolved.filter((trade) => trade.status === "LOST").length;
  const lastThree = recentResolved.slice(0, 3);
  const losingStreak = lastThree.length === 3 && lastThree.every((trade) => trade.status === "LOST");
  const recentWins = recentResolved.filter((trade) => trade.status === "WON").length;

  if (recentLosses >= 3) {
    base -= 0.35;
  }

  if (losingStreak) {
    base -= 0.25;
  }

  if (recentWins >= 4 && recentLosses === 0) {
    base += 0.1;
  }

  return clamp(roundTo(base, 2), 0.25, 1.5);
}

export function calculateLotSize({
  balance,
  riskPercent,
  stopLossPips,
}: {
  balance: number;
  riskPercent: number;
  stopLossPips: number;
}) {
  const riskAmount = roundTo(balance * (riskPercent / 100));
  const pipValuePerStandardLot = 10;
  const rawLots = riskAmount / (stopLossPips * pipValuePerStandardLot);
  const steppedLots = Math.floor(rawLots * 100) / 100;

  return {
    riskAmount,
    lotSize: clamp(roundTo(steppedLots, 2), 0.01, 100),
  };
}

export function calculateCurrentDrawdown(balance: number, history: TradeHistoryEntry[] = []) {
  const balances = [balance, ...history.map((trade) => trade.resultingBalance)].reverse();
  let peak = balances[0] ?? balance;
  let maxDrawdown = 0;

  for (const point of balances) {
    peak = Math.max(peak, point);
    const drawdown = peak === 0 ? 0 : ((peak - point) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return roundTo(maxDrawdown, 2);
}
