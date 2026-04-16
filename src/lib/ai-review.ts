import { AiTradeReview, TradePlan } from "@/lib/types";

function extractText(output: unknown): string {
  if (!Array.isArray(output)) return "";

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content
        .filter(
          (entry): entry is { type: string; text?: string } =>
            Boolean(entry) && typeof entry === "object" && "type" in entry,
        )
        .map((entry) => entry.text ?? "")
        .filter(Boolean);
    })
    .join("\n");
}

export async function generateAiReview(trade: Omit<TradePlan, "aiAnalysis">): Promise<AiTradeReview | null> {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return null;
  }

  const prompt = `
You are reviewing a forex trade plan. Do not suggest unsafe leverage. Respect the hard rules already computed.
Return strict JSON with keys:
verdict: TAKE | SKIP | WATCH
confidence: number from 0 to 100
summary: short string
strengths: string[]
risks: string[]
managementNotes: string[]
improvementIdeas: string[]

Trade plan:
${JSON.stringify(
    {
      pair: trade.pair,
      direction: trade.direction,
      entry: trade.entry,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      lotSize: trade.lotSize,
      riskAmount: trade.riskAmount,
      rewardAmount: trade.rewardAmount,
      confidenceScore: trade.confidenceScore,
      multiTimeframe: trade.multiTimeframe,
      watchedEvents: trade.watchedEvents,
      rationale: trade.rationale,
      conditions: trade.conditions,
      managementPlan: trade.managementPlan,
      calibration: trade.calibration,
    },
    null,
    2,
  )}
`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a disciplined forex risk reviewer. Be concise, skeptical, and output valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "trade_review",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                verdict: {
                  type: "string",
                  enum: ["TAKE", "SKIP", "WATCH"],
                },
                confidence: {
                  type: "number",
                },
                summary: {
                  type: "string",
                },
                strengths: {
                  type: "array",
                  items: { type: "string" },
                },
                risks: {
                  type: "array",
                  items: { type: "string" },
                },
                managementNotes: {
                  type: "array",
                  items: { type: "string" },
                },
                improvementIdeas: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: [
                "verdict",
                "confidence",
                "summary",
                "strengths",
                "risks",
                "managementNotes",
                "improvementIdeas",
              ],
            },
          },
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { output?: unknown };
    const text = extractText(payload.output);

    if (!text) {
      return null;
    }

    const review = JSON.parse(text) as AiTradeReview;
    return review;
  } catch {
    return null;
  }
}
