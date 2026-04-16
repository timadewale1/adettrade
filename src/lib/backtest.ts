import { BacktestReport, BacktestTrade, CurrencyPair, MonteCarloReport, StrategyVariant, TradeDirection } from "@/lib/types";
import { roundTo } from "@/lib/utils";

type Candle = {
  datetime: string;
  high: number;
  low: number;
  close: number;
};

function toNumber(value: string) {
  return Number.parseFloat(value);
}

async function fetchBacktestCandles(pair: CurrencyPair, apiKey: string) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    pair,
  )}&interval=1h&outputsize=220&timezone=UTC&apikey=${apiKey}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Backtest candle request failed for ${pair}.`);
  }

  const payload = (await response.json()) as {
    values?: Array<{ datetime: string; high: string; low: string; close: string }>;
  };

  return (payload.values ?? []).map((item) => ({
    datetime: item.datetime,
    high: toNumber(item.high),
    low: toNumber(item.low),
    close: toNumber(item.close),
  }));
}

function strategyForCandle(index: number): StrategyVariant {
  const variants: StrategyVariant[] = [
    "Trend Continuation",
    "Breakout Expansion",
    "Pullback Reclaim",
    "Reversal Fade",
  ];
  return variants[index % variants.length];
}

function monteCarlo(trades: BacktestTrade[], startingBalance: number): MonteCarloReport {
  if (!trades.length) {
    return {
      iterations: 0,
      medianEndingBalance: startingBalance,
      worstEndingBalance: startingBalance,
      bestEndingBalance: startingBalance,
      ruinProbabilityPct: 0,
      summary: "Not enough trades for robustness testing.",
    };
  }

  const iterations = 250;
  const outcomes = trades.map((trade) => trade.pnl);
  const results: number[] = [];
  let ruinCount = 0;

  for (let run = 0; run < iterations; run += 1) {
    let balance = startingBalance;
    for (let i = 0; i < outcomes.length; i += 1) {
      const sampled = outcomes[Math.floor(Math.random() * outcomes.length)];
      balance += sampled;
      if (balance <= startingBalance * 0.65) {
        ruinCount += 1;
        break;
      }
    }
    results.push(roundTo(balance));
  }

  const sorted = [...results].sort((a, b) => a - b);
  const medianEndingBalance = sorted[Math.floor(sorted.length / 2)];
  const worstEndingBalance = sorted[0];
  const bestEndingBalance = sorted[sorted.length - 1];
  const ruinProbabilityPct = roundTo((ruinCount / iterations) * 100);

  return {
    iterations,
    medianEndingBalance,
    worstEndingBalance,
    bestEndingBalance,
    ruinProbabilityPct,
    summary: `Monte Carlo stress test ran ${iterations} paths with ${ruinProbabilityPct}% balance-ruin probability below 65% of start.`,
  };
}

function simulateTrades(pair: CurrencyPair, candles: Candle[], startingBalance = 100) {
  const chronological = [...candles].reverse();
  const trades: BacktestTrade[] = [];
  let balance = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let anchorStrategy: StrategyVariant = "Trend Continuation";

  for (let index = 30; index < chronological.length - 6; index += 6) {
    const strategy = strategyForCandle(index);
    anchorStrategy = strategy;
    const window = chronological.slice(index - 20, index);
    const entryCandle = chronological[index];
    const closes = window.map((candle) => candle.close);
    const trendUp = closes[closes.length - 1] > closes[0];
    const direction: TradeDirection =
      strategy === "Reversal Fade" ? (trendUp ? "SELL" : "BUY") : trendUp ? "BUY" : "SELL";
    const entry = entryCandle.close;
    const pipSize = pair.endsWith("JPY") ? 0.01 : 0.0001;
    const stopLossPips =
      strategy === "Breakout Expansion" ? 20 : strategy === "Reversal Fade" ? 12 : strategy === "Pullback Reclaim" ? 15 : 16;
    const riskReward = strategy === "Breakout Expansion" ? 2.1 : strategy === "Reversal Fade" ? 1.5 : 1.8;
    const takeProfitPips = Math.round(stopLossPips * riskReward);
    const stopLoss =
      direction === "BUY" ? entry - stopLossPips * pipSize : entry + stopLossPips * pipSize;
    const takeProfit =
      direction === "BUY" ? entry + takeProfitPips * pipSize : entry - takeProfitPips * pipSize;
    const riskAmount = balance * 0.01;

    let outcome: "WIN" | "LOSS" = "LOSS";

    for (const future of chronological.slice(index + 1, index + 7)) {
      if (direction === "BUY") {
        if (future.low <= stopLoss) {
          outcome = "LOSS";
          break;
        }
        if (future.high >= takeProfit) {
          outcome = "WIN";
          break;
        }
      } else {
        if (future.high >= stopLoss) {
          outcome = "LOSS";
          break;
        }
        if (future.low <= takeProfit) {
          outcome = "WIN";
          break;
        }
      }
    }

    const pnl = outcome === "WIN" ? riskAmount * riskReward : -riskAmount;
    balance = roundTo(balance + pnl);
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, peak ? ((peak - balance) / peak) * 100 : 0);

    if (pnl >= 0) grossProfit += pnl;
    else grossLoss += Math.abs(pnl);

    trades.push({
      index: trades.length + 1,
      direction,
      entry: roundTo(entry, pair.endsWith("JPY") ? 3 : 5),
      stopLoss: roundTo(stopLoss, pair.endsWith("JPY") ? 3 : 5),
      takeProfit: roundTo(takeProfit, pair.endsWith("JPY") ? 3 : 5),
      outcome,
      pnl: roundTo(pnl),
      balanceAfter: balance,
    });
  }

  const wins = trades.filter((trade) => trade.outcome === "WIN").length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const totalReturnPct = ((balance - startingBalance) / startingBalance) * 100;
  const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
  const monteCarloReport = monteCarlo(trades, startingBalance);

  const report: BacktestReport = {
    pair,
    timeframe: "1h",
    strategy: anchorStrategy,
    trades,
    startingBalance,
    endingBalance: roundTo(balance),
    totalReturnPct: roundTo(totalReturnPct),
    winRate: roundTo(winRate),
    maxDrawdownPct: roundTo(maxDrawdown),
    profitFactor: roundTo(profitFactor),
    sampleSize: trades.length,
    summary:
      trades.length > 0
        ? `${pair} backtest over ${trades.length} simulated trades produced ${roundTo(
            totalReturnPct,
          )}% return with ${roundTo(winRate)}% wins.`
        : `Backtest sample for ${pair} is too small right now.`,
    monteCarlo: monteCarloReport,
  };

  return report;
}

export async function getBacktestReport(pair: CurrencyPair) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  const candles = await fetchBacktestCandles(pair, apiKey);
  if (candles.length < 50) return null;
  return simulateTrades(pair, candles);
}
