"use client";

// =============================================================================
// HeaderTicker.tsx — Thanh header trên cùng hiển thị thông tin cặp tiền đang xem
//
// NHIỆM VỤ:
//   Hiển thị real-time stats của activeSymbol:
//   [Logo COINOVA] [Tên cặp tiền] [Giá hiện tại + % thay đổi] [24h Change | High | Low | Volume]
//
// LUỒNG DATA:
//   Binance WebSocket (@ticker stream) → useBinanceStream → setTicker (store)
//   → ticker object trong store cập nhật liên tục → HeaderTicker re-render
//
// LOADING STATE:
//   ticker = null khi WebSocket chưa kết nối → hiển thị "—" cho tất cả giá trị
//   isConnected = false → dot xanh tắt (màu tertiary, không glow)
//
// CÁC THÀNH PHẦN TỪ TRÁI SANG PHẢI:
//   1. Pulse dot     → chấm tròn nhỏ, xanh khi isConnected, grey khi ngắt kết nối
//   2. Logo COINOVA  → "COIN" màu accent + "OVA" màu secondary
//   3. Tên cặp tiền  → baseAsset (BTC) lớn + /quoteAsset (USDT) nhỏ
//   4. Giá + %change → giá lớn màu xanh/đỏ + badge % có background tương ứng
//   5. Stats 4 ô     → 24h Change | 24h High | 24h Low | Volume (qua StatBlock)
//   6. Spacer        → flex: 1, đẩy badge "Binance" sang phải
//   7. Binance badge → label nguồn data, góc phải cùng
// =============================================================================

import { useDashboardStore } from "@/store/useDashboardStore";

