import {
  CurrencyPair,
  MarketSnapshot,
  MultiTimeframeSignal,
  TimeframeSnapshot,
  TradeDirection,
} from "@/lib/types";
import { roundTo } from "@/lib/utils";

type Interval = "15min" | "1h" | "4h";

type Candle = {
  datetime: string;
  high: number;
  low: number;
  close: number;
};

const pairMap: Record<CurrencyPair, string> = {
  "EUR/USD": "EUR/USD",
  "GBP/USD": "GBP/USD",
  "USD/JPY": "USD/JPY",
  "AUD/USD": "AUD/USD",
};

const intervalConfig: Record<Interval, { outputsize: number }> = {
  "15min": { outputsize: 80 },
  "1h": { outputsize: 60 },
  "4h": { outputsize: 60 },
};

function toNumber(value: string) {
  return Number.parseFloat(value);
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function deriveDirection(closes: number[]): TradeDirection {
  return closes[0] >= closes[closes.length - 1] ? "BUY" : "SELL";
}

function averageTrueRange(candles: Candle[], period = 14) {
  return average(candles.slice(0, period).map((candle) => candle.high - candle.low));
}

function sessionFromUtcHour(hour: number) {
  if (hour >= 7 && hour < 12) return "London" as const;
  if (hour >= 12 && hour < 17) return "Overlap" as const;
  if (hour >= 17 && hour < 22) return "New York" as const;
  return "Tokyo" as const;
}

function buildTimeframeSnapshot(pair: CurrencyPair, timeframe: Interval, candles: Candle[]): TimeframeSnapshot {
  const closes = candles.map((candle) => candle.close);
  const latest = candles[0];
  const atr = averageTrueRange(candles);
  const pipMultiplier = pair.endsWith("JPY") ? 100 : 10000;
  const trendDelta = ((latest.close - closes[closes.length - 1]) / closes[closes.length - 1]) * 100;
  const momentumDelta = ((latest.close - closes[Math.min(4, closes.length - 1)]) / closes[Math.min(4, closes.length - 1)]) * 100;

  return {
    timeframe,
    price: latest.close,
    atrPips: roundTo(atr * pipMultiplier, 1),
    trendStrength: roundTo(Math.min(95, Math.max(40, Math.abs(trendDelta) * 220))),
    momentum: roundTo(Math.min(95, Math.max(40, Math.abs(momentumDelta) * 320))),
    directionBias: deriveDirection(closes),
  };
}

function buildMultiTimeframeSignal(snapshots: TimeframeSnapshot[]): MultiTimeframeSignal {
  const buyVotes = snapshots.filter((snapshot) => snapshot.directionBias === "BUY").length;
  const dominantDirection = buyVotes >= 2 ? "BUY" : "SELL";
  const aligned = snapshots.every((snapshot) => snapshot.directionBias === dominantDirection);
  const confidenceBoost = aligned ? 10 : buyVotes === 2 || buyVotes === 1 ? 4 : 0;
  const summary = aligned
    ? `${dominantDirection} alignment confirmed on M15, H1, and H4.`
    : `Timeframes are mixed, so the setup is treated more cautiously.`;

  return {
    aligned,
    dominantDirection,
    confidenceBoost,
    snapshots,
    summary,
  };
}

async function fetchCandles(pair: CurrencyPair, timeframe: Interval, apiKey: string) {
  const symbol = encodeURIComponent(pairMap[pair]);
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${timeframe}&outputsize=${intervalConfig[timeframe].outputsize}&timezone=UTC&apikey=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { cache: "no-store", signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Market data request failed for ${pair} ${timeframe}.`);
  }

  const payload = (await response.json()) as {
    status?: string;
    values?: Array<{ datetime: string; high: string; low: string; close: string }>;
    message?: string;
  };

  if (payload.status === "error" || !payload.values?.length) {
    throw new Error(payload.message ?? `No candle data returned for ${pair} ${timeframe}.`);
  }

  return payload.values.map((item) => ({
    datetime: item.datetime,
    high: toNumber(item.high),
    low: toNumber(item.low),
    close: toNumber(item.close),
  }));
}

async function buildPairSnapshot(pair: CurrencyPair, apiKey: string): Promise<MarketSnapshot & { multiTimeframe: MultiTimeframeSignal }> {
  const intervals: Interval[] = ["15min", "1h", "4h"];
  const candleMap = new Map<Interval, Candle[]>();
  const timeframeSnapshots = await Promise.all(
    intervals.map(async (timeframe) => {
      const candles = await fetchCandles(pair, timeframe, apiKey);
      candleMap.set(timeframe, candles);
      return buildTimeframeSnapshot(pair, timeframe, candles);
    }),
  );
  const multiTimeframe = buildMultiTimeframeSignal(timeframeSnapshots);
  const oneHour = timeframeSnapshots.find((snapshot) => snapshot.timeframe === "1h")!;
  const latestHourCandles = candleMap.get("1h") ?? [];

  if (!latestHourCandles.length) {
    throw new Error(`No 1h candles returned for ${pair}.`);
  }
  const highs = latestHourCandles.slice(0, 12).map((candle) => candle.high);
  const lows = latestHourCandles.slice(0, 12).map((candle) => candle.low);
  const utcHour = new Date(latestHourCandles[0].datetime).getUTCHours();

  return {
    pair,
    price: oneHour.price,
    session: sessionFromUtcHour(utcHour),
    spreadPips: pair.endsWith("JPY") ? 1.1 : 0.9,
    atrPips: oneHour.atrPips,
    trendStrength: roundTo(Math.min(95, oneHour.trendStrength + multiTimeframe.confidenceBoost)),
    momentum: oneHour.momentum,
    pullbackQuality: roundTo(
      Math.min(
        92,
        Math.max(
          46,
          100 - Math.abs(oneHour.price - timeframeSnapshots[0].price) * (pair.endsWith("JPY") ? 100 : 10000) * 0.8,
        ),
      ),
    ),
    volatilityScore: roundTo(Math.min(90, Math.max(45, oneHour.atrPips * 2.5))),
    liquidityScore: pair === "EUR/USD" ? 92 : pair === "GBP/USD" ? 86 : pair === "USD/JPY" ? 88 : 78,
    newsRisk: multiTimeframe.aligned ? 15 : 28,
    directionBias: multiTimeframe.dominantDirection,
    support: roundTo(Math.min(...lows), pair.endsWith("JPY") ? 3 : 5),
    resistance: roundTo(Math.max(...highs), pair.endsWith("JPY") ? 3 : 5),
    source: "Twelve Data",
    timeframe: "1h",
    multiTimeframe,
  };
}

export async function getLiveMarketSnapshots(pairs: CurrencyPair[]) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    return null;
  }

  const settled = await Promise.allSettled(pairs.map((pair) => buildPairSnapshot(pair, apiKey)));
  const snapshots = settled
    .filter(
      (result): result is PromiseFulfilledResult<MarketSnapshot & { multiTimeframe: MultiTimeframeSignal }> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);

  return snapshots.length ? snapshots : null;
}
