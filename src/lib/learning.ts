import {
  ConfidenceCalibration,
  CurrencyPair,
  LearningInsight,
  LearningSummary,
  MarketSession,
  SignalJournalEntry,
  StrategyInsight,
  StrategyVariant,
  TimeBucketInsight,
} from "@/lib/types";
import { roundTo } from "@/lib/utils";

function resolvedEntries(journal: SignalJournalEntry[]) {
  return journal.filter((entry) => entry.status === "WON" || entry.status === "LOST");
}

function aggregate<T extends string>(entries: SignalJournalEntry[], selector: (entry: SignalJournalEntry) => T) {
  const map = new Map<T, { trades: number; wins: number; netPnl: number; confidenceTotal: number }>();

  for (const entry of entries) {
    const key = selector(entry);
    const current = map.get(key) ?? { trades: 0, wins: 0, netPnl: 0, confidenceTotal: 0 };
    current.trades += 1;
    current.wins += entry.status === "WON" ? 1 : 0;
    current.netPnl += entry.pnl ?? 0;
    current.confidenceTotal += entry.confidenceScore;
    map.set(key, current);
  }

  return map;
}

function sortByEdge<T extends { trades: number; winRate: number; netPnl: number }>(items: T[]) {
  return items.sort((a, b) => b.netPnl - a.netPnl || b.winRate - a.winRate || b.trades - a.trades);
}

function toPairInsights(entries: SignalJournalEntry[]): LearningInsight[] {
  return sortByEdge(
    [...aggregate(entries, (entry) => entry.pair).entries()].map(([pair, value]) => ({
      pair,
      session: "London" as MarketSession,
      trades: value.trades,
      winRate: value.trades ? roundTo((value.wins / value.trades) * 100) : 0,
      netPnl: roundTo(value.netPnl),
      avgConfidence: value.trades ? roundTo(value.confidenceTotal / value.trades) : 0,
    })),
  );
}

function toSessionInsights(entries: SignalJournalEntry[]): LearningInsight[] {
  return sortByEdge(
    [...aggregate(entries, (entry) => entry.session).entries()].map(([session, value]) => ({
      pair: "EUR/USD" as CurrencyPair,
      session,
      trades: value.trades,
      winRate: value.trades ? roundTo((value.wins / value.trades) * 100) : 0,
      netPnl: roundTo(value.netPnl),
      avgConfidence: value.trades ? roundTo(value.confidenceTotal / value.trades) : 0,
    })),
  );
}

function toStrategyInsights(entries: SignalJournalEntry[]): StrategyInsight[] {
  return sortByEdge(
    [...aggregate(entries, (entry) => entry.strategy).entries()].map(([strategy, value]) => ({
      strategy,
      trades: value.trades,
      winRate: value.trades ? roundTo((value.wins / value.trades) * 100) : 0,
      netPnl: roundTo(value.netPnl),
    })),
  );
}

function toBucketInsights<T extends string>(entries: SignalJournalEntry[], selector: (entry: SignalJournalEntry) => T) {
  return sortByEdge(
    [...aggregate(entries, selector).entries()].map(([label, value]) => ({
      label,
      trades: value.trades,
      winRate: value.trades ? roundTo((value.wins / value.trades) * 100) : 0,
      netPnl: roundTo(value.netPnl),
    })),
  );
}

export function getLearningSummary(journal: SignalJournalEntry[]): LearningSummary {
  const resolved = resolvedEntries(journal);
  const pairLeaders = toPairInsights(resolved).slice(0, 4);
  const sessionLeaders = toSessionInsights(resolved).slice(0, 4);
  const strategyLeaders = toStrategyInsights(resolved).slice(0, 4);
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdayLeaders = toBucketInsights(resolved, (entry) => weekdayLabels[entry.weekday] ?? "N/A").slice(0, 4);
  const hourLeaders = toBucketInsights(resolved, (entry) => `${entry.hourUtc}:00 UTC`).slice(0, 6);
  const bestPair = pairLeaders[0]?.pair ?? null;
  const bestSession = sessionLeaders[0]?.session ?? null;

  let recommendation = "Not enough resolved trades yet to bias the engine toward a specific pair or session.";
  if (bestPair && bestSession && strategyLeaders[0]) {
    recommendation = `Current live edge is strongest on ${bestPair}, during ${bestSession}, using ${strategyLeaders[0].strategy}.`;
  } else if (bestPair && bestSession) {
    recommendation = `Current live edge is strongest on ${bestPair} during the ${bestSession} session.`;
  }

  return {
    pairLeaders,
    sessionLeaders,
    strategyLeaders,
    weekdayLeaders,
    hourLeaders,
    bestPair,
    bestSession,
    recommendation,
  };
}

export function getPerformanceBoost({
  pair,
  session,
  strategy,
  weekday,
  hourUtc,
  journal,
}: {
  pair: CurrencyPair;
  session: MarketSession;
  strategy: StrategyVariant;
  weekday: number;
  hourUtc: number;
  journal: SignalJournalEntry[];
}) {
  const resolved = resolvedEntries(journal);
  const buckets = [
    resolved.filter((entry) => entry.pair === pair),
    resolved.filter((entry) => entry.session === session),
    resolved.filter((entry) => entry.strategy === strategy),
    resolved.filter((entry) => entry.weekday === weekday),
    resolved.filter((entry) => entry.hourUtc === hourUtc),
  ];

  const boost = buckets.reduce((sum, entries, index) => {
    if (entries.length < (index < 3 ? 3 : 2)) {
      return sum;
    }

    const wins = entries.filter((entry) => entry.status === "WON").length;
    const net = entries.reduce((running, entry) => running + (entry.pnl ?? 0), 0);
    const winRate = wins / entries.length;
    return sum + Math.max(-3, Math.min(index === 2 ? 4 : 3, net * 1.5 + winRate * 3 - 1.5));
  }, 0);

  return roundTo(boost);
}

export function getConfidenceCalibration(
  journal: SignalJournalEntry[],
  confidenceScore: number,
): ConfidenceCalibration {
  const resolved = resolvedEntries(journal);
  const lower = Math.max(0, confidenceScore - 5);
  const upper = Math.min(100, confidenceScore + 5);
  const sample = resolved.filter(
    (entry) => entry.confidenceScore >= lower && entry.confidenceScore <= upper,
  );
  const wins = sample.filter((entry) => entry.status === "WON").length;
  const observedWinRate = sample.length ? roundTo((wins / sample.length) * 100) : null;
  const expectedBand = confidenceScore >= 85 ? "Elite" : confidenceScore >= 75 ? "High" : confidenceScore >= 65 ? "Medium" : "Low";
  const summary = sample.length
    ? `${sample.length} similar-confidence setups produced ${observedWinRate}% wins historically.`
    : "Calibration sample is still too small for this confidence band.";

  return {
    sampleSize: sample.length,
    observedWinRate,
    expectedBand,
    summary,
  };
}
