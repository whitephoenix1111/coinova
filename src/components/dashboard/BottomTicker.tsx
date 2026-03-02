"use client";

// ============================================================
// BottomTicker — Auto-scrolling bottom bar: ETH, SOL, BNB...
// ============================================================

import { useDashboardStore } from "@/store/useDashboardStore";

export default function BottomTicker() {
  const bottomTickers = useDashboardStore((s) => s.bottomTickers);
  const setActiveSymbol = useDashboardStore((s) => s.setActiveSymbol);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);

  // Duplicate for seamless loop
  const items = [...bottomTickers, ...bottomTickers];

  if (bottomTickers.length === 0) {
    return (
      <div
        style={{
          height: "32px",
          background: "var(--bg-panel)",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-display)", fontSize: "11px" }}>
          Connecting to market data...
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "32px",
        background: "var(--bg-panel)",
        borderTop: "1px solid var(--border-subtle)",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Fade edges */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "40px",
          height: "100%",
          background: "linear-gradient(to right, var(--bg-panel), transparent)",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "40px",
          height: "100%",
          background: "linear-gradient(to left, var(--bg-panel), transparent)",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* Scrolling track */}
      <div
        className="ticker-track"
        style={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          width: "max-content",
          gap: "0",
        }}
      >
        {items.map((t, i) => {
          const change = parseFloat(t.priceChangePercent);
          const isPos = change >= 0;
          const isActive = t.symbol === activeSymbol;

          return (
            <button
              key={`${t.symbol}-${i}`}
              onClick={() => setActiveSymbol(t.symbol)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "0 14px",
                height: "32px",
                background: isActive ? "var(--bg-active)" : "transparent",
                border: "none",
                borderRight: "1px solid var(--border-subtle)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  letterSpacing: "0.03em",
                }}
              >
                {t.baseAsset}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                {parseFloat(t.price).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "10px",
                  fontWeight: 500,
                  color: isPos ? "var(--green)" : "var(--red)",
                }}
              >
                {isPos ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
