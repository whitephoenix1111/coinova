/**
 * groq.ts
 *
 * Helper để gọi Groq AI API và phân tích thị trường crypto.
 *
 * Vai trò trong kiến trúc:
 * - Chỉ được import từ /api/analysis route (server-side).
 * - KHÔNG BAO GIỜ được import từ client component — GROQ_API_KEY chỉ tồn tại
 *   server-side và phải được giữ bí mật hoàn toàn, không được expose ra browser.
 *
 * Flow hoàn chỉnh:
 *   Client nhấn "Analyze" → POST /api/analysis (kèm market data)
 *     → route.ts đọc system_config.json → gọi analyzeMarket() ở đây
 *     → buildUserPrompt() inject market data vào template
 *     → Groq API (llama-3.3-70b-versatile) trả về JSON
 *     → parse + validate → trả AIAnalysisResult về client
 *
 * Thiết kế Prompt:
 * - System prompt: định nghĩa vai trò AI, quy tắc output, schema JSON cần trả về.
 *   Được đọc từ system_config.json (file trên disk, developer chỉnh khi cần).
 * - User prompt: snapshot thị trường tại thời điểm phân tích, build từ template
 *   bằng cách replace placeholder với data thực.
 * - temperature: 0.3 — ưu tiên nhất quán và logic hơn sáng tạo. AI trading analysis
 *   cần reproducible, không cần creative.
 */

import Groq from "groq-sdk";
import type { AnalysisRequestPayload, AIAnalysisResult } from "@/types";

// ─── Groq Client (Lazy Singleton) ───────────────────────────────────────────

/**
 * Instance duy nhất của Groq client, khởi tạo lazy (chỉ tạo khi cần lần đầu).
 *
 * Tại sao lazy thay vì khởi tạo ngay khi module load?
 * Nếu khởi tạo ngay lúc import, Next.js có thể bundle file này vào client bundle
 * trong một số edge case, khiến constructor Groq chạy ở browser và throw error
 * vì `process.env.GROQ_API_KEY` không tồn tại ở client-side.
 * Lazy init đảm bảo Groq chỉ được tạo khi `analyzeMarket()` thực sự được gọi
 * — và hàm đó chỉ được gọi từ server route.
 */
let groqClient: Groq | null = null;

/**
 * Trả về Groq client singleton, tạo mới nếu chưa có.
 * Đọc GROQ_API_KEY từ environment variable — key này chỉ tồn tại server-side.
 */
function getGroq(): Groq {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
}

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Cấu trúc của system_config.json — file cấu hình prompt template trên disk.
 *
 * Developer chỉnh file này khi muốn thay đổi hành vi phân tích của AI
 * (ví dụ: thêm indicator mới, thay đổi ngôn ngữ output, điều chỉnh schema JSON).
 * Không cần deploy lại code — chỉ cần cập nhật file JSON.
 */
interface SystemConfig {
  /** System prompt gửi kèm mỗi request, định nghĩa vai trò và schema output của AI. */
  systemPrompt: string;
  /**
   * Template cho user prompt. Chứa các placeholder dạng {key}
   * sẽ được replace bằng market data thực tế trong buildUserPrompt().
   * Ví dụ placeholder: {symbol}, {price}, {topBids}, {recentTrades}, ...
   */
  userPromptTemplate: string;
}

// ─── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Build user prompt hoàn chỉnh từ template và market data thực tế.
 *
 * Hàm này extract các điểm dữ liệu quan trọng từ payload, format chúng thành
 * string dễ đọc cho LLM, rồi inject vào template bằng cách replace placeholder.
 *
 * Dữ liệu được inject vào prompt:
 * - Thông tin cơ bản: symbol, giá hiện tại, % thay đổi 24h, high/low, volume
 * - Order book tóm tắt: top 5 bids và asks (giá + khối lượng)
 * - Spread: khoảng cách giữa ask thấp nhất và bid cao nhất — indicator thanh khoản
 * - 10 giao dịch gần nhất: chiều (BUY/SELL), khối lượng, giá — để AI đánh giá order flow
 *
 * Tại sao chỉ top 5 bids/asks và 10 trades?
 * LLM có context window hữu hạn và tính tiền theo token. Gửi ít data hơn = nhanh hơn + rẻ hơn.
 * Top 5 levels đủ để thấy immediate support/resistance, 10 trades đủ để đánh giá momentum.
 *
 * @param template - Template string từ system_config.json với các placeholder {key}.
 * @param payload  - Market data snapshot từ client tại thời điểm nhấn "Analyze".
 * @returns User prompt hoàn chỉnh, sẵn sàng gửi cho Groq API.
 */
