"use client";

// =============================================================================
// AIAnalysisModal.tsx — Modal hiển thị kết quả phân tích AI từ Groq
//
// KÍCH HOẠT: Được mở khi user nhấn nút "🤖 Analyze" trong TradingViewChart.
//   1. Dashboard.triggerAnalysis() gọi → openModal() + setIsAnalyzing(true)
//   2. Modal render ngay với trạng thái loading (spinner)
//   3. Sau khi API /api/analysis trả về → setAIAnalysis(result) → modal render kết quả
//
// BA TRẠNG THÁI HIỂN THỊ (ưu tiên theo thứ tự):
//   A. isAnalyzing = true             → hiển thị spinner "Analyzing market data..."
//   B. isAnalyzing = false, có data   → hiển thị AnalysisContent (kết quả đầy đủ)
//   C. isAnalyzing = false, không data→ hiển thị "No analysis data available"
//
// ĐIỀU KIỆN ẨN: isModalOpen = false VÀ isAnalyzing = false → return null (unmount hoàn toàn)
//   Lý do check cả isAnalyzing: nếu user nhấn Analyze lần đầu, isModalOpen chưa kịp true
//   nhưng isAnalyzing đã true → vẫn phải hiển thị modal với spinner
//
// CẤU TRÚC DOM:
//   <Backdrop>     position: fixed, inset: 0, z-index: 50 — phủ toàn màn hình, click để đóng
//   <ModalPanel>   position: fixed, centered, z-index: 51 — panel chính
//     <Header>     tên coin + "Powered by Groq" + nút đóng ×
//     <Body>       scroll được — chứa spinner hoặc AnalysisContent
// =============================================================================

import { useDashboardStore } from "@/store/useDashboardStore";
import type { AIAnalysisResult, TrendDirection, TradeAction } from "@/types";

// -----------------------------------------------------------------------------
// TrendBadge — Hiển thị hướng xu thế thị trường: BULLISH / BEARISH / NEUTRAL
//
// Input: trend (TrendDirection từ AIAnalysisResult)
// Output: <span> với màu sắc tương ứng:
//   BULLISH → xanh lá (green)  + icon ↑
//   BEARISH → đỏ (red)         + icon ↓
//   NEUTRAL → vàng (yellow)    + icon →
//
// Dùng map thay vì if-else để dễ mở rộng thêm trạng thái
// Tất cả màu đều lấy từ CSS variables — không hardcode hex
// -----------------------------------------------------------------------------
function TrendBadge({ trend }: { trend: TrendDirection }) {
  const map: Record<TrendDirection, { color: string; bg: string; label: string; icon: string }> = {
    BULLISH: { color: "var(--green)",  bg: "var(--green-bg)",  label: "Bullish", icon: "↑" },
    BEARISH: { color: "var(--red)",    bg: "var(--red-bg)",    label: "Bearish", icon: "↓" },
    NEUTRAL: { color: "var(--yellow)", bg: "var(--yellow-bg)", label: "Neutral", icon: "→" },
  };
  const s = map[trend];
  return (
    <span style={{
      fontFamily:   "var(--font-display)",
      fontSize:     "12px",
      fontWeight:   600,
      color:        s.color,
      background:   s.bg,
      padding:      "3px 10px",
      borderRadius: "3px",
      border:       `1px solid ${s.color}33`, // 33 = 20% opacity hex
    }}>
      {s.icon} {s.label}
    </span>
  );
}

