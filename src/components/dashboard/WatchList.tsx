"use client";

// =============================================================================
// WatchList.tsx — Cột phải: danh sách cặp tiền để theo dõi và chuyển đổi nhanh
//
// NHIỆM VỤ:
//   - Hiển thị danh sách watchList từ store (10 cặp tiền mặc định)
//   - Cập nhật giá và % thay đổi real-time từ WebSocket
//   - Click vào row → setActiveSymbol → TradingViewChart + OrderBook đổi theo
//   - Click ★ → toggleFavorite → ghim/bỏ ghim cặp tiền (store tự sắp xếp)
//
// LUỒNG DATA:
//   Binance WebSocket (@ticker stream) → useBinanceStream → updateBottomTicker + setWatchList
//   → watchList[] trong store cập nhật → WatchList re-render với giá mới
//
//   Lưu ý: watchList và bottomTickers được sync từ cùng WebSocket stream
//   watchList dùng cho cột phải (WatchList), bottomTickers dùng cho thanh dưới (BottomTicker)
//
// CẤU TRÚC LAYOUT (flex column, height: 100%):
//
//   ┌──────────────────────────────────┐
//   │ Header: "WATCHLIST" | "10 pairs" │  ← flexShrink: 0
//   │ ColHeader: Pair | Price | Change │  ← flexShrink: 0
//   ├──────────────────────────────────┤
//   │ Row: BTC/USDT | 95,000 | +2.3%   │  ← overflowY: auto (scroll khi nhiều item)
//   │ Row: ETH/USDT | 3,200  | +1.1%   │
//   │ Row: SOL/USDT | 180    | -0.5%   │
//   │ ...                              │
//   └──────────────────────────────────┘
//
// GRID 3 CỘT (gridTemplateColumns: "1fr 80px 56px"):
//   Cột 1 (1fr):  Pair — ★ button + tên coin (baseAsset / quoteAsset)
//   Cột 2 (80px): Price — giá hiện tại, căn phải
//   Cột 3 (56px): Change — % thay đổi 24h, căn phải (đủ cho "-99.99%")
//
// ACTIVE ROW STYLE:
//   background: var(--bg-active) + borderLeft: 2px solid var(--accent) → highlight rõ ràng
//   borderLeft của inactive row = 2px solid transparent → giữ layout không bị lệch
//   (thêm/xóa border làm shift layout nếu không pre-allocate)
// =============================================================================

import { useDashboardStore } from "@/store/useDashboardStore";

export default function WatchList() {
  // watchList: mảng WatchListItem, cập nhật real-time từ WebSocket
  const watchList       = useDashboardStore((s) => s.watchList);
  // activeSymbol: cặp tiền đang xem — dùng để highlight row tương ứng
  const activeSymbol    = useDashboardStore((s) => s.activeSymbol);
  // setActiveSymbol: khi click row → đổi activeSymbol → TradingViewChart + OrderBook reload
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);

  return (
    // Container: flex column, fill cột phải BentoGrid, borderLeft ngăn cách với chart
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-panel)", borderLeft: "1px solid var(--border-subtle)", overflow: "hidden" }}>

      {/* ── Header: tiêu đề + số lượng cặp tiền ── */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Watchlist
        </span>
        {/* Số lượng pairs: cập nhật động nếu user thêm/xóa (chưa implement nhưng ready) */}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>
          {watchList.length} pairs
        </span>
      </div>

      {/* ── ColHeader: Pair | Price | Change ── */}
      {/* Grid 3 cột khớp với grid trong mỗi row bên dưới */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 56px", padding: "4px 12px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        {["Pair", "Price", "Change"].map((col, i) => (
          <span key={col} style={{ fontFamily: "var(--font-display)", fontSize: "10px", color: "var(--text-tertiary)", textAlign: i === 0 ? "left" : "right" }}>
            {col}
          </span>
        ))}
      </div>

      {/* ── Danh sách rows: scroll khi vượt chiều cao ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* Empty state: hiển thị khi watchList chưa được seed hoặc store rỗng */}
        {watchList.length === 0 ? (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-display)", fontSize: "11px" }}>
            No symbols
          </div>
        ) : (
          watchList.map((item) => {
            const change   = parseFloat(item.priceChangePercent); // parse để so sánh và toFixed
            const isPos    = change >= 0;                          // xanh nếu tăng, đỏ nếu giảm
            const isActive = item.symbol === activeSymbol;         // highlight nếu đang xem

            return (
              // Row: click toàn bộ row để setActiveSymbol
              // borderLeft: 2px pre-allocated (transparent khi inactive) để không shift layout
              <div
                key={item.symbol}
                onClick={() => setActiveSymbol(item.symbol)}
                className="watchlist-row" // dùng class cho hover style inject bên dưới
                style={{
                  display:       "grid",
                  gridTemplateColumns: "1fr 80px 56px",
                  padding:       "6px 12px",
                  cursor:        "pointer",
                  background:    isActive ? "var(--bg-active)" : "transparent",
                  borderLeft:    isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  transition:    "background 0.1s",
                }}
              >
                {/* ── Cột 1: ★ button + tên coin ── */}
                <div className="flex items-center gap-1.5">

                  {/* Tên coin: baseAsset lớn + /quoteAsset nhỏ bên dưới */}
                  <div className="flex flex-col">
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 600, color: isActive ? "var(--accent)" : "var(--text-primary)", lineHeight: 1.2 }}>
                      {item.baseAsset}
                    </span>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "9px", color: "var(--text-tertiary)", lineHeight: 1.2 }}>
                      /{item.quoteAsset}
                    </span>
                  </div>
                </div>

                {/* ── Cột 2: Giá — format en-US 2 chữ số thập phân, căn phải ── */}
                <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", textAlign: "right", alignSelf: "center" }}>
                  {parseFloat(item.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>

                {/* ── Cột 3: % thay đổi — "+" prefix khi dương, xanh/đỏ theo sign ── */}
                <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 500, color: isPos ? "var(--green)" : "var(--red)", textAlign: "right", alignSelf: "center" }}>
                  {isPos ? "+" : ""}{change.toFixed(2)}%
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Hover style: !important để override inline background của row */}
      <style>{`.watchlist-row:hover { background: var(--bg-hover) !important; }`}</style>
    </div>
  );
}
