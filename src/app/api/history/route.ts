// ============================================================
// GET /api/history?symbol=BTCUSDT
// Proxy Binance REST depth snapshot để tránh CORS
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { fetchDepthSnapshot } from "@/lib/binance";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing required parameter: symbol" },
      { status: 400 }
    );
  }

  try {
    const snapshot = await fetchDepthSnapshot(symbol.toUpperCase(), limit);

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch depth: ${message}` },
      { status: 502 }
    );
  }
}
