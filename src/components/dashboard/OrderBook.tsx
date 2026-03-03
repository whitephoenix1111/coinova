"use client";

// =============================================================================
// OrderBook.tsx — Cột trái: hiển thị sổ lệnh (bids/asks) real-time
//
// NHIỆM VỤ:
//   Hiển thị bids (lệnh mua, màu xanh) và asks (lệnh bán, màu đỏ)
//   của activeSymbol theo thời gian thực từ Binance WebSocket.
//
// LUỒNG DATA:
//   Binance WebSocket (@depth20@100ms) → useBinanceStream → setOrderBook (store)
//   → orderBook object trong store cập nhật 100ms/lần → OrderBook re-render
//   Khởi tạo ban đầu: GET /api/history?symbol=BTCUSDT → hydrate orderBook lần đầu
//
// CẤU TRÚC LAYOUT (flex column, height: 100%):
//
//   ┌─────────────────────────────┐
//   │ PanelHeader "Order Book"    │  ← flexShrink: 0
//   │ ColHeader: Price|Amt|Total  │  ← flexShrink: 0
//   ├─────────────────────────────┤
//   │ Asks (đỏ) — justify: flex-  │  ← flex: 1, justifyContent: flex-end
//   │ end → asks xếp từ dưới lên  │    (asks cao nhất nằm sát giá giữa)
//   ├─────────────────────────────┤
//   │ Spread Bar (giá + spread %) │  ← flexShrink: 0
//   ├─────────────────────────────┤
//   │ Bids (xanh) — từ trên xuống │  ← flex: 1
//   │ (bids cao nhất nằm sát giá) │
//   └─────────────────────────────┘
//
// LÝ DO asks.reverse() TRONG RENDER:
//   Store lưu asks theo thứ tự từ thấp → cao (Binance standard)
//   Khi reverses + justifyContent: flex-end:
//     - Ask thấp nhất (gần giá nhất) xuất hiện ngay trên spread bar
//     - Ask cao nhất ở trên cùng
//   Bids giữ nguyên thứ tự cao → thấp:
//     - Bid cao nhất (gần giá nhất) xuất hiện ngay dưới spread bar
//
// DEPTH BAR (thanh nền màu):
//   Mỗi OrderRow có 1 div position: absolute làm depth bar
//   width = (entry.total / maxTotal) * 100%
//   Giúp user nhìn thấy ngay mức độ thanh khoản của từng mức giá
// =============================================================================

import { useMemo, useState } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import type { OrderBookEntry } from "@/types";

