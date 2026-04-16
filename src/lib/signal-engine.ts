import { generateAiReview } from "@/lib/ai-review";
import { deriveNewsRisk, getRelevantEvents } from "@/lib/event-monitor";
import { getHeadlineRisk } from "@/lib/headline-monitor";
import { getConfidenceCalibration, getPerformanceBoost } from "@/lib/learning";
import { getLiveMarketSnapshots } from "@/lib/live-market";
import { calculateLotSize, deriveRiskPercent } from "@/lib/risk";
import {
  CurrencyPair,
  MarketSnapshot,
  PairRotationSnapshot,
  SignalJournalEntry,
  StrategyVariant,
  TradeHistoryEntry,
  TradePlan,
} from "@/lib/types";
import { clamp, pipSize, roundTo, scoreToBand } from "@/lib/utils";

const supportedPairs: CurrencyPair[] = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD"];
const strategies: StrategyVariant[] = [
  "Trend Continuation",
  "Breakout Expansion",
  "Pullback Reclaim",
  "Reversal Fade",
];

function baseQualityScore(snapshot: MarketSnapshot) {
  const multiBoost = snapshot.multiTimeframe?.aligned ? 8 : snapshot.multiTimeframe ? 3 : 0;
  const base =
    snapshot.trendStrength * 0.26 +
    snapshot.momentum * 0.18 +
    snapshot.pullbackQuality * 0.2 +
    snapshot.volatilityScore * 0.12 +
    snapshot.liquidityScore * 0.14 -
    snapshot.newsRisk * 0.1 -
    snapshot.spreadPips * 2 +
    multiBoost;

  return roundTo(clamp(base, 0, 100));
}

function strategyModifier(snapshot: MarketSnapshot, strategy: StrategyVariant) {
  switch (strategy) {
    case "Trend Continuation":
      return snapshot.trendStrength * 0.08 + snapshot.momentum * 0.05;
    case "Breakout Expansion":
      return snapshot.volatilityScore * 0.08 + snapshot.liquidityScore * 0.04;
    case "Pullback Reclaim":
      return snapshot.pullbackQuality * 0.1 + snapshot.trendStrength * 0.04;
    case "Reversal Fade":
      return (100 - snapshot.trendStrength) * 0.03 + snapshot.volatilityScore * 0.03;
    default:
      return 0;
  }
}

function chooseDirection(snapshot: MarketSnapshot, strategy: StrategyVariant) {
  if (strategy === "Reversal Fade" && snapshot.trendStrength < 66 && snapshot.volatilityScore > 58) {
    return snapshot.directionBias === "BUY" ? "SELL" : "BUY";
  }

  return snapshot.directionBias;
}

function buildManagementPlan(stopLossPips: number, takeProfitPips: number) {
  return {
    breakEvenTriggerPips: Math.max(8, Math.round(stopLossPips * 0.8)),
    partialTakeProfitPips: Math.max(10, Math.round(takeProfitPips * 0.55)),
    trailingStopPips: Math.max(8, Math.round(stopLossPips * 0.65)),
    earlyExitRules: [
      "Exit early if price fails to hold beyond the entry zone after confirmation.",
      "Reduce exposure if a surprise headline sharply changes the trade thesis.",
      "Exit before major scheduled news if the first target has not been reached.",
    ],
  };
}

function buildRotationSnapshot(
  rankedPairs: Array<{ pair: CurrencyPair; score: number; reason: string }>,
  selectedPair: CurrencyPair,
): PairRotationSnapshot {
  return {
    rankedPairs: rankedPairs.slice(0, 4),
    selectedPair,
    summary: `Rotation currently favors ${selectedPair} because it has the cleanest live conditions and strongest recent edge.`,
  };
}

function buildConditions(strategy: StrategyVariant) {
  const shared = [
    "Only enter if spread stays below 2.0 pips.",
    "Skip the trade if a high-impact news release is due within 30 minutes.",
  ];

  switch (strategy) {
    case "Trend Continuation":
      return ["Wait for continuation candle close with momentum.", ...shared];
    case "Breakout Expansion":
      return ["Enter only after a clean breakout and hold above or below the trigger level.", ...shared];
    case "Pullback Reclaim":
      return ["Wait for a pullback into structure and reclaim candle.", ...shared];
    case "Reversal Fade":
      return ["Take only if momentum weakens and price rejects an exhaustion zone.", ...shared];
    default:
      return shared;
  }
}

