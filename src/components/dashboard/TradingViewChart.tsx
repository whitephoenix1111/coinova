"use client";

// =============================================================================
// TradingViewChart.tsx — Cột giữa: TradingView widget + tab bar + nút Analyze
//
// NHIỆM VỤ:
//   Nhúng TradingView widget (iframe-based) vào dashboard và hiển thị nút Analyze.
//   Widget tự xử lý chart, OHLC, volume, MA, MACD, RSI — không cần code thêm.
//
// CẤU TRÚC COMPONENT:
//   TradingViewChart (export default)
//     ├─ Tab bar: [Chart] [Info] [Trading] + AnalyzeButton (phải)
//     └─ TVWidget (key=activeSymbol) — nhúng TradingView widget
//
// TẠI SAO TÁCH TVWidget RIÊNG:
//   TVWidget chứa toàn bộ logic imperative (tạo DOM element ngoài React, load script,
//   init TradingView.widget). Tách riêng để:
//   1. Dễ áp dụng key=activeSymbol → force unmount/remount khi đổi symbol
//   2. Cô lập code imperative khỏi phần declarative (tab bar, button)
//
// TẠI SAO DÙNG key=activeSymbol:
//   TradingView widget không hỗ trợ thay đổi symbol sau khi init.
//   Giải pháp: khi activeSymbol thay đổi → React unmount TVWidget cũ → mount TVWidget mới
//   → useEffect chạy lại → tạo widget mới với symbol mới
// =============================================================================

import { useEffect, useRef } from "react";
import { useDashboardStore }  from "@/store/useDashboardStore";

// Khai báo global để TypeScript biết window.TradingView tồn tại sau khi script load
// any vì TradingView không có official type definitions
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView: any;
  }
}

// =============================================================================
// TVWidget — Component nhúng TradingView widget bằng DOM imperative
//
// VẤN ĐỀ CỐT LÕI: TradingView widget không phải React component.
//   Nó là thư viện JS tạo iframe + DOM nodes bên trong 1 container div.
//   React không quản lý được nội dung bên trong → phải dùng imperative DOM.
//
// CHIẾN LƯỢC:
//   1. wrapperRef → React quản lý div wrapper (anchor point)
//   2. Tạo `container` div bằng document.createElement → append vào wrapper
//   3. React KHÔNG biết về `container` → không bao giờ touch nó
//   4. TradingView.widget inject iframe vào `container`
//   5. Khi unmount → xóa `container` thủ công (không để React xóa)
//
// LOAD SCRIPT (3 TRƯỜNG HỢP):
//   A. window.TradingView đã có → gọi init() ngay
//   B. Script chưa load → tạo <script> tag, onload gọi init()
//   C. Script đang load (tag tồn tại nhưng TradingView chưa sẵn) →
//      setInterval 100ms kiểm tra liên tục cho đến khi TradingView sẵn sàng
//
// CLEANUP (return của useEffect):
//   - clearInterval nếu đang chờ
//   - removeChild container khỏi wrapper (xóa sạch DOM TradingView tạo ra)
//   - try-catch vì có thể wrapper đã unmount trước (race condition)
// =============================================================================
function TVWidget({ symbol }: { symbol: string }) {
  // wrapperRef: React quản lý div này, nhưng nội dung bên trong do TradingView quản lý
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Tạo container div hoàn toàn bên ngoài React tree
    // ID duy nhất: tên symbol + timestamp để tránh conflict nếu mount nhanh liên tiếp
    const container   = document.createElement("div");
    const containerId = `tv_${symbol.toLowerCase()}_${Date.now()}`;
    container.id            = containerId;
    container.style.width   = "100%";
    container.style.height  = "100%";
    wrapper.appendChild(container); // gắn vào wrapper — React không biết về việc này

    // init: tạo TradingView.widget với config
    const init = () => {
      if (!window.TradingView) return; // double-check nếu race condition
      try {
        new window.TradingView.widget({
          autosize:           true,                      // tự fill 100% container
          symbol:             `BINANCE:${symbol}`,       // vd: "BINANCE:BTCUSDT"
          interval:           "15",                      // khung thời gian mặc định: 15 phút
          timezone:           "Asia/Ho_Chi_Minh",        // múi giờ Việt Nam
          theme:              "dark",
          style:              "1",                       // kiểu biểu đồ: 1 = Japanese Candlestick
          locale:             "en",
          toolbar_bg:         "#0d1117",
          enable_publishing:  false,
          save_image:         false,
          container_id:       containerId,               // inject vào div đã tạo ở trên
          backgroundColor:    "#0d1117",
          gridColor:          "rgba(30, 42, 53, 0.8)",
          studies:            ["STD;MACD", "STD;RSI"],   // indicator mặc định bên dưới chart
          hide_side_toolbar:  true,                      // ẩn toolbar bên phải của TV
          allow_symbol_change: false,                    // không cho đổi symbol trong widget (ta dùng WatchList thay thế)
          details:            false,
          hotlist:            false,
          calendar:           false,
        });
      } catch (e) {
        console.error("TradingView widget error:", e);
      }
    };

    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (window.TradingView) {
      // Trường hợp A: script đã load xong từ lần trước → init ngay
      init();
    } else if (!document.getElementById("tv-script")) {
      // Trường hợp B: script chưa bao giờ được thêm → tạo script tag mới
      const script    = document.createElement("script");
      script.id       = "tv-script";  // ID cố định để các lần sau biết script đã tồn tại
      script.src      = "https://s3.tradingview.com/tv.js";
      script.async    = true;
      script.onload   = init;         // gọi init ngay khi script load xong
      document.head.appendChild(script);
    } else {
      // Trường hợp C: script đang tải (tag tồn tại nhưng chưa xong) → poll 100ms
      intervalId = setInterval(() => {
        if (window.TradingView) {
          if (intervalId) clearInterval(intervalId); // dừng polling khi đã sẵn sàng
          init();
        }
      }, 100);
    }

    // Cleanup: chạy khi TVWidget unmount (khi symbol thay đổi hoặc component bị xóa)
    return () => {
      if (intervalId) clearInterval(intervalId); // dừng polling nếu đang chạy
      try {
        // Xóa container khỏi wrapper để remove toàn bộ DOM TradingView đã inject
        if (wrapper.contains(container)) {
          wrapper.removeChild(container);
        }
      } catch {
        // Bỏ qua lỗi nếu wrapper đã bị React xóa trước (race condition hiếm gặp)
      }
    };
  }, [symbol]); // re-run khi symbol thay đổi → unmount widget cũ, tạo widget mới

  // div anchor: React chỉ quản lý element này
  // Nội dung thật (TradingView iframe) nằm trong container con được tạo imperatively
  // height: calc(100% - 36px) vì tab bar cao 36px nằm trên
  return (
    <div
      ref={wrapperRef}
      style={{ width: "100%", flex: 1, minHeight: 0 }}
    />
  );
}