// -----------------------------------------------------------------------------
// PanelHeader — Tiêu đề của panel, chữ in hoa nhỏ
// Nhận title string, render theo style chuẩn của tất cả panel trong app
// -----------------------------------------------------------------------------
function PanelHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {title}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ColHeader — Hàng tiêu đề cột: Price | Amount | Total
// Col đầu căn trái, 2 col sau căn phải (theo convention order book)
// Grid 3 cột đều nhau (1fr 1fr 1fr) khớp với grid trong OrderRow
// -----------------------------------------------------------------------------
function ColHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "4px 12px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
      {["Price", "Amount", "Total"].map((col, i) => (
        <span key={col} style={{ fontFamily: "var(--font-display)", fontSize: "10px", color: "var(--text-tertiary)", textAlign: i === 0 ? "left" : "right" }}>
          {col}
        </span>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// OrderRow — Một hàng đơn trong order book (1 mức giá)
//
// Props:
//   entry    → { price, quantity, total } — một mức giá trong bids hoặc asks
//   side     → "bid" (mua, xanh) | "ask" (bán, đỏ) — quyết định màu sắc
//   maxTotal → tổng lớn nhất trong cùng side — dùng để tính % depth bar
//
// HIỂN THỊ 3 CỘT (grid 1fr 1fr 1fr):
//   Price  → format en-US 2 chữ số, màu xanh (bid) hoặc đỏ (ask)
//   Amount → số lượng coin (vd: 0.0234 BTC), font mono, căn phải
//   Total  → total/1000 + "K" (vd: 95K USDT), font mono, căn phải
//            Chia 1000 vì total thường rất lớn, "K" giúp dễ đọc hơn
//
// DEPTH BAR (position: absolute, z-index: 0):
//   - Nằm dưới text (z-index: 0), text có z-index: 1 để đè lên
//   - Render từ phải sang trái (right: 0) để depth lớn → thanh dài sang trái
//   - width = depth% của maxTotal trong cùng side
//   - Màu bg nhạt tương ứng (green-bg hoặc red-bg) để không chói
//
// entry.total: được tính sẵn trong useBinanceStream hoặc tính tại đây nếu null
// -----------------------------------------------------------------------------
function OrderRow({ entry, side, maxTotal }: { entry: OrderBookEntry; side: "bid" | "ask"; maxTotal: number }) {
  const price   = parseFloat(entry.price);
  const qty     = parseFloat(entry.quantity);
  const total   = entry.total ?? price * qty;                    // fallback nếu total chưa được tính
  const depth   = maxTotal > 0 ? (total / maxTotal) * 100 : 0;  // % depth so với mức lớn nhất
  const color   = side === "bid" ? "var(--green)"    : "var(--red)";
  const bgColor = side === "bid" ? "var(--green-bg)" : "var(--red-bg)";

  return (
    <div
      style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "3px 12px", cursor: "default" }}
      className="order-row" // dùng class để hover style bên dưới
    >
      {/* Depth bar: absolute, không ảnh hưởng layout, width theo % depth */}
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: `${depth}%`, background: bgColor, pointerEvents: "none" }} />

      {/* Price: màu xanh/đỏ theo side, z-index: 1 để đè lên depth bar */}
      <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 500, color, position: "relative", zIndex: 1 }}>
        {price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>

      {/* Amount: số lượng coin, 4 chữ số thập phân cho các coin nhỏ như BTC */}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-primary)", textAlign: "right", position: "relative", zIndex: 1 }}>
        {qty.toFixed(4)}
      </span>

      {/* Total: chia 1000 để ra K, giúp số gọn hơn trong column hẹp */}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", textAlign: "right", position: "relative", zIndex: 1 }}>
        {(total / 1000).toFixed(1)}K
      </span>
    </div>
  );
}

