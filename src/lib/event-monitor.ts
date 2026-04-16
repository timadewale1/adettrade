import { CurrencyPair, MarketEvent } from "@/lib/types";

const countryMap: Record<CurrencyPair, string[]> = {
  "EUR/USD": ["euro area", "united states"],
  "GBP/USD": ["united kingdom", "united states"],
  "USD/JPY": ["united states", "japan"],
  "AUD/USD": ["australia", "united states"],
};

function normalizeImportance(value: unknown) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(1, Math.min(3, parsed));
  }

  return 1;
}

export async function getRelevantEvents(pair: CurrencyPair) {
  const countries = countryMap[pair];
  const auth = process.env.TRADING_ECONOMICS_API_KEY || "guest:guest";
  const countryPath = countries.map((country) => encodeURIComponent(country)).join(",");
  const url = `https://api.tradingeconomics.com/calendar/country/${countryPath}?c=${encodeURIComponent(auth)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    return [] as MarketEvent[];
  }

  const payload = (await response.json()) as Array<{
    CalendarId?: string | number;
    Event?: string;
    Country?: string;
    Currency?: string;
    Importance?: number | string;
    Date?: string;
  }>;

  const now = Date.now();

  return payload
    .map((item) => {
      const timestamp = item.Date ? new Date(item.Date) : null;

      if (!timestamp || Number.isNaN(timestamp.getTime())) {
        return null;
      }

      const minutesUntil = Math.round((timestamp.getTime() - now) / 60000);

      return {
        id: String(item.CalendarId ?? `${item.Event}-${item.Date}`),
        title: item.Event ?? "Economic event",
        country: item.Country ?? "Unknown",
        currency: item.Currency ?? "N/A",
        importance: normalizeImportance(item.Importance),
        timestamp: timestamp.toISOString(),
        minutesUntil,
      } satisfies MarketEvent;
    })
    .filter((event): event is MarketEvent => Boolean(event))
    .filter((event) => event.minutesUntil >= -15 && event.minutesUntil <= 180)
    .sort((a, b) => a.minutesUntil - b.minutesUntil)
    .slice(0, 6);
}

export function deriveNewsRisk(events: MarketEvent[]) {
  if (!events.length) {
    return {
      riskScore: 15,
      blocked: false,
      summary: "No high-impact scheduled event is inside the trade window.",
    };
  }

  const highest = events.reduce((max, event) => Math.max(max, event.importance), 1);
  const nearest = Math.min(...events.map((event) => Math.abs(event.minutesUntil)));
  const proximityRisk = nearest <= 30 ? 42 : nearest <= 60 ? 26 : 14;
  const impactRisk = highest === 3 ? 38 : highest === 2 ? 20 : 10;
  const riskScore = Math.min(100, proximityRisk + impactRisk);
  const blocked = events.some(
    (event) => event.importance >= 3 && event.minutesUntil >= -15 && event.minutesUntil <= 45,
  );
  const summary = blocked
    ? "A high-impact macro event is too close, so the trade should be skipped."
    : `Event risk is elevated by ${events[0].title} in ${events[0].minutesUntil} minutes.`;

  return { riskScore, blocked, summary };
}
