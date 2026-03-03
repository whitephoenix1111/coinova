"use client";

// =============================================================================
// BentoGrid.tsx — Layout tổng của toàn bộ dashboard COINOVA
//
// NHIỆM VỤ DUY NHẤT: Dàn layout các component con theo đúng cấu trúc UI.
// File này KHÔNG chứa logic, KHÔNG đọc store, KHÔNG xử lý data.
// Chỉ import và sắp xếp vị trí các component.
//
// CẤU TRÚC LAYOUT (flex column chiếm 100dvh × 100vw, không scroll):
//
//   ┌──────────────────────────────────────────────────────┐
//   │  HeaderTicker  (height: 52px, flexShrink: 0)         │
//   ├──────────────┬───────────────────────┬───────────────┤
//   │  OrderBook   │   TradingViewChart    │   WatchList   │
//   │  (220px)     │   (flex: 1)           │   (200px)     │
//   │  flex: 1     │                       │               │
//   │  overflow:   │                       │               │
//   │  hidden      │                       │               │
//   ├──────────────┴───────────────────────┴───────────────┤
//   │  BottomTicker  (height: 32px, flexShrink: 0)         │
//   └──────────────────────────────────────────────────────┘
//   AIAnalysisModal (position: fixed — nằm đè lên tất cả, z-index: 50)
//
// Lý do dùng flex column + grid thay vì CSS Grid toàn bộ:
//   - Header và BottomTicker cần flexShrink: 0 để không bị co lại
//   - Phần giữa (3 cột) cần flex: 1 để chiếm hết không gian còn lại
//   - Grid 3 cột chỉ áp dụng cho phần giữa, không phải toàn trang
//
// Lý do wrap mỗi column trong <div style={{ overflow: "hidden", minHeight: 0 }}>:
//   - overflow: hidden ngăn nội dung tràn ra ngoài ranh giới column
//   - minHeight: 0 là hack cần thiết cho flex children:
//     flex items mặc định có minHeight: auto, khiến chúng không co lại
//     dưới kích thước nội dung — minHeight: 0 cho phép chúng co theo flex container
// =============================================================================

import HeaderTicker      from "./HeaderTicker";
import BottomTicker      from "./BottomTicker";
import OrderBook         from "./OrderBook";
import TradingViewChart  from "./TradingViewChart";
import WatchList         from "./WatchList";
import AIAnalysisModal   from "./AIAnalysisModal";

export default function BentoGrid() {
  return (
    // Container ngoài cùng: chiếm toàn màn hình, flex column, không cho scroll
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        height:         "100dvh",    // dvh = dynamic viewport height, đúng trên mobile
        width:          "100vw",
        background:     "var(--bg-base)",
        overflow:       "hidden",    // chặn scroll toàn trang
      }}
    >
      {/* ── Hàng 1: Header (cao cố định 52px, không co giãn) ── */}
      <HeaderTicker />

      {/* ── Hàng 2: 3 cột chính (chiếm hết không gian còn lại sau header + bottom) ── */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "220px 1fr 200px", // trái cố định | giữa co giãn | phải cố định
          flex:                1,                  // chiếm hết chiều cao còn lại
          overflow:            "hidden",
          minHeight:           0,                  // bắt buộc để flex child có thể co lại
        }}
      >
        {/* Cột trái (220px): Order Book — danh sách bids/asks real-time */}
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <OrderBook />
        </div>

        {/* Cột giữa (flex: 1): TradingView Chart + nút Analyze */}
        {/* overflow: visible để dropdown timeframe của TradingView không bị clip */}
        <div style={{ overflow: "visible", minHeight: 0, position: "relative" }}>
          <TradingViewChart />
        </div>

        {/* Cột phải (200px): WatchList — danh sách cặp tiền để chuyển nhanh */}
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <WatchList />
        </div>
      </div>

      {/* ── Hàng 3: Bottom Ticker (cao cố định 32px, cuộn ngang liên tục) ── */}
      <BottomTicker />

      {/* ── AI Modal: position fixed, đè lên toàn bộ layout, z-index: 50/51 ── */}
      {/* Không nằm trong flow layout — render ở đây chỉ để đảm bảo luôn mount */}
      <AIAnalysisModal />
    </div>
  );
}