// =============================================================================
// OrderBook (default export)
//
// Đọc từ store:
//   orderBook → { bids[], asks[], symbol, lastUpdateId } | null
//   ticker    → dùng lấy giá hiện tại để hiển thị ở spread bar
//               và xác định màu (isPositive) cho giá trong spread bar
//
// useMemo cho maxAskTotal và maxBidTotal:
//   Tính max total của asks và bids riêng biệt
//   Memoize vì orderBook cập nhật 100ms/lần — tính lại mỗi render không cần thiết
//   Dùng Math.max với spread operator: Math.max(...array.map(fn))
//
// useMemo cho spread:
//   spread = asks[0].price - bids[0].price (khoảng cách giá mua/bán tốt nhất)
//   spread% = (spread / bid) × 100 — chuẩn hóa theo % để so sánh được
//   Trả null nếu không đủ data → không render phần spread
//   asks[0] = ask thấp nhất (best ask), bids[0] = bid cao nhất (best bid)
// =============================================================================
export default function OrderBook() {
  const orderBook = useDashboardStore((s) => s.orderBook);
  const ticker    = useDashboardStore((s) => s.ticker);

  // Màu giá giữa: so sánh ticker.price với best ask/bid tại thời điểm hiện tại.
  // - price >= bestAsk → giá đang khớp phía ask (bán) → đỏ
  // - price <= bestBid → giá đang khớp phía bid (mua) → xanh
  // - nằm trong spread → giữ màu trước (dùng ref), không nhảy màu đột ngột
  // Không dùng priceChangePercent hay prevClosePrice vì cả hai
  // phản ánh xu hướng dài hạn, không phải vị trí giá trong order book lúc này.
  // Màu giá giữa: dùng useEffect → so sánh price vs bestAsk/bestBid sau mỗi render
  // dùng useState để trigger re-render khi màu thay đổi
  // không cập nhật nếu giá nằm trong spread → giữ màu cũ
  const [priceColor, setPriceColor] = useState("var(--text-secondary)");

  const currentPrice = ticker ? parseFloat(ticker.price) : null;
  const bestAsk      = orderBook?.asks[0] ? parseFloat(orderBook.asks[0].price) : null;
  const bestBid      = orderBook?.bids[0] ? parseFloat(orderBook.bids[0].price) : null;

  useMemo(() => {
    if (currentPrice !== null && bestAsk !== null && bestBid !== null) {
      if (currentPrice >= bestAsk) {
        setPriceColor("var(--red)");            // khớp ask → bên bán → đỏ
      } else if (currentPrice <= bestBid) {
        setPriceColor("var(--green)");          // khớp bid → bên mua → xanh
      }
      // nằm trong spread → không đổi màu
    } else if (!ticker) {
      setPriceColor("var(--text-secondary)");  // chưa có data → xám
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, bestAsk, bestBid]);

  // maxAskTotal: tổng USDT lớn nhất trong tất cả asks — chuẩn hóa depth bar asks
  const maxAskTotal = useMemo(
    () => orderBook
      ? Math.max(...orderBook.asks.map((e) => e.total ?? parseFloat(e.price) * parseFloat(e.quantity)))
      : 0,
    [orderBook]
  );

  // maxBidTotal: tổng USDT lớn nhất trong tất cả bids — chuẩn hóa depth bar bids
  const maxBidTotal = useMemo(
    () => orderBook
      ? Math.max(...orderBook.bids.map((e) => e.total ?? parseFloat(e.price) * parseFloat(e.quantity)))
      : 0,
    [orderBook]
  );

  return (
    // Container: flex column, height 100% để fill cột trái BentoGrid
    // borderRight: ngăn cách với cột giữa (TradingViewChart)
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-panel)", borderRight: "1px solid var(--border-subtle)", overflow: "hidden" }}>

      {/* Header + col labels */}
      <PanelHeader title="Order Book" />
      <ColHeader />

      {/* ── Vùng Asks (đỏ) — scroll từ dưới lên, best ask luôn sát spread bar ── */}
      {/* overflowY: auto + flexDirection: column-reverse:
           column-reverse đảo chiều render → phần tử đầu mảng (ask thấp = best ask) nằm ở đáy
           scroll anchor tự động ở đáy → best ask luôn hiển thị, ask cao tràn lên trên
           Không cần reverse() hay marginTop: auto nữa */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column-reverse", scrollbarWidth: "none" }}>
        {!orderBook ? (
          <div style={{ padding: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-display)", fontSize: "11px", textAlign: "center" }}>Loading...</div>
        ) : (
          // KHÔNG reverse() — column-reverse đã lo việc đó:
          // asks[0] (best ask, giá thấp nhất) → render ở dưới cùng, sát spread bar
          // asks[19] (giá cao nhất) → tràn lên trên, có thể scroll để xem
          orderBook.asks.map((entry) => (
            <OrderRow key={entry.price} entry={entry} side="ask" maxTotal={maxAskTotal} />
          ))
        )}
      </div>

      {/* ── giá hiện tại giữa asks và bids ── */}
      <div style={{ padding: "6px 12px", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        {/* Màu tính từ priceColorRef — cập nhật mỗi render theo vị trí price so với bestAsk/bestBid */}
        <span style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: priceColor }}>
          {ticker ? parseFloat(ticker.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        </span>
      </div>

      {/* ── Vùng Bids (xanh) — best bid luôn sát spread bar, bid thấp tràn xuống dưới ── */}
      {/* overflowY: auto → scroll nếu rows nhiều hơn chiều cao, scrollbar ẩn */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", scrollbarWidth: "none" }}>
        {orderBook?.bids.map((entry) => (
          <OrderRow key={entry.price} entry={entry} side="bid" maxTotal={maxBidTotal} />
        ))}
      </div>

      {/* Hover style: inject CSS trực tiếp vì không dùng CSS modules */}
      <style>{`.order-row:hover { background: var(--bg-hover); }`}</style>
    </div>
  );
}
