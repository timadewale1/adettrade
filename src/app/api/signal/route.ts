import { NextRequest, NextResponse } from "next/server";

import {
  readAccountState,
  saveOpenTrade,
  setManualBalance,
} from "@/lib/account-store";
import { generateBestSignal, supportedPairs } from "@/lib/signal-engine";
import { CurrencyPair, SignalMode, SignalRequest, SignalResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SignalRequest;

    if (typeof body.manualBalance === "number" && body.manualBalance > 0) {
      await setManualBalance(body.manualBalance);
    }

    const requestedPairs = Array.isArray(body.selectedPairs)
      ? body.selectedPairs.filter((pair): pair is CurrencyPair => supportedPairs.includes(pair))
      : supportedPairs;
    const mode: SignalMode =
      body.mode === "Conservative" || body.mode === "Aggressive" || body.mode === "Balanced"
        ? body.mode
        : "Balanced";

    const state = await readAccountState();

    if (state.openTrade) {
      const response: SignalResponse = {
        state,
        signal: state.openTrade,
        headline: "Open trade already being tracked",
        reason: "Resolve the current trade before generating the next one.",
      };

      return NextResponse.json(response);
    }

    let signalResult: Awaited<ReturnType<typeof generateBestSignal>> | null = null;

    try {
      signalResult = await generateBestSignal(
        state.balance,
        state.history,
        state.journal,
        requestedPairs,
        mode,
      );
    } catch (error) {
      return NextResponse.json(
        {
          state,
          signal: null,
          headline: "Live market feed unavailable",
          reason:
            error instanceof Error
              ? error.message
              : "Unable to reach live forex data right now.",
        },
        { status: 503 },
      );
    }

    const signal = signalResult?.signal ?? null;
    const diagnostics = signalResult?.diagnostics ?? [];

    if (!signal) {
      const response: SignalResponse = {
        state,
        signal: null,
        headline: "No trade right now",
        reason: diagnostics.length
          ? `Capital stayed protected because the top live setups were rejected: ${diagnostics.join(" | ")}`
          : "Market quality is below the minimum threshold, so capital stays protected.",
      };

      return NextResponse.json(response);
    }

    const nextState = await saveOpenTrade(signal);
    const response: SignalResponse = {
      state: nextState,
      signal,
      headline: "Best trade plan is ready",
      reason:
        "The engine selected the highest-quality setup that passed the filters.",
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error while generating a signal.",
      },
      { status: 500 },
    );
  }
}
