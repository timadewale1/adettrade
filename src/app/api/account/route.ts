import { NextRequest, NextResponse } from "next/server";

import { getAccountAnalytics } from "@/lib/analytics";
import { readAccountState, setManualBalance } from "@/lib/account-store";
import { getLearningSummary } from "@/lib/learning";

export async function GET() {
  const state = await readAccountState();
  return NextResponse.json({
    state,
    analytics: getAccountAnalytics(state.history),
    learning: getLearningSummary(state.journal),
  });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as { balance?: number };

  if (typeof body.balance !== "number" || body.balance <= 0) {
    return NextResponse.json(
      { error: "A positive balance is required." },
      { status: 400 },
    );
  }

  const state = await setManualBalance(body.balance);
  return NextResponse.json({
    state,
    analytics: getAccountAnalytics(state.history),
    learning: getLearningSummary(state.journal),
  });
}
