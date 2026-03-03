"use client";

// =============================================================================
// BottomTicker.tsx — Thanh ticker cuộn ngang liên tục ở dưới cùng dashboard
//
// NHIỆM VỤ:
//   - Hiển thị giá + % thay đổi 24h của tất cả cặp tiền trong bottomTickers (store)
//   - Cuộn ngang tự động, liên tục, vô hạn (CSS animation "ticker-track")
//   - Cho phép click vào bất kỳ coin nào để chuyển activeSymbol → đổi chart + orderbook
//
// LUỒNG DATA:
//   Binance WebSocket (@ticker stream) → useBinanceStream → updateBottomTicker (store)
//   → bottomTickers[] trong store cập nhật liên tục → BottomTicker re-render
//
// KỸ THUẬT CUỘN VÔ HẠN (seamless loop):
//   Render danh sách 2 lần liên tiếp:
//     [Copy A: BTCUSDT ... AVAXUSDT] [Copy B: BTCUSDT ... AVAXUSDT]
//   CSS animation dịch chuyển container sang trái đúng bằng width của Copy A,
//   rồi reset về 0 → tạo ảo giác cuộn vô tận không bị giật
//   Copy B dùng aria-hidden="true" để screen reader không đọc 2 lần
//
// FADE EDGE (gradient overlay):
//   2 div position: absolute ở 2 cạnh trái/phải
//   Gradient từ màu panel → transparent
//   pointer-events: none → không chặn click vào ticker bên dưới
//   zIndex: 2 để đè lên ticker track
//
// LOADING STATE:
//   bottomTickers.length === 0 → hiển thị "Connecting to market data..."
//   Xảy ra trong giây đầu trước khi WebSocket kết nối xong
// =============================================================================

import { useDashboardStore } from "@/store/useDashboardStore";

export default function BottomTicker() {
  // Lấy danh sách tickers — cập nhật liên tục từ WebSocket qua updateBottomTicker
  const bottomTickers   = useDashboardStore((s) => s.bottomTickers);
  // setActiveSymbol: khi user click, đổi activeSymbol → TradingViewChart + OrderBook reload
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);
  // activeSymbol: để highlight item đang được xem trong ticker bar
  const activeSymbol    = useDashboardStore((s) => s.activeSymbol);

  // Loading state: WebSocket chưa kết nối hoặc store chưa được seed
  if (bottomTickers.length === 0) {
    return (
      <div style={{ height: "32px", background: "var(--bg-panel)", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0 }}>
        <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-display)", fontSize: "11px" }}>
          Connecting to market data...
        </span>
      </div>
    );
  }

  return (
    // Container: cao cố định 32px, overflow hidden để clip ticker ra ngoài biên
    // flexShrink: 0 để không bị BentoGrid co lại
    <div style={{ height: "32px", background: "var(--bg-panel)", borderTop: "1px solid var(--border-subtle)", overflow: "hidden", position: "relative", flexShrink: 0 }}>

      {/* Fade trái: gradient panel → transparent, che phần ticker đang "xuất hiện" */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "40px", height: "100%", background: "linear-gradient(to right, var(--bg-panel), transparent)", zIndex: 2, pointerEvents: "none" }} />

      {/* Fade phải: gradient transparent → panel, che phần ticker đang "biến mất" */}
      <div style={{ position: "absolute", right: 0, top: 0, width: "40px", height: "100%", background: "linear-gradient(to left, var(--bg-panel), transparent)", zIndex: 2, pointerEvents: "none" }} />

      {/* ticker-track: CSS class định nghĩa animation cuộn trong globals.css
          width: max-content → container tự mở rộng theo nội dung (không wrap)
          display: flex để các item nằm ngang hàng */}
      <div className="ticker-track" style={{ display: "flex", alignItems: "center", height: "100%", width: "max-content" }}>

        {/* Copy A: bản gốc — prefix key "a-" để tránh duplicate key với Copy B */}
        {bottomTickers.map((t) => (
          <TickerItem
            key={`a-${t.symbol}`}
            t={t}
            isActive={t.symbol === activeSymbol}
            onClick={() => setActiveSymbol(t.symbol)}
          />
        ))}

        {/* Copy B: bản lặp lại cho seamless loop
            aria-hidden="true": screen reader bỏ qua, tránh đọc 2 lần
            display: "contents" → không tạo thêm DOM node bao ngoài */}
        <div aria-hidden="true" style={{ display: "contents" }}>
          {bottomTickers.map((t) => (
            <TickerItem
              key={`b-${t.symbol}`}
              t={t}
              isActive={t.symbol === activeSymbol}
              onClick={() => setActiveSymbol(t.symbol)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// TickerItem — Một ô đơn lẻ trong thanh ticker
//
// Props:
//   t        → dữ liệu của cặp tiền (symbol, baseAsset, price, priceChangePercent)
//   isActive → true nếu đây là cặp đang được xem → highlight nền + màu accent
//   onClick  → gọi setActiveSymbol(t.symbol) khi click
//
// HIỂN THỊ (3 phần trên 1 hàng):
//   [baseAsset]  → tên coin ngắn (vd: "BTC"), màu accent khi active
//   [price]      → giá hiện tại format 2 chữ số thập phân với dấu phẩy ngàn
//   [%change]    → thêm "+" nếu dương, màu xanh/đỏ theo sign
//
// Mỗi item cách nhau bằng borderRight: "1px solid var(--border-subtle)"
// Khi isActive: background var(--bg-active) để highlight cặp đang xem
// -----------------------------------------------------------------------------
function TickerItem({
  t,
  isActive,
  onClick,
}: {
  t: { symbol: string; baseAsset: string; price: string; priceChangePercent: string };
  isActive: boolean;
  onClick: () => void;
}) {
  const change = parseFloat(t.priceChangePercent); // parse từ string sang number để so sánh
  const isPos  = change >= 0;                       // true = tăng/không đổi, false = giảm

  return (
    <button
      onClick={onClick}
      style={{
        display:     "flex",
        alignItems:  "center",
        gap:         "6px",
        padding:     "0 14px",
        height:      "32px",
        background:  isActive ? "var(--bg-active)" : "transparent", // highlight nếu đang xem
        border:      "none",
        borderRight: "1px solid var(--border-subtle)",               // ngăn cách các item
        cursor:      "pointer",
        flexShrink:  0, // không co lại khi container quá nhỏ
      }}
    >
      {/* Tên coin: màu accent khi active, secondary khi không active */}
      <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, color: isActive ? "var(--accent)" : "var(--text-secondary)" }}>
        {t.baseAsset}
      </span>

      {/* Giá: format en-US với 2 số thập phân → "95,000.00" */}
      <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 500, color: "var(--text-primary)" }}>
        {parseFloat(t.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>

      {/* % thay đổi: "+" prefix khi dương, màu xanh/đỏ */}
      <span style={{ fontFamily: "var(--font-display)", fontSize: "10px", fontWeight: 500, color: isPos ? "var(--green)" : "var(--red)" }}>
        {isPos ? "+" : ""}{change.toFixed(2)}%
      </span>
    </button>
  );
}
