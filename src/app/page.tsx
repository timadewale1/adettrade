"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  ArrowUpRight,
  Brain,
  BadgeDollarSign,
  BarChart3,
  CircleAlert,
  Newspaper,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";

import {
  AccountAnalytics,
  BacktestReport,
  BalanceState,
  LearningSummary,
  SignalResponse,
  TradePlan,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type LoadState = {
  state: BalanceState | null;
  analytics: AccountAnalytics | null;
  learning: LearningSummary | null;
  backtest: BacktestReport | null;
  signal: TradePlan | null;
  headline: string;
  reason: string;
  error: string | null;
};

const initialLoadState: LoadState = {
  state: null,
  analytics: null,
  learning: null,
  backtest: null,
  signal: null,
  headline: "Waiting for your balance",
  reason: "Enter your account size once and the engine will track it from there.",
  error: null,
};

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }

  return data;
}

export default function Home() {
  const [loadState, setLoadState] = useState<LoadState>(initialLoadState);
  const [manualBalance, setManualBalance] = useState("20");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const [accountResult, backtestResult] = await Promise.allSettled([
          jsonFetch<{ state: BalanceState; analytics: AccountAnalytics; learning: LearningSummary }>("/api/account"),
          jsonFetch<{ report: BacktestReport | null }>("/api/backtest?pair=EUR/USD"),
        ]);
        if (accountResult.status !== "fulfilled") {
          throw accountResult.reason;
        }
        const accountData = accountResult.value;
        const backtestData =
          backtestResult.status === "fulfilled" ? backtestResult.value : { report: null };
        setLoadState((current) => ({
          ...current,
          state: accountData.state,
          analytics: accountData.analytics,
          learning: accountData.learning,
          backtest: backtestData.report,
          error: null,
        }));
        setManualBalance(String(accountData.state.balance));
      } catch (error) {
        setLoadState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Unable to load account state.",
        }));
      }
    });
  }, []);

  const generateSignal = () => {
    startTransition(async () => {
      try {
        const payload =
          manualBalance.trim().length > 0
            ? { manualBalance: Number(manualBalance) }
            : {};
        const data = await jsonFetch<SignalResponse>("/api/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        setLoadState({
          state: data.state,
          analytics: loadState.analytics,
          learning: loadState.learning,
          backtest: loadState.backtest,
          signal: data.signal,
          headline: data.headline,
          reason: data.reason,
          error: null,
        });
        setManualBalance(String(data.state.balance));
      } catch (error) {
        setLoadState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Unable to generate signal.",
        }));
      }
    });
  };

  const updateBalance = () => {
    startTransition(async () => {
      try {
        const data = await jsonFetch<{ state: BalanceState; analytics: AccountAnalytics; learning: LearningSummary }>("/api/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ balance: Number(manualBalance) }),
        });

        setLoadState((current) => ({
          ...current,
          state: data.state,
          analytics: data.analytics,
          learning: data.learning,
          error: null,
        }));
      } catch (error) {
        setLoadState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Unable to update balance.",
        }));
      }
    });
  };

  const resolveTrade = (outcome: "WON" | "LOST" | "CANCELLED") => {
    startTransition(async () => {
      try {
        const data = await jsonFetch<{ state: BalanceState; analytics: AccountAnalytics; learning: LearningSummary }>("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        });

        setLoadState((current) => ({
          ...current,
          state: data.state,
          analytics: data.analytics,
          learning: data.learning,
          backtest: current.backtest,
          signal: null,
          headline: "Trade result saved",
          reason: "The account balance has been updated and is ready for the next setup.",
          error: null,
        }));
        setManualBalance(String(data.state.balance));
      } catch (error) {
        setLoadState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Unable to resolve trade.",
        }));
      }
    });
  };

  const account = loadState.state;
  const analytics = loadState.analytics;
  const learning = loadState.learning;
  const openTrade = account?.openTrade ?? null;
  const signal = loadState.signal ?? openTrade;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass overflow-hidden rounded-[2rem]">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.4fr_0.9fr] lg:px-10">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-sm text-sky-200">
              <Activity className="h-4 w-4" />
              Balance-driven forex signal engine
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Input your balance once. The system tracks the rest.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                This app generates the strongest available forex plan, sizes the trade from your current account,
                and keeps your running balance updated after each win or loss.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Wallet,
                  label: "Persistent balance",
                  value: account ? formatCurrency(account.balance) : "$0.00",
                },
                {
                  icon: ShieldCheck,
                  label: "Risk control",
                  value: signal ? `${signal.riskPercent}% per trade` : "Adaptive",
                },
                {
                  icon: analytics?.currentDrawdown ? BarChart3 : Target,
                  label: analytics ? "Current drawdown" : "Trade mode",
                  value: analytics ? `${analytics.currentDrawdown}%` : signal ? `${signal.pair} ${signal.direction}` : "Awaiting setup",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-white/8 bg-white/6 p-4">
                  <item.icon className="mb-3 h-5 w-5 text-sky-300" />
                  <p className="text-sm text-slate-400">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/40 p-5">
            <p className="text-sm uppercase tracking-[0.22em] text-sky-200/80">Control panel</p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Current balance</span>
                <input
                  value={manualBalance}
                  onChange={(event) => setManualBalance(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-lg outline-none transition focus:border-sky-300/40"
                  placeholder="20"
                  type="number"
                  min="1"
                  step="0.01"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={generateSignal}
                  disabled={isPending}
                  className="rounded-2xl bg-sky-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPending ? "Working..." : "Generate best signal"}
                </button>
                <button
                  onClick={updateBalance}
                  disabled={isPending}
                  className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Save balance only
                </button>
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                The engine keeps your running balance in storage. After a trade finishes, click the result and it
                updates the next expected balance automatically.
              </div>
            </div>
          </div>
        </div>
      </section>

      {loadState.error ? (
        <div className="glass flex items-center gap-3 rounded-3xl border border-rose-300/15 px-5 py-4 text-rose-100">
          <CircleAlert className="h-5 w-5" />
          <span>{loadState.error}</span>
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="glass rounded-[2rem] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Signal status</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">{loadState.headline}</h2>
              <p className="mt-3 max-w-2xl text-slate-300">{loadState.reason}</p>
            </div>
            {signal ? (
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-right">
                <p className="text-sm text-emerald-200">Confidence</p>
                <p className="text-2xl font-semibold text-white">{signal.confidenceScore}/100</p>
                <p className="text-sm text-emerald-200">{signal.confidenceBand}</p>
              </div>
            ) : null}
          </div>

          {signal ? (
            <SignalPanel signal={signal} isPending={isPending} onResolveTrade={resolveTrade} />
          ) : (
            <div className="mt-6 rounded-[1.75rem] border border-dashed border-white/12 bg-slate-950/25 p-8 text-slate-300">
              The engine will show a full trade plan here after you generate a setup.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="glass rounded-[2rem] p-6">
            <div className="flex items-center gap-3">
              <BadgeDollarSign className="h-5 w-5 text-sky-300" />
              <h2 className="text-xl font-semibold text-white">Account state</h2>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                <p className="text-sm text-slate-400">Starting balance</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {account ? formatCurrency(account.startingBalance) : "$0.00"}
                </p>
              </div>
              <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                <p className="text-sm text-slate-400">Current balance</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {account ? formatCurrency(account.balance) : "$0.00"}
                </p>
              </div>
            </div>
            {analytics ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                  <p className="text-sm text-slate-400">Win rate</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{analytics.winRate}%</p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                  <p className="text-sm text-slate-400">Net P/L</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(analytics.netPnl)}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 rounded-3xl border border-white/8 bg-slate-950/35 p-4">
              <p className="text-sm text-slate-400">Trade tracking</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {openTrade ? `Tracking ${openTrade.pair} ${openTrade.direction}` : "No active trade"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Once a trade result is saved, the balance rolls forward automatically and the next signal uses that new
                account size.
              </p>
            </div>
          </section>

          {loadState.backtest ? (
            <section className="glass rounded-[2rem] p-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-sky-300" />
                <h2 className="text-xl font-semibold text-white">Recent backtest</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{loadState.backtest.summary}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                  <p className="text-sm text-slate-400">Return</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{loadState.backtest.totalReturnPct}%</p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                  <p className="text-sm text-slate-400">Profit factor</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{loadState.backtest.profitFactor}</p>
                </div>
              </div>
              <div className="mt-4 rounded-3xl border border-white/8 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-400">{loadState.backtest.monteCarlo.summary}</p>
                <p className="mt-2 text-sm text-slate-300">
                  Median ending balance: {formatCurrency(loadState.backtest.monteCarlo.medianEndingBalance)} · Worst: {formatCurrency(loadState.backtest.monteCarlo.worstEndingBalance)} · Ruin risk: {loadState.backtest.monteCarlo.ruinProbabilityPct}%
                </p>
              </div>
            </section>
          ) : null}

          {learning ? (
            <section className="glass rounded-[2rem] p-6">
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-sky-300" />
                <h2 className="text-xl font-semibold text-white">Learning loop</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{learning.recommendation}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                  <p className="text-sm text-slate-400">Best pair</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{learning.bestPair ?? "Waiting"}</p>
                </div>
                <div className="rounded-3xl border border-white/8 bg-white/6 p-4">
                  <p className="text-sm text-slate-400">Best session</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{learning.bestSession ?? "Waiting"}</p>
                </div>
              </div>
              {learning.pairLeaders.length ? (
                <div className="mt-4 space-y-2">
                  {learning.pairLeaders.map((item) => (
                    <div key={`${item.pair}-${item.session ?? "pair"}`} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                      {item.pair} · {item.winRate}% wins · {formatCurrency(item.netPnl)} net
                    </div>
                  ))}
                </div>
              ) : null}
              {learning.strategyLeaders.length ? (
                <div className="mt-4 space-y-2">
                  {learning.strategyLeaders.map((item) => (
                    <div key={item.strategy} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                      {item.strategy} · {item.winRate}% wins · {formatCurrency(item.netPnl)} net
                    </div>
                  ))}
                </div>
              ) : null}
              {learning.hourLeaders.length ? (
                <div className="mt-4 space-y-2">
                  {learning.hourLeaders.slice(0, 3).map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                      Best hour: {item.label} · {item.winRate}% wins
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="glass rounded-[2rem] p-6">
            <h2 className="text-xl font-semibold text-white">Recent outcomes</h2>
            <div className="mt-5 space-y-3">
              {account?.history.length ? (
                account.history.map((trade) => (
                  <div key={trade.id} className="rounded-3xl border border-white/8 bg-white/6 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-400">{trade.pair}</p>
                        <p className="mt-1 text-lg font-semibold text-white">
                          {trade.direction} · {trade.status}
                        </p>
                      </div>
                      <p
                        className={`text-lg font-semibold ${
                          trade.actualPnl >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {trade.actualPnl >= 0 ? "+" : ""}
                        {formatCurrency(trade.actualPnl)}
                      </p>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">
                      Balance after trade: {formatCurrency(trade.resultingBalance)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-white/12 bg-slate-950/25 p-5 text-sm leading-6 text-slate-300">
                  No completed trades yet. Once you mark a win or loss, the result will stay here and your next signal
                  will use the updated balance automatically.
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SignalPanel({
  signal,
  isPending,
  onResolveTrade,
}: {
  signal: TradePlan;
  isPending: boolean;
  onResolveTrade: (outcome: "WON" | "LOST" | "CANCELLED") => void;
}) {
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Pair", value: signal.pair },
          { label: "Strategy", value: signal.strategy },
          { label: "Direction", value: signal.direction },
          { label: "Lot size", value: signal.lotSize.toFixed(2) },
          { label: "Session", value: signal.session },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/8 bg-white/6 p-4">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Current price", value: signal.entry },
          { label: "Entry", value: signal.entry },
          { label: "Stop loss", value: signal.stopLoss },
          { label: "Take profit", value: signal.takeProfit },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/8 bg-slate-950/35 p-4">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Risk amount", value: formatCurrency(signal.riskAmount) },
          { label: "Reward target", value: formatCurrency(signal.rewardAmount) },
          { label: "Market feed", value: signal.marketSource },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/8 bg-white/6 p-4">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/35 p-5">
          <h3 className="text-lg font-semibold text-white">Conditions before entry</h3>
          <div className="mt-4 space-y-3">
            {signal.conditions.map((condition) => (
              <div key={condition} className="flex gap-3">
                <ArrowUpRight className="mt-1 h-4 w-4 flex-none text-sky-300" />
                <p className="text-sm leading-6 text-slate-300">{condition}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-rose-300/15 bg-rose-300/10 p-4">
            <p className="text-sm font-semibold text-rose-100">Invalidation</p>
            <p className="mt-1 text-sm leading-6 text-rose-100/90">{signal.invalidation}</p>
          </div>
          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
            <p className="text-sm font-semibold text-amber-100">Event filter</p>
            <p className="mt-1 text-sm leading-6 text-amber-100/90">{signal.eventRiskSummary}</p>
          </div>
          <div className="mt-5 rounded-2xl border border-sky-300/15 bg-sky-300/10 p-4">
            <p className="text-sm font-semibold text-sky-100">Multi-timeframe check</p>
            <p className="mt-1 text-sm leading-6 text-sky-100/90">{signal.multiTimeframe.summary}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {signal.multiTimeframe.snapshots.map((snapshot) => (
                <div key={snapshot.timeframe} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                  {snapshot.timeframe} · {snapshot.directionBias} · trend {snapshot.trendStrength}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-sm font-semibold text-white">Pair rotation</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">{signal.pairRotation.summary}</p>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Newspaper className="h-4 w-4 text-sky-300" />
              Surprise-news filter
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{signal.headlineRisk.summary}</p>
            {signal.headlineRisk.headlines.length ? (
              <div className="mt-3 space-y-2">
                {signal.headlineRisk.headlines.map((headline) => (
                  <a
                    key={headline.id}
                    href={headline.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-white/8 bg-white/6 p-3 text-sm text-slate-300 transition hover:bg-white/10"
                  >
                    {headline.title} · {headline.source}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-sm font-semibold text-white">Trade management</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/6 p-3 text-sm text-slate-300">
                Break-even: {signal.managementPlan.breakEvenTriggerPips} pips
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/6 p-3 text-sm text-slate-300">
                Partial: {signal.managementPlan.partialTakeProfitPips} pips
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/6 p-3 text-sm text-slate-300">
                Trail: {signal.managementPlan.trailingStopPips} pips
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {signal.managementPlan.earlyExitRules.map((rule) => (
                <div key={rule} className="rounded-2xl border border-white/8 bg-white/6 p-3 text-sm text-slate-300">
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/8 bg-white/6 p-5">
          <h3 className="text-lg font-semibold text-white">Why this trade</h3>
          <div className="mt-4 space-y-3">
            {signal.rationale.map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-slate-950/35 p-4 text-sm leading-6 text-slate-300">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => onResolveTrade("WON")}
              disabled={isPending}
              className="rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Mark win
            </button>
            <button
              onClick={() => onResolveTrade("LOST")}
              disabled={isPending}
              className="rounded-2xl bg-rose-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Mark loss
            </button>
            <button
              onClick={() => onResolveTrade("CANCELLED")}
              disabled={isPending}
              className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Cancel trade
            </button>
          </div>
          {signal.aiAnalysis ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <Brain className="h-4 w-4" />
                AI review · {signal.aiAnalysis.verdict} · {signal.aiAnalysis.confidence}/100
              </p>
              <p className="mt-1 text-sm leading-6 text-emerald-100/90">{signal.aiAnalysis.summary}</p>
              <div className="mt-3 space-y-2">
                {signal.aiAnalysis.strengths.map((item) => (
                  <div key={`strength-${item}`} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                    Strength: {item}
                  </div>
                ))}
                {signal.aiAnalysis.risks.map((item) => (
                  <div key={`risk-${item}`} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                    Risk: {item}
                  </div>
                ))}
                {signal.aiAnalysis.managementNotes?.map((item) => (
                  <div key={`management-${item}`} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                    Management: {item}
                  </div>
                ))}
                {signal.aiAnalysis.improvementIdeas?.map((item) => (
                  <div key={`improvement-${item}`} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                    Improve: {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-5 rounded-2xl border border-white/8 bg-slate-950/35 p-4">
            <p className="text-sm font-semibold text-white">Confidence calibration</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">{signal.calibration.summary}</p>
            <p className="mt-2 text-sm text-slate-400">
              Band: {signal.calibration.expectedBand} · Sample: {signal.calibration.sampleSize}
              {signal.calibration.observedWinRate !== null
                ? ` · Observed wins: ${signal.calibration.observedWinRate}%`
                : ""}
            </p>
          </div>
          {signal.watchedEvents.length ? (
            <div className="mt-5 space-y-2">
              {signal.watchedEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm text-slate-300">
                  {event.title} · {event.country} · {event.minutesUntil} min · impact {event.importance}/3
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
