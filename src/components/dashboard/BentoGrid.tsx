"use client";

// ============================================================
// BentoGrid — Main layout: header + 3-col grid + bottom ticker
// ============================================================

import HeaderTicker from "./HeaderTicker";
import BottomTicker from "./BottomTicker";
import OrderBook from "./OrderBook";
import TradingViewChart from "./TradingViewChart";
import WatchList from "./WatchList";
import AIAnalysisModal from "./AIAnalysisModal";

export default function BentoGrid() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        width: "100vw",
        background: "var(--bg-base)",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <HeaderTicker />

      {/* ── Main 3-col grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr 200px",
          flex: 1,
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* Left: Order Book */}
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <OrderBook />
        </div>

        {/* Center: Chart */}
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <TradingViewChart />
        </div>

        {/* Right: WatchList full height */}
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <WatchList />
        </div>
      </div>

      {/* ── Bottom Ticker ── */}
      <BottomTicker />

      {/* ── AI Modal (portal-like, fixed) ── */}
      <AIAnalysisModal />
    </div>
  );
}
