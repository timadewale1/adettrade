import { AccountAnalytics, TradeHistoryEntry } from "@/lib/types";
import { roundTo } from "@/lib/utils";

export function getAccountAnalytics(history: TradeHistoryEntry[]): AccountAnalytics {
  const wins = history.filter((trade) => trade.status === "WON").length;
  const losses = history.filter((trade) => trade.status === "LOST").length;
  const cancelled = history.filter((trade) => trade.status === "CANCELLED").length;
  const totalTrades = history.length;
  const netPnl = roundTo(history.reduce((sum, trade) => sum + trade.actualPnl, 0));

  let peak = 0;
  let currentDrawdown = 0;
  let lossStreak = 0;
  let longestLossStreak = 0;

  for (const trade of [...history].reverse()) {
    peak = Math.max(peak, trade.resultingBalance);
    if (peak > 0) {
      currentDrawdown = Math.max(currentDrawdown, ((peak - trade.resultingBalance) / peak) * 100);
    }

    if (trade.status === "LOST") {
      lossStreak += 1;
      longestLossStreak = Math.max(longestLossStreak, lossStreak);
    } else {
      lossStreak = 0;
    }
  }

  return {
    totalTrades,
    wins,
    losses,
    cancelled,
    winRate: totalTrades ? roundTo((wins / totalTrades) * 100) : 0,
    netPnl,
    currentDrawdown: roundTo(currentDrawdown),
    longestLossStreak,
  };
}