function noTradeReasons(snapshot: MarketSnapshot) {
  const reasons: string[] = [];
  if (snapshot.spreadPips > 1.8) reasons.push("spread is too wide");
  if (snapshot.multiTimeframe && !snapshot.multiTimeframe.aligned) reasons.push("timeframes are not fully aligned");
  if (snapshot.volatilityScore < 50) reasons.push("volatility is too weak");
  if (snapshot.pullbackQuality < 58 && snapshot.trendStrength < 65) reasons.push("market structure is too messy");
  return reasons;
}

async function createTradePlan({
  snapshot,
  strategy,
  balance,
  history,
  journal,
  rotation,
}: {
  snapshot: MarketSnapshot;
  strategy: StrategyVariant;
  balance: number;
  history: TradeHistoryEntry[];
  journal: SignalJournalEntry[];
  rotation: PairRotationSnapshot;
}): Promise<TradePlan> {
  const now = new Date();
  const baseScore = baseQualityScore(snapshot);
  const performanceBoost = getPerformanceBoost({
    pair: snapshot.pair,
    session: snapshot.session,
    strategy,
    weekday: now.getUTCDay(),
    hourUtc: now.getUTCHours(),
    journal,
  });
  const score = roundTo(clamp(baseScore + strategyModifier(snapshot, strategy) + performanceBoost, 0, 100));
  const watchedEvents = await getRelevantEvents(snapshot.pair);
  const eventRisk = deriveNewsRisk(watchedEvents);
  const headlineRisk = await getHeadlineRisk(snapshot.pair);
  const riskPercent = deriveRiskPercent(balance, history);
  const direction = chooseDirection(snapshot, strategy);
  const stopLossPips = Math.max(
    strategy === "Breakout Expansion" ? 14 : strategy === "Reversal Fade" ? 12 : 10,
    Math.round(snapshot.atrPips * (strategy === "Breakout Expansion" ? 0.8 : strategy === "Reversal Fade" ? 0.55 : 0.7)),
  );
  const riskReward = strategy === "Breakout Expansion" ? 2.1 : strategy === "Reversal Fade" ? 1.5 : 1.8;
  const takeProfitPips = Math.max(18, Math.round(stopLossPips * riskReward));
  const { lotSize, riskAmount } = calculateLotSize({ balance, riskPercent, stopLossPips });
  const rewardAmount = roundTo(riskAmount * riskReward);
  const pairPipSize = pipSize(snapshot.pair);
  const entry = snapshot.price;
  const stopOffset = stopLossPips * pairPipSize;
  const targetOffset = takeProfitPips * pairPipSize;
  const stopLoss = direction === "BUY" ? entry - stopOffset : entry + stopOffset;
  const takeProfit = direction === "BUY" ? entry + targetOffset : entry - targetOffset;
  const managementPlan = buildManagementPlan(stopLossPips, takeProfitPips);
  const calibration = getConfidenceCalibration(journal, score);

  const draftTrade: Omit<TradePlan, "aiAnalysis"> = {
    id: `${snapshot.pair.replace("/", "-")}-${strategy.replace(/\s+/g, "-")}-${Date.now()}`,
    pair: snapshot.pair,
    strategy,
    direction,
    session: snapshot.session,
    confidenceBand: scoreToBand(score),
    confidenceScore: score,
    entry: roundTo(entry, snapshot.pair.endsWith("JPY") ? 3 : 5),
    stopLoss: roundTo(stopLoss, snapshot.pair.endsWith("JPY") ? 3 : 5),
    takeProfit: roundTo(takeProfit, snapshot.pair.endsWith("JPY") ? 3 : 5),
    stopLossPips,
    takeProfitPips,
    lotSize,
    riskAmount,
    rewardAmount,
    riskPercent,
    riskToReward: riskReward,
    conditions: buildConditions(strategy),
    invalidation: "Do not take the setup if price invalidates the structure before confirmation.",
    rationale: [
      `Base market quality is ${baseScore}/100 with a ${performanceBoost >= 0 ? "+" : ""}${performanceBoost} learning adjustment.`,
      `Strategy ${strategy} fits current conditions with trend ${snapshot.trendStrength}/100 and pullback ${snapshot.pullbackQuality}/100.`,
      `Event risk is ${eventRisk.riskScore}/100 and headline risk is ${headlineRisk.riskScore}/100.`,
    ],
    marketSource: snapshot.source ?? "Seeded market snapshot",
    eventRiskSummary: eventRisk.summary,
    blockedByEvents: eventRisk.blocked,
    watchedEvents,
    headlineRisk,
    multiTimeframe:
      snapshot.multiTimeframe ?? {
        aligned: false,
        dominantDirection: direction,
        confidenceBoost: 0,
        snapshots: [],
        summary: "Multi-timeframe confirmation is not available for this snapshot.",
      },
    pairRotation: rotation,
    managementPlan,
    calibration,
    generatedAt: now.toISOString(),
  };

  const aiAnalysis = await generateAiReview(draftTrade);
  return { ...draftTrade, aiAnalysis };
}

