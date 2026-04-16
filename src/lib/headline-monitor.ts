import { CurrencyPair, HeadlineItem, HeadlineRisk } from "@/lib/types";

const pairQueryMap: Record<CurrencyPair, string> = {
  "EUR/USD": "(EUR OR Euro OR ECB OR USD OR Federal Reserve OR FOMC)",
  "GBP/USD": "(GBP OR Pound OR BOE OR USD OR Federal Reserve OR FOMC)",
  "USD/JPY": "(USD OR Federal Reserve OR FOMC OR JPY OR Yen OR BOJ)",
  "AUD/USD": "(AUD OR Australia OR RBA OR USD OR Federal Reserve OR FOMC)",
};

function parseTone(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarize(headlines: HeadlineItem[], riskScore: number, blocked: boolean) {
  if (!headlines.length) {
    return "No material surprise-news pressure detected in the free headline feed.";
  }

  if (blocked) {
    return `Headline pressure is too unstable right now, led by "${headlines[0].title}".`;
  }

  return `Headline risk is present but manageable. The most relevant item is "${headlines[0].title}".`;
}

export async function getHeadlineRisk(pair: CurrencyPair): Promise<HeadlineRisk> {
  const query = encodeURIComponent(pairQueryMap[pair]);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=10&format=json&sort=HybridRel`;

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Headline feed unavailable.");
    }

    const payload = (await response.json()) as {
      articles?: Array<{
        url?: string;
        title?: string;
        sourceCountry?: string;
        domain?: string;
        seendate?: string;
        tone?: number | string;
      }>;
    };

    const headlines: HeadlineItem[] = (payload.articles ?? [])
      .slice(0, 5)
      .map((article, index) => ({
        id: article.url ?? `${pair}-${index}`,
        title: article.title ?? "Untitled headline",
        source: article.domain ?? article.sourceCountry ?? "Unknown source",
        url: article.url ?? "#",
        publishedAt: article.seendate ?? new Date().toISOString(),
        tone: parseTone(article.tone),
      }));

    const negativePressure = headlines.reduce(
      (sum, item) => sum + (item.tone < 0 ? Math.abs(item.tone) : 0),
      0,
    );
    const riskScore = Math.min(100, Math.round(negativePressure * 6 + headlines.length * 4));
    const blocked = riskScore >= 58;

    return {
      riskScore,
      blocked,
      summary: summarize(headlines, riskScore, blocked),
      headlines,
    };
  } catch {
    return {
      riskScore: 18,
      blocked: false,
      summary: "Headline monitor fallback is active, so surprise-news protection is limited.",
      headlines: [],
    };
  }
}