// -----------------------------------------------------------------------------
// ActionBadge — Hiển thị tín hiệu giao dịch: BUY / SELL / HOLD
//
// Giống TrendBadge nhưng lớn hơn (fontSize: 18px) vì đây là thông tin quan trọng nhất
// BUY  → xanh lá | SELL → đỏ | HOLD → vàng
// letterSpacing: 0.1em để chữ in hoa dễ đọc hơn
// -----------------------------------------------------------------------------
function ActionBadge({ action }: { action: TradeAction }) {
  const map: Record<TradeAction, { color: string; bg: string }> = {
    BUY:  { color: "var(--green)",  bg: "var(--green-bg)"  },
    SELL: { color: "var(--red)",    bg: "var(--red-bg)"    },
    HOLD: { color: "var(--yellow)", bg: "var(--yellow-bg)" },
  };
  const s = map[action];
  return (
    <span style={{
      fontFamily:    "var(--font-display)",
      fontSize:      "18px",
      fontWeight:    700,
      color:         s.color,
      background:    s.bg,
      padding:       "6px 20px",
      borderRadius:  "4px",
      border:        `1px solid ${s.color}44`, // 44 = ~27% opacity hex
      letterSpacing: "0.1em",
    }}>
      {action}
    </span>
  );
}

// -----------------------------------------------------------------------------
// ConfidenceBar — Thanh tiến trình hiển thị độ tự tin của AI (0–100%)
//
// Màu thanh thay đổi theo ngưỡng:
//   >= 70% → xanh lá (AI khá chắc chắn)
//   >= 40% → vàng   (AI phân vân)
//   <  40% → đỏ     (AI không chắc — nên cẩn thận)
//
// transition: width 0.6s ease → animation khi giá trị thay đổi
// Thanh nền (background: var(--border-subtle)) luôn rộng 100% làm track
// Thanh fill có width = value% để hiển thị progress
// -----------------------------------------------------------------------------
function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? "var(--green)" : value >= 40 ? "var(--yellow)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {/* Track: toàn bộ chiều ngang */}
      <div style={{ flex: 1, height: "4px", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
        {/* Fill: chiều rộng = % confidence */}
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: "2px", transition: "width 0.6s ease" }} />
      </div>
      {/* Label số: hiển thị % bên phải, căn phải cố định 36px để không nhảy layout */}
      <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 600, color, minWidth: "36px", textAlign: "right" }}>
        {value}%
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SectionTitle — Tiêu đề section nhỏ bên trong modal
//
// Style: chữ hoa nhỏ (10px uppercase) + gạch dưới border
// Dùng chung cho: Confidence, AI Summary, Reasoning, Trade Levels, Support/Resistance
// -----------------------------------------------------------------------------
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    "var(--font-display)",
      fontSize:      "10px",
      fontWeight:    600,
      color:         "var(--text-tertiary)",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      marginBottom:  "8px",
      paddingBottom: "4px",
      borderBottom:  "1px solid var(--border-subtle)",
    }}>
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// AnalysisContent — Toàn bộ nội dung kết quả AI (chỉ render khi có aiAnalysis)
//
// Hiển thị theo thứ tự từ trên xuống dưới:
//   1. Signal (ActionBadge: BUY/SELL/HOLD) + Trend (TrendBadge: BULLISH/BEARISH/NEUTRAL)
//   2. Confidence bar — độ tự tin của AI kèm strength label (vd: "STRONG", "WEAK")
//   3. AI Summary — đoạn văn tóm tắt phân tích tổng thể
//   4. Reasoning — lý do chi tiết (optional, chỉ hiển thị nếu có)
//   5. Trade Levels — Entry / Take Profit / Stop Loss (tất cả optional)
//   6. Key Levels — Support và Resistance (2 cột grid, mỗi cột là list badge)
//   7. Timestamp — thời gian phân tích, dùng toLocaleString() theo múi giờ local
//
// Các trường optional (signal.entryPrice, takeProfit, stopLoss, signal.reasoning)
// dùng conditional rendering (&&) — không render nếu AI không trả về
// -----------------------------------------------------------------------------
function AnalysisContent({ result }: { result: AIAnalysisResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Hàng 1: Signal (trái) + Trend (phải) ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Signal</div>
          <ActionBadge action={result.signal.action} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Trend</div>
          <TrendBadge trend={result.trend} />
        </div>
      </div>

      {/* ── Confidence bar — tiêu đề kèm strength label, thanh progress bên dưới ── */}
      <div>
        <SectionTitle>Confidence — {result.signal.strength}</SectionTitle>
        <ConfidenceBar value={result.signal.confidence} />
      </div>

      {/* ── AI Summary — đoạn văn tóm tắt do Groq sinh ra ── */}
      <div>
        <SectionTitle>AI Summary</SectionTitle>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "13px", lineHeight: 1.6, color: "var(--text-secondary)" }}>
          {result.summary}
        </p>
      </div>

      {/* ── Reasoning — lý do chi tiết (optional, Groq có thể không trả về) ── */}
      {result.signal.reasoning && (
        <div>
          <SectionTitle>Reasoning</SectionTitle>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "12px", lineHeight: 1.6, color: "var(--text-tertiary)" }}>
            {result.signal.reasoning}
          </p>
        </div>
      )}

      {/* ── Trade Levels: Entry / TP / SL (tất cả optional) ── */}
      {/* Chỉ render section này nếu AI cung cấp ít nhất 1 trong 3 giá trị */}
      <div>
        <SectionTitle>Trade Levels</SectionTitle>
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "12px" }}>
          {/* Entry: màu primary (trung tính) */}
          {result.signal.entryPrice && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)" }}>Entry</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{result.signal.entryPrice}</span>
            </div>
          )}
          {/* Take Profit: màu xanh lá — mức giá mục tiêu chốt lời */}
          {result.signal.takeProfit && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)" }}>Take Profit</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--green)" }}>{result.signal.takeProfit}</span>
            </div>
          )}
          {/* Stop Loss: màu đỏ — mức giá cắt lỗ */}
          {result.signal.stopLoss && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-secondary)" }}>Stop Loss</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--red)" }}>{result.signal.stopLoss}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Key Levels: Support (trái, xanh lá) và Resistance (phải, đỏ) ── */}
      {/* Grid 2 cột đều nhau — mỗi level là badge có border-left màu tương ứng */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <SectionTitle>Support</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {result.keyLevels.support.map((level) => (
              <span key={level} style={{ fontFamily: "var(--font-display)", fontSize: "12px", color: "var(--green)", background: "var(--green-bg)", padding: "3px 8px", borderRadius: "3px", borderLeft: "2px solid var(--green)" }}>
                {level}
              </span>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>Resistance</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {result.keyLevels.resistance.map((level) => (
              <span key={level} style={{ fontFamily: "var(--font-display)", fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", padding: "3px 8px", borderRadius: "3px", borderLeft: "2px solid var(--red)" }}>
                {level}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Indicators ── */}
      {result.indicators && result.indicators.length > 0 && (
        <div>
          <SectionTitle>Indicators</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {result.indicators.map((ind) => (
              <div key={ind.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "4px", padding: "8px 10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{ind.name}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--text-tertiary)" }}>{ind.interpretation}</span>
                </div>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap", marginLeft: "12px" }}>{ind.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Timestamp: thời điểm AI phân tích, hiển thị góc phải dưới ── */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", textAlign: "right" }}>
        Analysis at {new Date(result.timestamp).toLocaleString()}
      </div>
    </div>
  );
}

// =============================================================================
// AIAnalysisModal (default export) — Modal chính
//
// Đọc 5 giá trị từ store:
//   isModalOpen  → kiểm soát modal có hiển thị không
//   aiAnalysis   → kết quả AI (null khi chưa có hoặc đang load)
//   isAnalyzing  → true khi đang chờ API trả về
//   closeModal   → action để đóng modal (khi click backdrop hoặc nút ×)
//   activeSymbol → hiển thị tên cặp tiền trong header modal (vd: "BTCUSDT")
//
// GUARD: if (!isModalOpen && !isAnalyzing) return null
//   → Unmount hoàn toàn khi không cần thiết (không render DOM ẩn)
//   → Phải check cả isAnalyzing vì triggerAnalysis gọi setIsAnalyzing(true) TRƯỚC openModal()
//     nên có khoảnh khắc ngắn isAnalyzing=true nhưng isModalOpen=false
//
// ANIMATION:
//   Backdrop: fadeIn 0.15s (CSS keyframe định nghĩa trong globals.css)
//   Panel:    slideUp 0.2s (từ translateY(10px) → translateY(0))
// =============================================================================
export default function AIAnalysisModal() {
  const isModalOpen     = useDashboardStore((s) => s.isModalOpen);
  const aiAnalysis      = useDashboardStore((s) => s.aiAnalysis);
  const isAnalyzing     = useDashboardStore((s) => s.isAnalyzing);
  const analysisError   = useDashboardStore((s) => s.analysisError);
  const closeModal      = useDashboardStore((s) => s.closeModal);
  const activeSymbol    = useDashboardStore((s) => s.activeSymbol);

  // Guard: ẩn modal hoàn toàn khi không cần hiển thị
  if (!isModalOpen && !isAnalyzing) return null;

  return (
    <>
      {/* ── Backdrop: lớp phủ tối toàn màn hình — click để đóng modal ── */}
      <div
        onClick={closeModal}
        style={{
          position:       "fixed",
          inset:          0,                          // top/right/bottom/left: 0
          background:     "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",                // làm mờ nội dung phía sau
          zIndex:         50,
          animation:      "fadeIn 0.15s ease",
        }}
      />

      {/* ── Modal Panel: nổi lên trên backdrop, căn giữa màn hình ── */}
      <div style={{
        position:       "fixed",
        top:            "50%",
        left:           "50%",
        transform:      "translate(-50%, -50%)",      // căn giữa chính xác
        zIndex:         51,                            // cao hơn backdrop 1 bậc
        width:          "min(520px, calc(100vw - 32px))", // responsive: tối đa 520px, trừ margin 16px mỗi bên
        maxHeight:      "80vh",                        // không cao hơn 80% viewport
        background:     "var(--bg-panel)",
        border:         "1px solid var(--border-default)",
        borderRadius:   "8px",
        boxShadow:      "0 24px 80px rgba(0,0,0,0.6)",
        animation:      "slideUp 0.2s ease",
        display:        "flex",
        flexDirection:  "column",
        overflow:       "hidden",                      // clip nội dung overflow
      }}>

        {/* ── Header modal: icon + tên coin + nút đóng × ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>🤖</span>
            <div>
              {/* Tiêu đề modal */}
              <div style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>AI Analysis</div>
              {/* Subtitle: cặp tiền đang xem + nguồn AI */}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>
                {activeSymbol} · Powered by Groq
              </div>
            </div>
          </div>
          {/* Nút đóng × — gọi closeModal để set isModalOpen = false */}
          <button onClick={closeModal} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "18px", padding: "2px 6px", borderRadius: "4px", lineHeight: 1 }}>×</button>
        </div>

        {/* ── Body: scroll được, chứa spinner hoặc kết quả ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>

          {/* Trạng thái A: đang phân tích → spinner + text */}
          {isAnalyzing ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "40px 20px" }}>
              {/* Spinner: border-top có màu accent, phần còn lại transparent → hiệu ứng quay */}
              <div className="spin" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "3px solid var(--border-subtle)", borderTopColor: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", color: "var(--text-secondary)" }}>Analyzing market data...</span>
            </div>

          ) : aiAnalysis ? (
            // Trạng thái B: có data → render toàn bộ kết quả
            <AnalysisContent result={aiAnalysis} />

          ) : analysisError ? (
            // Trạng thái D: lỗi API — hiển thị rõ lý do
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "40px 20px", textAlign: "center" }}>
              <span style={{ fontSize: "28px" }}>⚠️</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--red)" }}>Analysis Failed</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", background: "var(--bg-elevated)", padding: "8px 12px", borderRadius: "4px", border: "1px solid var(--border-subtle)", maxWidth: "100%", wordBreak: "break-word" }}>
                {analysisError}
              </span>
            </div>
          ) : (
            // Trạng thái C: modal mở nhưng không có data (edge case)
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-tertiary)", fontFamily: "var(--font-display)", fontSize: "12px" }}>
              No analysis data available
            </div>
          )}
        </div>
      </div>
    </>
  );
}