function buildUserPrompt(
  template: string,
  payload: AnalysisRequestPayload
): string {
  const { symbol, ticker, orderBook, recentTrades } = payload;

  /**
   * Spread = ask thấp nhất - bid cao nhất, tính bằng USD.
   * Spread hẹp → thanh khoản cao, thị trường active.
   * Spread rộng → thanh khoản thấp hoặc biến động lớn.
   * "N/A" khi order book chưa có data (edge case ngay sau khi đổi coin).
   */
  const spread =
    orderBook.asks[0] && orderBook.bids[0]
      ? (
          parseFloat(orderBook.asks[0].price) -
          parseFloat(orderBook.bids[0].price)
        ).toFixed(2)
      : "N/A";

  /**
   * Format top 5 bids thành string dễ đọc cho LLM.
   * Bids được sắp xếp từ cao → thấp (Binance standard) nên index 0 là bid cao nhất (best bid).
   * Format: "price (quantity), price (quantity), ..."
   */
  const topBids = orderBook.bids
    .slice(0, 5)
    .map((b) => `${b.price} (${b.quantity})`)
    .join(", ");

  /**
   * Format top 5 asks thành string dễ đọc cho LLM.
   * Asks được sắp xếp từ thấp → cao (Binance standard) nên index 0 là ask thấp nhất (best ask).
   * Format: "price (quantity), price (quantity), ..."
   */
  const topAsks = orderBook.asks
    .slice(0, 5)
    .map((a) => `${a.price} (${a.quantity})`)
    .join(", ");

  /**
   * Format 10 giao dịch gần nhất thành dạng LLM dễ parse.
   * isBuyerMaker = true  → người mua là maker (đặt lệnh chờ) → giao dịch này là SELL pressure
   * isBuyerMaker = false → người mua là taker (khớp lệnh ngay) → giao dịch này là BUY pressure
   * Format mỗi dòng: "BUY 0.5 @ 42000.00" hoặc "SELL 1.2 @ 41999.50"
   */
  const tradesStr = recentTrades
    .slice(0, 10)
    .map(
      (t) => `${t.isBuyerMaker ? "SELL" : "BUY"} ${t.quantity} @ ${t.price}`
    )
    .join("\n");

  /**
   * Replace tất cả placeholder trong template với giá trị thực.
   * Dùng regex /g để replace tất cả occurrence (không chỉ lần đầu tiên)
   * trong trường hợp template tái sử dụng cùng placeholder ở nhiều chỗ.
   *
   * baseAsset: tên coin gốc (ví dụ: BTC từ BTCUSDT).
   * Ưu tiên lấy từ ticker.baseAsset nếu có, fallback bằng cách strip "USDT"/"BTC" suffix.
   */
  return template
    .replace(/{symbol}/g, symbol)
    .replace(/{price}/g, ticker.price)
    .replace(/{priceChange}/g, ticker.priceChange)
    .replace(/{priceChangePercent}/g, ticker.priceChangePercent)
    .replace(/{highPrice}/g, ticker.highPrice)
    .replace(/{lowPrice}/g, ticker.lowPrice)
    .replace(/{volume}/g, ticker.volume)
    .replace(
      /{baseAsset}/g,
      ticker.baseAsset ?? symbol.replace("USDT", "").replace("BTC", "")
    )
    .replace(/{topBids}/g, topBids)
    .replace(/{topAsks}/g, topAsks)
    .replace(/{spread}/g, spread)
    .replace(/{recentTrades}/g, tradesStr || "No recent trades");
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

/**
 * Gọi Groq API để phân tích thị trường và trả về kết quả có cấu trúc.
 *
 * Được gọi bởi /api/analysis route sau khi đã đọc system_config.json từ disk.
 *
 * Model configuration:
 * - model: "llama-3.3-70b-versatile" — model mạnh nhất của Groq free tier, cân bằng tốt
 *   giữa chất lượng phân tích và tốc độ response
 * - temperature: 0.3 — thấp để output nhất quán, ít hallucination, logic chặt chẽ
 *   (0 = deterministic, 1 = creative/random; trading analysis cần gần 0 hơn)
 * - max_tokens: 1024 — đủ cho toàn bộ AIAnalysisResult JSON, không lãng phí token
 * - response_format: json_object — ép Groq trả về valid JSON, tránh phải parse markdown
 *   code fence hay text prefix ("Here is the analysis: ...")
 *
 * Output language strategy:
 * - Enum cố định (signal, trend, strength): tiếng Anh vì code map trực tiếp vào badge components
 * - Văn bản tự do (summary, reasoning, interpretation): tiếng Việt, ràng buộc trong system prompt
 *
 * @param payload - Market data snapshot từ client: symbol, ticker, orderBook, recentTrades.
 * @param config  - Prompt templates đọc từ system_config.json.
 * @returns AIAnalysisResult đã được parse và validate cơ bản.
 * @throws Error nếu Groq API call thất bại hoặc response không parse được thành JSON hợp lệ.
 */
export async function analyzeMarket(
  payload: AnalysisRequestPayload,
  config: SystemConfig
): Promise<AIAnalysisResult> {
  const groq = getGroq();

  // Inject market data thực vào template để tạo prompt cụ thể cho thời điểm này
  const userPrompt = buildUserPrompt(config.userPromptTemplate, payload);

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        // Định nghĩa vai trò AI, schema JSON cần trả về, và ngôn ngữ output
        content: config.systemPrompt,
      },
      {
        role: "user",
        // Snapshot thị trường tại thời điểm nhấn "Analyze"
        content: userPrompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 1024,
    // Ép Groq trả về JSON thuần túy, không có markdown fence hay text thừa
    response_format: { type: "json_object" },
  });

  // Lấy nội dung text từ response. Fallback về "{}" nếu content null (edge case hiếm gặp)
  const raw = completion.choices[0]?.message?.content ?? "{}";

  // Parse JSON response từ Groq sang AIAnalysisResult
  let result: AIAnalysisResult;
  try {
    result = JSON.parse(raw) as AIAnalysisResult;
  } catch {
    // Log 200 ký tự đầu để debug mà không flood logs với response dài
    throw new Error(`Failed to parse Groq response: ${raw.slice(0, 200)}`);
  }

  /**
   * Đảm bảo timestamp luôn tồn tại trong result.
   * Timestamp dùng để hiển thị "Phân tích lúc HH:mm:ss" trong modal.
   * Groq đôi khi không include timestamp trong JSON nếu schema không ràng buộc chặt,
   * nên inject ở đây như một safety net.
   */
  if (!result.timestamp) {
    result.timestamp = Date.now();
  }

  return result;
}
