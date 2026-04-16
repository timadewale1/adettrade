import { NextRequest, NextResponse } from "next/server";

import { getAccountAnalytics } from "@/lib/analytics";
import { resolveOpenTrade } from "@/lib/account-store";
import { getLearningSummary } from "@/lib/learning";
import { ResolveTradeRequest } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ResolveTradeRequest;

  if (!body.outcome || !["WON", "LOST", "CANCELLED"].includes(body.outcome)) {
    return NextResponse.json(
      { error: "Outcome must be WON, LOST, or CANCELLED." },
      { status: 400 },
    );
  }

  try {
    const state = await resolveOpenTrade(body);
    return NextResponse.json({
      state,
      analytics: getAccountAnalytics(state.history),
      learning: getLearningSummary(state.journal),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to resolve trade.",
      },
      { status: 400 },
    );
  }
}
