// ============================================================
// COINOVA - Groq AI Helper
// Build prompt từ market data + gọi Groq API
// ============================================================

import Groq from "groq-sdk";
import type { AnalysisRequestPayload, AIAnalysisResult } from "@/types";

// Lazy init để tránh lỗi khi import ở client
let groqClient: Groq | null = null;

function getGroq(): Groq {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
}

// ─── Prompt Builder ──────────────────────────────────────────

interface SystemConfig {
  systemPrompt: string;
  userPromptTemplate: string;
}

function buildUserPrompt(
  template: string,
  payload: AnalysisRequestPayload
): string {
  const { symbol, ticker, orderBook, recentTrades } = payload;

  const spread =
    orderBook.asks[0] && orderBook.bids[0]
      ? (
          parseFloat(orderBook.asks[0].price) -
          parseFloat(orderBook.bids[0].price)
        ).toFixed(2)
      : "N/A";

  const topBids = orderBook.bids
    .slice(0, 5)
    .map((b) => `${b.price} (${b.quantity})`)
    .join(", ");

  const topAsks = orderBook.asks
    .slice(0, 5)
    .map((a) => `${a.price} (${a.quantity})`)
    .join(", ");

  const tradesStr = recentTrades
    .slice(0, 10)
    .map(
      (t) =>
        `${t.isBuyerMaker ? "SELL" : "BUY"} ${t.quantity} @ ${t.price}`
    )
    .join("\n");

  return template
    .replace(/{symbol}/g, symbol)
    .replace(/{price}/g, ticker.price)
    .replace(/{priceChange}/g, ticker.priceChange)
    .replace(/{priceChangePercent}/g, ticker.priceChangePercent)
    .replace(/{highPrice}/g, ticker.highPrice)
    .replace(/{lowPrice}/g, ticker.lowPrice)
    .replace(/{volume}/g, ticker.volume)
    .replace(/{baseAsset}/g, ticker.baseAsset ?? symbol.replace("USDT", "").replace("BTC", ""))
    .replace(/{topBids}/g, topBids)
    .replace(/{topAsks}/g, topAsks)
    .replace(/{spread}/g, spread)
    .replace(/{recentTrades}/g, tradesStr || "No recent trades");
}

// ─── Main Analysis Function ───────────────────────────────────

export async function analyzeMarket(
  payload: AnalysisRequestPayload,
  config: SystemConfig
): Promise<AIAnalysisResult> {
  const groq = getGroq();

  const userPrompt = buildUserPrompt(config.userPromptTemplate, payload);

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: config.systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let result: AIAnalysisResult;
  try {
    result = JSON.parse(raw) as AIAnalysisResult;
  } catch {
    throw new Error(`Failed to parse Groq response: ${raw.slice(0, 200)}`);
  }

  // Đảm bảo timestamp tồn tại
  if (!result.timestamp) {
    result.timestamp = Date.now();
  }

  return result;
}
