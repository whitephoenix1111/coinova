// ============================================================
// POST /api/analysis
// Nhận market data từ client, gọi Groq, trả AIAnalysisResult
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { analyzeMarket } from "@/lib/groq";
import type { AnalysisRequestPayload } from "@/types";

// ─── Load system config ──────────────────────────────────────

interface SystemConfig {
  systemPrompt: string;
  userPromptTemplate: string;
}

async function loadSystemConfig(): Promise<SystemConfig> {
  const configPath = path.join(process.cwd(), "system_config.json");
  const raw = await readFile(configPath, "utf-8");
  return JSON.parse(raw) as SystemConfig;
}

// ─── Route Handler ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Validate content type
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  let payload: AnalysisRequestPayload;
  try {
    payload = (await request.json()) as AnalysisRequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Basic validation
  if (!payload.symbol || !payload.ticker || !payload.orderBook) {
    return NextResponse.json(
      { error: "Missing required fields: symbol, ticker, orderBook" },
      { status: 400 }
    );
  }

  // Load config
  let config: SystemConfig;
  try {
    config = await loadSystemConfig();
  } catch {
    return NextResponse.json(
      { error: "Failed to load system config" },
      { status: 500 }
    );
  }

  // Call Groq
  try {
    const result = await analyzeMarket(payload, config);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/analysis] Groq error:", message);
    return NextResponse.json(
      { error: `AI analysis failed: ${message}` },
      { status: 502 }
    );
  }
}
