export type TradeDirection = "BUY" | "SELL";

export type MarketSession = "Tokyo" | "London" | "New York" | "Overlap";

export type ConfidenceBand = "Low" | "Medium" | "High" | "Elite";

export type TradeStatus = "OPEN" | "WON" | "LOST" | "CANCELLED";

export type CurrencyPair = "EUR/USD" | "GBP/USD" | "USD/JPY" | "AUD/USD";

export interface BalanceState {
  balance: number;
  startingBalance: number;
  lastUpdated: string;
  openTrade: TradePlan | null;
  history: TradeHistoryEntry[];
  journal: SignalJournalEntry[];
}

export interface TradePlan {
  id: string;
  pair: CurrencyPair;
  strategy: StrategyVariant;
  direction: TradeDirection;
  session: MarketSession;
  confidenceBand: ConfidenceBand;
  confidenceScore: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  stopLossPips: number;
  takeProfitPips: number;
  lotSize: number;
  riskAmount: number;
  rewardAmount: number;
  riskPercent: number;
  riskToReward: number;
  conditions: string[];
  invalidation: string;
  rationale: string[];
  marketSource: string;
  eventRiskSummary: string;
  blockedByEvents: boolean;
  watchedEvents: MarketEvent[];
  headlineRisk: HeadlineRisk;
  multiTimeframe: MultiTimeframeSignal;
  pairRotation: PairRotationSnapshot;
  managementPlan: ManagementPlan;
  calibration: ConfidenceCalibration;
  aiAnalysis: AiTradeReview | null;
  generatedAt: string;
}

export interface TradeHistoryEntry extends TradePlan {
  status: TradeStatus;
  actualPnl: number;
  closedAt: string | null;
  resultingBalance: number;
}

export interface MarketSnapshot {
  pair: CurrencyPair;
  price: number;
  session: MarketSession;
  spreadPips: number;
  atrPips: number;
  trendStrength: number;
  momentum: number;
  pullbackQuality: number;
  volatilityScore: number;
  liquidityScore: number;
  newsRisk: number;
  directionBias: TradeDirection;
  support: number;
  resistance: number;
  source?: string;
  timeframe?: string;
  multiTimeframe?: MultiTimeframeSignal;
}

export interface MarketEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  importance: number;
  timestamp: string;
  minutesUntil: number;
}

export interface TimeframeSnapshot {
  timeframe: "15min" | "1h" | "4h";
  price: number;
  atrPips: number;
  trendStrength: number;
  momentum: number;
  directionBias: TradeDirection;
}

export interface MultiTimeframeSignal {
  aligned: boolean;
  dominantDirection: TradeDirection;
  confidenceBoost: number;
  snapshots: TimeframeSnapshot[];
  summary: string;
}

export interface AiTradeReview {
  verdict: "TAKE" | "SKIP" | "WATCH";
  confidence: number;
  summary: string;
  strengths: string[];
  risks: string[];
  managementNotes?: string[];
  improvementIdeas?: string[];
}

export interface HeadlineItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  tone: number;
}

export interface HeadlineRisk {
  riskScore: number;
  blocked: boolean;
  summary: string;
  headlines: HeadlineItem[];
}

export interface AccountAnalytics {
  totalTrades: number;
  wins: number;
  losses: number;
  cancelled: number;
  winRate: number;
  netPnl: number;
  currentDrawdown: number;
  longestLossStreak: number;
}

export interface BacktestTrade {
  index: number;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  outcome: "WIN" | "LOSS";
  pnl: number;
  balanceAfter: number;
}

export interface BacktestReport {
  pair: CurrencyPair;
  timeframe: string;
  strategy: StrategyVariant;
  trades: BacktestTrade[];
  startingBalance: number;
  endingBalance: number;
  totalReturnPct: number;
  winRate: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sampleSize: number;
  summary: string;
  monteCarlo: MonteCarloReport;
}

export interface SignalJournalEntry {
  id: string;
  pair: CurrencyPair;
  session: MarketSession;
  strategy: StrategyVariant;
  direction: TradeDirection;
  confidenceScore: number;
  riskPercent: number;
  headlineRiskScore: number;
  eventBlocked: boolean;
  headlineBlocked: boolean;
  aiVerdict: AiTradeReview["verdict"] | "NONE";
  multiTimeframeAligned: boolean;
  generatedAt: string;
  weekday: number;
  hourUtc: number;
  status: "OPEN" | "WON" | "LOST" | "CANCELLED";
  pnl: number | null;
}

export interface LearningInsight {
  pair: CurrencyPair;
  session: MarketSession;
  trades: number;
  winRate: number;
  netPnl: number;
  avgConfidence: number;
}

export interface LearningSummary {
  pairLeaders: LearningInsight[];
  sessionLeaders: LearningInsight[];
  strategyLeaders: StrategyInsight[];
  weekdayLeaders: TimeBucketInsight[];
  hourLeaders: TimeBucketInsight[];
  bestPair: CurrencyPair | null;
  bestSession: MarketSession | null;
  recommendation: string;
}

export type StrategyVariant =
  | "Trend Continuation"
  | "Breakout Expansion"
  | "Pullback Reclaim"
  | "Reversal Fade";

export type SignalMode = "Conservative" | "Balanced" | "Aggressive";

export interface StrategyInsight {
  strategy: StrategyVariant;
  trades: number;
  winRate: number;
  netPnl: number;
}

export interface TimeBucketInsight {
  label: string;
  trades: number;
  winRate: number;
  netPnl: number;
}

export interface PairRotationSnapshot {
  rankedPairs: Array<{
    pair: CurrencyPair;
    score: number;
    reason: string;
  }>;
  selectedPair: CurrencyPair;
  summary: string;
}

export interface ManagementPlan {
  breakEvenTriggerPips: number;
  partialTakeProfitPips: number;
  trailingStopPips: number;
  earlyExitRules: string[];
}

export interface ConfidenceCalibration {
  sampleSize: number;
  observedWinRate: number | null;
  expectedBand: string;
  summary: string;
}

export interface MonteCarloReport {
  iterations: number;
  medianEndingBalance: number;
  worstEndingBalance: number;
  bestEndingBalance: number;
  ruinProbabilityPct: number;
  summary: string;
}

export interface SignalRequest {
  manualBalance?: number;
  selectedPairs?: CurrencyPair[];
  mode?: SignalMode;
}

export interface SignalResponse {
  state: BalanceState;
  signal: TradePlan | null;
  headline: string;
  reason: string;
}

export interface ResolveTradeRequest {
  outcome: "WON" | "LOST" | "CANCELLED";
  manualPnl?: number;
}
