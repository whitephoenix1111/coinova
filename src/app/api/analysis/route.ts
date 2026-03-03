// =============================================================================
// POST /api/analysis — Route phân tích thị trường bằng AI (Groq)
//
// NHIỆM VỤ:
//   Nhận market data thô từ client (giá, order book, trades),
//   build prompt từ system_config.json, gọi Groq API,
//   trả về AIAnalysisResult (JSON) cho client render trong AIAnalysisModal.
//
// LUỒNG XỬ LÝ:
//   Client (AnalyzeButton)
//     → POST /api/analysis { symbol, ticker, orderBook, recentTrades }
//     → [1] Validate Content-Type
//     → [2] Parse & validate payload
//     → [3] Load system_config.json (systemPrompt + userPromptTemplate)
//     → [4] Gọi analyzeMarket() trong lib/groq.ts
//     → [5] Trả AIAnalysisResult JSON về client
//
// TẠI SAO CẦN API ROUTE NÀY (không gọi Groq trực tiếp từ client):
//   - GROQ_API_KEY là secret — không được expose ra browser
//   - Next.js API Route chạy trên server → key chỉ tồn tại trong process.env server-side
//   - Client chỉ gọi /api/analysis, không bao giờ biết key
//
// MÃ LỖI TRẢ VỀ:
//   400 — Request sai định dạng (Content-Type sai, JSON lỗi, thiếu field bắt buộc)
//   500 — Lỗi server nội bộ (không đọc được system_config.json)
//   502 — Groq API thất bại (timeout, quota, model error, parse JSON thất bại)
//   200 — Thành công, body là AIAnalysisResult JSON
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { analyzeMarket } from "@/lib/groq";
import type { AnalysisRequestPayload } from "@/types";

// =============================================================================
// SystemConfig — Interface cho nội dung file system_config.json
//
// Tách interface ở đây (không import từ types/) vì đây là concern của server:
//   - Client không cần biết cấu trúc config
//   - Nếu sau này config thêm field mới (vd: temperature, model),
//     chỉ cần sửa ở đây và trong loadSystemConfig(), không ảnh hưởng types client
//
// Hai field:
//   systemPrompt        — vai trò AI, cách phân tích, yêu cầu format JSON
//                         Ví dụ: "You are COINOVA, an expert crypto analyst..."
//   userPromptTemplate  — template với placeholder {symbol}, {price}, {topBids}...
//                         buildUserPrompt() trong groq.ts sẽ replace các placeholder này
// =============================================================================
interface SystemConfig {
  systemPrompt: string;
  userPromptTemplate: string;
}

// =============================================================================
// loadSystemConfig — Đọc và parse file system_config.json từ root project
//
// TẠI SAO DÙNG FILE JSON THAY VÌ HARDCODE PROMPT:
//   - Có thể chỉnh prompt mà không cần recompile/redeploy code
//   - Dễ A/B test các prompt khác nhau
//   - Tách biệt "cấu hình AI" khỏi "logic code"
//
// path.join(process.cwd(), "system_config.json"):
//   process.cwd() trong Next.js server = thư mục gốc project (nơi có package.json)
//   → Đường dẫn tuyệt đối: D:/COINOVA/system_config.json
//   Không dùng __dirname vì Next.js build có thể thay đổi vị trí file compiled
//
// Lỗi có thể xảy ra:
//   - File không tồn tại → readFile throw ENOENT
//   - File không phải JSON hợp lệ → JSON.parse throw SyntaxError
//   Cả hai đều được bắt ở caller (route handler) và trả 500
// =============================================================================
async function loadSystemConfig(): Promise<SystemConfig> {
  const configPath = path.join(process.cwd(), "system_config.json");
  const raw = await readFile(configPath, "utf-8");
  return JSON.parse(raw) as SystemConfig;
}

// =============================================================================
// POST handler — Entry point duy nhất của route này
//
// Next.js App Router: export named function POST để handle HTTP POST.
// Các method khác (GET, PUT...) sẽ tự động trả 405 Method Not Allowed.
// =============================================================================
export async function POST(request: NextRequest) {

  // ── [1] Validate Content-Type ────────────────────────────────────────────
  // Bắt buộc phải là application/json vì ta gọi request.json() ở bước sau.
  // Nếu client gửi form-data hay text/plain → từ chối sớm với 415 Unsupported Media Type.
  // Dùng includes() thay vì === vì header thực tế có thể là "application/json; charset=utf-8"
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  // ── [2a] Parse JSON body ──────────────────────────────────────────────────
  // request.json() throw nếu body không phải JSON hợp lệ (vd: body rỗng, syntax error).
  // Wrap trong try-catch để trả 400 thay vì 500 (lỗi do client, không phải server).
  let payload: AnalysisRequestPayload;
  try {
    payload = (await request.json()) as AnalysisRequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── [2b] Validate các field bắt buộc ─────────────────────────────────────
  // Ba field tối thiểu để build prompt có ý nghĩa:
  //   symbol    — tên cặp tiền (vd: "BTCUSDT"), cần để đặt tên trong phân tích
  //   ticker    — giá hiện tại, % thay đổi 24h, high/low → context tổng quan
  //   orderBook — bids/asks top 5 → AI đọc áp lực mua/bán, tính spread
  // recentTrades là optional: AI vẫn phân tích được dù không có trades
  if (!payload.symbol || !payload.ticker || !payload.orderBook) {
    return NextResponse.json(
      { error: "Missing required fields: symbol, ticker, orderBook" },
      { status: 400 }
    );
  }

  // ── [3] Load system_config.json ───────────────────────────────────────────
  // Đọc file mỗi request (không cache) để:
  //   - Cho phép thay đổi prompt realtime mà không restart server
  //   - Không tốn RAM giữ config trong memory (file nhỏ, I/O nhanh)
  // Nếu cần tối ưu hiệu năng sau này: có thể cache với module-level variable
  // và invalidate khi file thay đổi (dùng fs.watch).
  let config: SystemConfig;
  try {
    config = await loadSystemConfig();
  } catch {
    // Lỗi ở đây là lỗi server (file thiếu hoặc corrupt) → 500
    // Không log chi tiết ra response vì có thể lộ đường dẫn file system
    return NextResponse.json(
      { error: "Failed to load system config" },
      { status: 500 }
    );
  }

  // ── [4] Gọi Groq qua analyzeMarket() ─────────────────────────────────────
  // analyzeMarket() trong lib/groq.ts thực hiện:
  //   1. buildUserPrompt(): replace placeholder trong userPromptTemplate bằng data thực
  //   2. groq.chat.completions.create(): gọi model llama-3.3-70b-versatile
  //   3. JSON.parse(): parse response về AIAnalysisResult
  //
  // Dùng 502 Bad Gateway (không phải 500) vì lỗi xảy ra ở upstream service (Groq),
  // không phải lỗi nội bộ của server COINOVA.
  // Các lỗi có thể gặp từ Groq:
  //   - Network timeout (Groq chậm hoặc down)
  //   - 429 Rate limit (quota hết)
  //   - Model trả về text không phải JSON dù đã set response_format: json_object
  //   - JSON.parse fail vì output bị truncate (max_tokens quá thấp)
  try {
    const result = await analyzeMarket(payload, config);
    // Thành công: trả AIAnalysisResult với 200 OK (default của NextResponse.json)
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Log đầy đủ ở server để debug, nhưng chỉ trả message ngắn gọn về client
    console.error("[/api/analysis] Groq error:", message);
    return NextResponse.json(
      { error: `AI analysis failed: ${message}` },
      { status: 502 }
    );
  }
}