// =============================================================================
// TradingViewChart (default export) — Wrapper chính của chart area
//
// Layout:
//   position: relative (để AnalyzeButton absolute nếu cần)
//   height: 100% → fill cột giữa của BentoGrid
//
// Tab bar (36px):
//   3 nút: Chart (active) | Info | Trading
//   Chỉ "Chart" có style active (accent color + bg) — Info/Trading là placeholder UI
//   Tab "Chart" không cần onClick vì chart luôn hiển thị
//   AnalyzeButton nằm bên phải cùng của tab bar (flex: 1 đẩy sang phải)
//
// key=activeSymbol trên TVWidget:
//   Khi user click WatchList → setActiveSymbol → activeSymbol thay đổi
//   React thấy key khác → unmount TVWidget cũ → mount TVWidget mới
//   → useEffect trong TVWidget mới chạy với symbol mới → widget mới được tạo
// =============================================================================
export default function TradingViewChart() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--bg-panel)", display: "flex", flexDirection: "column" }}>

      {/* ── Tab bar: 36px, nằm trên chart ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "14px 12px", flexShrink: 0, borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)", position: "relative", zIndex: 10 }}>
        {/* 3 tab: chỉ index 0 (Chart) có style active */}
        {["Chart", "Thông tin"].map((tab, i) => (
          <button key={tab} style={{
            fontFamily:  "var(--font-display)",
            fontWeight:  500,
            fontSize:    "12px",
            padding:     "4px 12px",
            borderRadius: "4px",
            color:       i === 0 ? "var(--accent)"          : "var(--text-secondary)",
            background:  i === 0 ? "var(--accent-glow)"     : "transparent",
            border:      i === 0 ? "1px solid rgba(0,212,255,0.2)" : "1px solid transparent",
            cursor:      "pointer",
          }}>
            {tab}
          </button>
        ))}

        {/* Spacer: đẩy AnalyzeButton sang phải */}
        <div style={{ flex: 1 }} />

        {/* Nút Analyze: tự lấy state từ store, tự gọi API — không cần prop */}
        <AnalyzeButton />
      </div>

      {/* ── TradingView Widget ──
          key=activeSymbol: force remount khi symbol thay đổi
          Đây là cách duy nhất để đổi symbol vì TradingView widget không có setSymbol() API */}
      <TVWidget key={activeSymbol} symbol={activeSymbol} />
    </div>
  );
}