export async function generateBestSignal(
  balance: number,
  history: TradeHistoryEntry[] = [],
  journal: SignalJournalEntry[] = [],
) {
  const liveSnapshots = await getLiveMarketSnapshots(supportedPairs).catch(() => null);
  if (!liveSnapshots || liveSnapshots.length === 0) {
    throw new Error("Live market data is unavailable right now. No seeded fallback is being used.");
  }

  const sourceSnapshots = liveSnapshots;
  const rotationRanking = sourceSnapshots
    .map((snapshot) => ({
      pair: snapshot.pair,
      score: roundTo(
        baseQualityScore(snapshot) +
          getPerformanceBoost({
            pair: snapshot.pair,
            session: snapshot.session,
            strategy: "Trend Continuation",
            weekday: new Date().getUTCDay(),
            hourUtc: new Date().getUTCHours(),
            journal,
          }),
      ),
      reason: `${snapshot.session} session, trend ${snapshot.trendStrength}/100, liquidity ${snapshot.liquidityScore}/100`,
    }))
    .sort((a, b) => b.score - a.score);

  const topPairs = new Set(rotationRanking.slice(0, 2).map((item) => item.pair));
  const tradableSnapshots = sourceSnapshots
    .filter((snapshot) => topPairs.has(snapshot.pair))
    .filter((snapshot) => noTradeReasons(snapshot).length < 3);

  const rotation = buildRotationSnapshot(rotationRanking, rotationRanking[0]?.pair ?? "EUR/USD");
  const candidates = tradableSnapshots.flatMap((snapshot) =>
    strategies.map((strategy) => ({ snapshot, strategy })),
  );

  const rejectionNotes: string[] = [];

  for (const candidate of candidates.sort((a, b) => {
    const aScore =
      baseQualityScore(a.snapshot) +
      strategyModifier(a.snapshot, a.strategy) +
      getPerformanceBoost({
        pair: a.snapshot.pair,
        session: a.snapshot.session,
        strategy: a.strategy,
        weekday: new Date().getUTCDay(),
        hourUtc: new Date().getUTCHours(),
        journal,
      });
    const bScore =
      baseQualityScore(b.snapshot) +
      strategyModifier(b.snapshot, b.strategy) +
      getPerformanceBoost({
        pair: b.snapshot.pair,
        session: b.snapshot.session,
        strategy: b.strategy,
        weekday: new Date().getUTCDay(),
        hourUtc: new Date().getUTCHours(),
        journal,
      });
    return bScore - aScore;
  })) {
    const trade = await createTradePlan({
      snapshot: candidate.snapshot,
      strategy: candidate.strategy,
      balance,
      history,
      journal,
      rotation,
    });
    const skipReasons = [
      ...noTradeReasons(candidate.snapshot),
      trade.blockedByEvents ? "scheduled event risk is too high" : "",
      trade.headlineRisk.blocked ? "headline risk is too unstable" : "",
      trade.aiAnalysis?.verdict === "SKIP" ? "AI reviewer rejected the setup" : "",
      trade.calibration.sampleSize >= 4 && (trade.calibration.observedWinRate ?? 0) < 45
        ? "similar confidence setups are underperforming historically"
        : "",
    ].filter(Boolean);

    if (trade.confidenceScore >= 68 && skipReasons.length === 0) {
      return { signal: trade, diagnostics: [] };
    }

    rejectionNotes.push(
      `${trade.pair} ${trade.strategy}: ${
        skipReasons.length ? skipReasons.join(", ") : `confidence ${trade.confidenceScore.toFixed(2)} below threshold`
      }`,
    );
  }

  return {
    signal: null,
    diagnostics: rejectionNotes.slice(0, 4),
  };
}
