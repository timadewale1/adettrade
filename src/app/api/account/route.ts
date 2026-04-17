import { NextRequest, NextResponse } from "next/server";

import { getAccountAnalytics } from "@/lib/analytics";
import { readAccountState, setManualBalance } from "@/lib/account-store";
import { getLearningSummary } from "@/lib/learning";

export async function GET() {
  try {
    const state = await readAccountState();
    return NextResponse.json({
      state,
      analytics: getAccountAnalytics(state.history),
      learning: getLearningSummary(state.journal),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load account state.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
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
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update balance.",
      },
      { status: 500 },
    );
  }
}
