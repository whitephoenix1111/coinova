"use client";

// ============================================================
// HeaderTicker — Top bar: symbol + price + 24h stats
// ============================================================

import { useDashboardStore } from "@/store/useDashboardStore";

function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "10px",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "12px",
          fontWeight: 500,
          color: color || "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: "1px",
        height: "28px",
        background: "var(--border-subtle)",
        flexShrink: 0,
      }}
    />
  );
}

export default function HeaderTicker() {
  const { ticker, activeSymbol, isConnected } = useDashboardStore((s) => ({
    ticker: s.ticker,
    activeSymbol: s.activeSymbol,
    isConnected: s.isConnected,
  }));

  const priceChange = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const isPositive = priceChange >= 0;

  const fmt = (val: string | undefined, decimals = 2) =>
    val ? parseFloat(val).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "—";

  const fmtVolume = (val: string | undefined) => {
    if (!val) return "—";
    const n = parseFloat(val);
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return n.toFixed(2);
  };

  return (
    <header
      style={{
        height: "52px",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "16px",
        flexShrink: 0,
      }}
    >
      {/* Logo + Symbol */}
      <div className="flex items-center gap-3">
        {/* Connection status dot */}
        <div
          className="pulse-dot"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: isConnected ? "var(--green)" : "var(--text-tertiary)",
            boxShadow: isConnected ? "0 0 6px var(--green)" : "none",
            flexShrink: 0,
          }}
        />

        {/* Logo */}
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "14px",
            color: "var(--accent)",
            letterSpacing: "0.1em",
          }}
        >
          COIN<span style={{ color: "var(--text-secondary)" }}>OVA</span>
        </span>

        <Divider />

        {/* Symbol */}
        <div className="flex items-baseline gap-1.5">
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "15px",
              color: "var(--text-primary)",
            }}
          >
            {ticker?.baseAsset || activeSymbol.replace("USDT", "")}
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "11px",
              color: "var(--text-tertiary)",
            }}
          >
            / {ticker?.quoteAsset || "USDT"}
          </span>
        </div>
      </div>

      <Divider />

      {/* Price */}
      <div className="flex items-baseline gap-2">
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "20px",
            color: isPositive ? "var(--green)" : "var(--red)",
            textShadow: isPositive
              ? "0 0 12px rgba(0,230,118,0.3)"
              : "0 0 12px rgba(255,61,90,0.3)",
          }}
        >
          {ticker ? fmt(ticker.price) : "—"}
        </span>

        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "12px",
            fontWeight: 500,
            color: isPositive ? "var(--green)" : "var(--red)",
            background: isPositive ? "var(--green-bg)" : "var(--red-bg)",
            padding: "2px 6px",
            borderRadius: "3px",
          }}
        >
          {ticker
            ? `${isPositive ? "+" : ""}${parseFloat(ticker.priceChangePercent).toFixed(2)}%`
            : "—"}
        </span>
      </div>

      <Divider />

      {/* Stats row */}
      <div className="flex items-center gap-6">
        <StatBlock label="24h Change" value={ticker ? fmt(ticker.priceChange) : "—"} color={isPositive ? "var(--green)" : "var(--red)"} />
        <StatBlock label="24h High" value={fmt(ticker?.highPrice)} />
        <StatBlock label="24h Low" value={fmt(ticker?.lowPrice)} />
        <StatBlock label="Volume" value={fmtVolume(ticker?.quoteVolume)} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Exchange badge */}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "10px",
          fontWeight: 500,
          color: "var(--text-tertiary)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          padding: "3px 8px",
          borderRadius: "3px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Binance
      </div>
    </header>
  );
}
