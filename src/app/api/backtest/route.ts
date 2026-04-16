import { NextRequest, NextResponse } from "next/server";

import { getBacktestReport } from "@/lib/backtest";
import { CurrencyPair } from "@/lib/types";

const supportedPairs: CurrencyPair[] = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD"];

export async function GET(request: NextRequest) {
  const pair = request.nextUrl.searchParams.get("pair") as CurrencyPair | null;
  const targetPair = pair && supportedPairs.includes(pair) ? pair : "EUR/USD";

  try {
    const report = await getBacktestReport(targetPair);
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate backtest." },
      { status: 400 },
    );
  }
}