// -----------------------------------------------------------------------------
// StatBlock — Ô thống kê nhỏ với label trên và giá trị dưới
//
// Props:
//   label  → tên chỉ số, vd: "24h High" — hiển thị uppercase nhỏ
//   value  → giá trị đã được format thành string, vd: "95,000.00"
//   color  → màu tùy chỉnh cho value (optional, mặc định var(--text-primary))
//            Dùng cho 24h Change để tô xanh/đỏ theo chiều giá
//
// Dùng className Tailwind (flex flex-col gap-0.5) kết hợp với inline style
// vì Tailwind v4 không cần config riêng cho spacing nhỏ như gap-0.5
// -----------------------------------------------------------------------------
function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span style={{ fontFamily: "var(--font-body)", fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 500, color: color || "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Divider — Đường ngăn cách dọc giữa các nhóm thông tin trong header
//
// Kích thước cố định: 1px × 28px
// Dùng flexShrink: 0 để không bị co lại khi header hẹp
// -----------------------------------------------------------------------------
function Divider() {
  return <div style={{ width: "1px", height: "28px", background: "var(--border-subtle)", flexShrink: 0 }} />;
}

// =============================================================================
// HeaderTicker (default export)
//
// Đọc từ store:
//   ticker       → object Ticker với price, priceChange, priceChangePercent, high, low, volume
//                  null khi chưa có data
//   activeSymbol → cặp tiền đang xem (vd: "BTCUSDT"), dùng làm fallback khi ticker null
//   isConnected  → trạng thái WebSocket: true = đã kết nối, false = ngắt kết nối
//
// HELPER FUNCTIONS (defined inside component để dùng ticker closure):
//
//   fmt(val, decimals) → parse string sang number, format en-US với số thập phân cố định
//     Trả "—" nếu val undefined (loading state)
//     Dùng cho: price, priceChange, highPrice, lowPrice
//
//   fmtVolume(val) → rút gọn số lớn:
//     >= 1B → "1.23B" | >= 1M → "1.23M" | >= 1K → "1.23K" | else → số nguyên
//     Dùng cho quoteVolume (volume tính bằng USDT, số rất lớn)
// =============================================================================
export default function HeaderTicker() {
  const ticker       = useDashboardStore((s) => s.ticker);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const isConnected  = useDashboardStore((s) => s.isConnected);

  // Xác định hướng giá để chọn màu xanh/đỏ cho giá và % thay đổi
  const priceChange = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const isPositive  = priceChange >= 0; // true = xanh (tăng hoặc không đổi), false = đỏ (giảm)

  // format số → string với dấu phẩy ngàn và số thập phân cố định
  // Trả "—" khi val undefined để tránh hiển thị "NaN" hoặc "0.00" sai lệch
  const fmt = (val: string | undefined, decimals = 2) =>
    val
      ? parseFloat(val).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : "—";

  // format volume: rút gọn thành B/M/K để tiết kiệm không gian
  // quoteVolume của BTC thường ~ hàng tỷ USDT → cần rút gọn
  const fmtVolume = (val: string | undefined) => {
    if (!val) return "—";
    const n = parseFloat(val);
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000)         return (n / 1_000).toFixed(2) + "K";
    return n.toFixed(2);
  };

  return (
    // Header: cao cố định 52px, flex row, không co lại (flexShrink: 0 được set bởi BentoGrid wrapper)
    <header style={{ height: "52px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", padding: "0 16px", gap: "16px", flexShrink: 0 }}>

      {/* ── Nhóm 1: Pulse dot + Logo + Tên cặp tiền ── */}
      <div className="flex items-center gap-3">

        {/* Pulse dot: xanh + glow khi connected, grey + không glow khi ngắt */}
        <div
          className="pulse-dot"  // CSS class để animate pulse (nếu có trong globals.css)
          style={{
            width:      "6px",
            height:     "6px",
            borderRadius: "50%",
            background:   isConnected ? "var(--green)" : "var(--text-tertiary)",
            boxShadow:    isConnected ? "0 0 6px var(--green)" : "none", // glow khi connected
            flexShrink:   0,
          }}
        />

        {/* Logo: "COIN" accent + "OVA" secondary */}
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "14px", color: "var(--accent)", letterSpacing: "0.1em" }}>
          COIN<span style={{ color: "var(--text-secondary)" }}>OVA</span>
        </span>

        <Divider />

        {/* Tên cặp tiền: baseAsset lớn (vd: "BTC") + /quoteAsset nhỏ (vd: "/USDT")
            Fallback về activeSymbol khi ticker null (strip "USDT" khỏi cuối) */}
        <div className="flex items-baseline gap-1.5">
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>
            {ticker?.baseAsset || activeSymbol.replace("USDT", "")}
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", color: "var(--text-tertiary)" }}>
            / {ticker?.quoteAsset || "USDT"}
          </span>
        </div>
      </div>

      <Divider />

      {/* ── Nhóm 2: Giá hiện tại + % thay đổi 24h ── */}
      <div className="flex items-baseline gap-2">

        {/* Giá lớn: màu xanh khi tăng, đỏ khi giảm + text-shadow glow tương ứng */}
        <span style={{
          fontFamily:  "var(--font-display)",
          fontWeight:  600,
          fontSize:    "20px",
          color:       isPositive ? "var(--green)" : "var(--red)",
          textShadow:  isPositive
            ? "0 0 12px rgba(0,230,118,0.3)"   // glow xanh nhẹ khi tăng
            : "0 0 12px rgba(255,61,90,0.3)",   // glow đỏ nhẹ khi giảm
        }}>
          {ticker ? fmt(ticker.price) : "—"}
        </span>

        {/* Badge % thay đổi: background màu tương ứng để dễ nhìn */}
        <span style={{
          fontFamily:   "var(--font-display)",
          fontSize:     "12px",
          fontWeight:   500,
          color:        isPositive ? "var(--green)" : "var(--red)",
          background:   isPositive ? "var(--green-bg)" : "var(--red-bg)", // bg nhạt tương ứng
          padding:      "2px 6px",
          borderRadius: "3px",
        }}>
          {ticker ? `${isPositive ? "+" : ""}${parseFloat(ticker.priceChangePercent).toFixed(2)}%` : "—"}
        </span>
      </div>

      <Divider />

      {/* ── Nhóm 3: 4 StatBlock — 24h Change | 24h High | 24h Low | Volume ── */}
      <div className="flex items-center gap-6">
        {/* 24h Change: thay đổi giá tuyệt đối (vd: "+1500.00"), tô xanh/đỏ */}
        <StatBlock
          label="24h Change"
          value={ticker ? fmt(ticker.priceChange) : "—"}
          color={isPositive ? "var(--green)" : "var(--red)"}
        />
        {/* 24h High: giá cao nhất trong 24h — màu primary (không tô) */}
        <StatBlock label="24h High"  value={fmt(ticker?.highPrice)} />
        {/* 24h Low: giá thấp nhất trong 24h — màu primary (không tô) */}
        <StatBlock label="24h Low"   value={fmt(ticker?.lowPrice)} />
        {/* Volume: tổng volume USDT 24h, rút gọn B/M/K */}
        <StatBlock label="Volume"    value={fmtVolume(ticker?.quoteVolume)} />
      </div>

      {/* ── Spacer: đẩy badge "Binance" sang góc phải ── */}
      <div className="flex-1" />

      {/* ── Badge nguồn data: luôn hiển thị "Binance" ── */}
      <div style={{ fontFamily: "var(--font-display)", fontSize: "10px", fontWeight: 500, color: "var(--text-tertiary)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", padding: "3px 8px", borderRadius: "3px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Binance
      </div>
    </header>
  );
}