// =============================================================================
// AnalyzeButton — Nút "🤖 Analyze" trong tab bar
//
// TẠI SAO AnalyzeButton ĐỌC STORE TRỰC TIẾP THAY VÌ NHẬN PROP:
//   Nếu truyền qua prop: TradingViewChart → AnalyzeButton (2 tầng)
//   Vẫn chấp nhận được, nhưng AnalyzeButton cần nhiều state (6 giá trị)
//   → Đọc store trực tiếp gọn hơn, không làm TradingViewChart phình to
//
// LOGIC TRÙNG VỚI Dashboard.triggerAnalysis:
//   AnalyzeButton cũng tự gọi /api/analysis trực tiếp (không qua window.coinovaTriggerAnalysis)
//   Đây là intentional redundancy — AnalyzeButton là primary trigger,
//   window.coinovaTriggerAnalysis là escape hatch cho các trigger khác (keyboard shortcut, etc.)
//   Nếu muốn đồng bộ, có thể thay handleAnalyze bằng: window.coinovaTriggerAnalysis?.()
//
// DISABLED STATES:
//   isAnalyzing = true → nút disabled (đang chờ kết quả) + hiển thị spinner
//   ticker = null      → nút disabled + opacity 0.5 (chưa có data để phân tích)
//
// HIỂN THỊ:
//   Đang phân tích: [spinner] Analyzing...
//   Bình thường:    [🤖] Analyze
// =============================================================================
function AnalyzeButton() {
  const activeSymbol   = useDashboardStore((s) => s.activeSymbol);
  const ticker         = useDashboardStore((s) => s.ticker);         // null khi chưa kết nối
  const orderBook      = useDashboardStore((s) => s.orderBook);      // null khi chưa load
  const trades         = useDashboardStore((s) => s.trades);         // tối đa 50 giao dịch gần nhất
  const isAnalyzing    = useDashboardStore((s) => s.isAnalyzing);    // true khi đang chờ API
  const openModal      = useDashboardStore((s) => s.openModal);      // mở AIAnalysisModal
  const setAIAnalysis    = useDashboardStore((s) => s.setAIAnalysis);    // lưu kết quả vào store
  const setIsAnalyzing   = useDashboardStore((s) => s.setIsAnalyzing);   // bật/tắt loading
  const setAnalysisError = useDashboardStore((s) => s.setAnalysisError); // lưu lỗi vào store

  const handleAnalyze = async () => {
    // Guard: không gọi API nếu đang phân tích hoặc chưa có ticker/orderBook
    if (!ticker || !orderBook || isAnalyzing) return;

    setIsAnalyzing(true); // bật spinner trên nút + trong modal
    openModal();          // mở modal ngay để user thấy loading state

    try {
      const res = await fetch("/api/analysis", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol:       activeSymbol,
          ticker,
          orderBook,
          recentTrades: trades.slice(0, 20), // chỉ gửi 20 trade gần nhất để giảm payload
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json(); // nhận AIAnalysisResult
      setAIAnalysis(data);           // lưu vào store → AIAnalysisModal tự re-render

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(err);
      setAnalysisError(msg); // hiển thị lỗi rõ ràng trong modal
    } finally {
      setIsAnalyzing(false); // tắt loading dù thành công hay lỗi
    }
  };

  return (
    <button
      onClick={handleAnalyze}
      disabled={isAnalyzing || !ticker} // disabled khi đang chạy hoặc chưa có data
      style={{
        fontFamily:  "var(--font-display)",
        fontWeight:  600,
        display:     "flex",
        alignItems:  "center",
        gap:         "6px",
        padding:     "4px 12px",
        borderRadius: "4px",
        // background thay đổi khi đang phân tích để phản hồi visual cho user
        background:  isAnalyzing
          ? "var(--bg-active)"
          : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))",
        border:      "1px solid rgba(0,212,255,0.3)",
        color:       isAnalyzing ? "var(--text-secondary)" : "var(--accent)",
        cursor:      isAnalyzing || !ticker ? "not-allowed" : "pointer",
        opacity:     !ticker ? 0.5 : 1, // mờ đi khi chưa có ticker data
        fontSize:    "12px",
      }}
    >
      {isAnalyzing ? (
        // Trạng thái loading: spinner CSS + text
        <>
          <span
            className="spin" // CSS class: animation quay trong globals.css
            style={{ width: "10px", height: "10px", borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--accent)", display: "inline-block" }}
          />
          Analyzing...
        </>
      ) : (
        // Trạng thái bình thường: icon + text
        <>
          <span>🤖</span> Analyze
        </>
      )}
    </button>
  );
}
