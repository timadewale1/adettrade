import { promises as fs } from "fs";
import path from "path";

import {
  BalanceState,
  ResolveTradeRequest,
  SignalJournalEntry,
  TradeHistoryEntry,
  TradePlan,
} from "@/lib/types";
import { roundTo } from "@/lib/utils";

const dataFile = path.join(process.cwd(), "data", "account-state.json");

const defaultState: BalanceState = {
  balance: 20,
  startingBalance: 20,
  lastUpdated: new Date().toISOString(),
  openTrade: null,
  history: [],
  journal: [],
};

async function ensureStore() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultState, null, 2), "utf8");
  }
}

export async function readAccountState(): Promise<BalanceState> {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw) as Partial<BalanceState>;
  return {
    balance: parsed.balance ?? defaultState.balance,
    startingBalance: parsed.startingBalance ?? defaultState.startingBalance,
    lastUpdated: parsed.lastUpdated ?? defaultState.lastUpdated,
    openTrade: parsed.openTrade ?? null,
    history: parsed.history ?? [],
    journal: parsed.journal ?? [],
  };
}

async function writeAccountState(state: BalanceState) {
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export async function setManualBalance(balance: number) {
  const state = await readAccountState();
  const next = {
    ...state,
    balance: roundTo(balance),
    startingBalance:
      state.history.length === 0 ? roundTo(balance) : state.startingBalance,
    lastUpdated: new Date().toISOString(),
  };

  return writeAccountState(next);
}

export async function saveOpenTrade(trade: TradePlan | null) {
  const state = await readAccountState();
  const journalEntry: SignalJournalEntry | null = trade
    ? {
        id: trade.id,
        pair: trade.pair,
        session: trade.session,
        strategy: trade.strategy,
        direction: trade.direction,
        confidenceScore: trade.confidenceScore,
        riskPercent: trade.riskPercent,
        headlineRiskScore: trade.headlineRisk.riskScore,
        eventBlocked: trade.blockedByEvents,
        headlineBlocked: trade.headlineRisk.blocked,
        aiVerdict: trade.aiAnalysis?.verdict ?? "NONE",
        multiTimeframeAligned: trade.multiTimeframe.aligned,
        generatedAt: trade.generatedAt,
        weekday: new Date(trade.generatedAt).getUTCDay(),
        hourUtc: new Date(trade.generatedAt).getUTCHours(),
        status: "OPEN",
        pnl: null,
      }
    : null;
  const next = {
    ...state,
    openTrade: trade,
    lastUpdated: new Date().toISOString(),
    journal: journalEntry
      ? [journalEntry, ...state.journal.filter((entry) => entry.id !== journalEntry.id)].slice(0, 250)
      : state.journal,
  };

  return writeAccountState(next);
}

export async function resolveOpenTrade(input: ResolveTradeRequest) {
  const state = await readAccountState();

  if (!state.openTrade) {
    throw new Error("No open trade is being tracked right now.");
  }

  const trade = state.openTrade;
  const pnl =
    typeof input.manualPnl === "number"
      ? roundTo(input.manualPnl)
      : input.outcome === "WON"
        ? trade.rewardAmount
        : input.outcome === "LOST"
          ? -trade.riskAmount
          : 0;
  const nextBalance = roundTo(state.balance + pnl);

  const closedTrade: TradeHistoryEntry = {
    ...trade,
    status: input.outcome,
    actualPnl: pnl,
    closedAt: new Date().toISOString(),
    resultingBalance: nextBalance,
  };

  const nextState: BalanceState = {
    ...state,
    balance: nextBalance,
    lastUpdated: new Date().toISOString(),
    openTrade: null,
    history: [closedTrade, ...state.history].slice(0, 20),
    journal: state.journal
      .map((entry) =>
        entry.id === trade.id
          ? {
              ...entry,
              status: input.outcome,
              pnl,
            }
          : entry,
      )
      .slice(0, 250),
  };

  return writeAccountState(nextState);
}
