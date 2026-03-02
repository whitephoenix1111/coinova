"use client";

// ============================================================
// WatchList — Right panel top: symbol list
// ============================================================

import { useDashboardStore } from "@/store/useDashboardStore";

export default function WatchList() {
  const { watchList, activeSymbol, setActiveSymbol, toggleFavorite } = useDashboardStore((s) => ({
    watchList: s.watchList,
    activeSymbol: s.activeSymbol,
    setActiveSymbol: s.setActiveSymbol,
    toggleFavorite: s.toggleFavorite,
  }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-panel)",
        borderLeft: "1px solid var(--border-subtle)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Watchlist
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-tertiary)",
          }}
        >
          {watchList.length} pairs
        </span>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 56px",
          padding: "4px 12px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {["Pair", "Price", "Change"].map((col, i) => (
          <span
            key={col}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "10px",
              color: "var(--text-tertiary)",
              textAlign: i === 0 ? "left" : "right",
            }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {watchList.length === 0 ? (
          <div
            style={{
              padding: "20px 12px",
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-display)",
              fontSize: "11px",
            }}
          >
            No symbols
          </div>
        ) : (
          watchList.map((item) => {
            const change = parseFloat(item.priceChangePercent);
            const isPos = change >= 0;
            const isActive = item.symbol === activeSymbol;

            return (
              <div
                key={item.symbol}
                onClick={() => setActiveSymbol(item.symbol)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 56px",
                  padding: "6px 12px",
                  cursor: "pointer",
                  background: isActive ? "var(--bg-active)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "background 0.1s",
                }}
                className="watchlist-row"
              >
                {/* Symbol + star */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.symbol);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "10px",
                      padding: 0,
                      color: item.isFavorite ? "var(--yellow)" : "var(--text-muted)",
                      lineHeight: 1,
                    }}
                  >
                    ★
                  </button>
                  <div className="flex flex-col gap-0">
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: isActive ? "var(--accent)" : "var(--text-primary)",
                        lineHeight: 1.2,
                      }}
                    >
                      {item.baseAsset}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "9px",
                        color: "var(--text-tertiary)",
                        lineHeight: 1.2,
                      }}
                    >
                      /{item.quoteAsset}
                      {item.leverage && (
                        <span
                          style={{
                            marginLeft: "3px",
                            color: "var(--yellow)",
                            fontSize: "8px",
                            fontWeight: 600,
                          }}
                        >
                          {item.leverage}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    textAlign: "right",
                    alignSelf: "center",
                  }}
                >
                  {parseFloat(item.price).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>

                {/* Change */}
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "11px",
                    fontWeight: 500,
                    color: isPos ? "var(--green)" : "var(--red)",
                    textAlign: "right",
                    alignSelf: "center",
                  }}
                >
                  {isPos ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .watchlist-row:hover { background: var(--bg-hover) !important; }
      `}</style>
    </div>
  );
}
