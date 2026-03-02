"use client";

// ============================================================
// TradingViewChart — Embed TradingView Widget
// ============================================================

import { useEffect, useRef } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView: any;
  }
}

export default function TradingViewChart() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<unknown>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear old widget
    container.innerHTML = "";

    const loadWidget = () => {
      if (!window.TradingView) return;
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: `BINANCE:${activeSymbol}`,
        interval: "15",
        timezone: "Asia/Ho_Chi_Minh",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0d1117",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        container_id: "tv_chart_container",
        backgroundColor: "#0d1117",
        gridColor: "rgba(30, 42, 53, 0.8)",
        studies: ["STD;MACD", "STD;RSI"],
        withdateranges: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        details: false,
        hotlist: false,
        calendar: false,
        show_popup_button: false,
      });
    };

    // Load TradingView script if not loaded
    if (window.TradingView) {
      loadWidget();
    } else {
      const existing = document.getElementById("tv-script");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "tv-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = loadWidget;
        document.head.appendChild(script);
      } else {
        existing.addEventListener("load", loadWidget);
      }
    }

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [activeSymbol]);

  return (
    <div className="relative w-full h-full" style={{ background: "var(--bg-panel)" }}>
      {/* Tab bar above chart */}
      <div
        className="flex items-center gap-1 px-3"
        style={{
          height: "36px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-elevated)",
        }}
      >
        {["Chart", "Info", "Trading"].map((tab, i) => (
          <button
            key={tab}
            className="px-3 py-1 text-xs rounded transition-colors"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              color: i === 0 ? "var(--accent)" : "var(--text-secondary)",
              background: i === 0 ? "var(--accent-glow)" : "transparent",
              border: i === 0 ? "1px solid rgba(0,212,255,0.2)" : "1px solid transparent",
              cursor: "pointer",
            }}
          >
            {tab}
          </button>
        ))}

        {/* Analyze button */}
        <div className="flex-1" />
        <AnalyzeButton />
      </div>

      {/* TradingView container */}
      <div
        id="tv_chart_container"
        ref={containerRef}
        style={{ width: "100%", height: "calc(100% - 36px)" }}
      />
    </div>
  );
}

// ─── Analyze Button (inline để tránh circular import) ───────

function AnalyzeButton() {
  const { ticker, orderBook, trades, isAnalyzing, openModal, setAIAnalysis, setIsAnalyzing } =
    useDashboardStore((s) => ({
      ticker: s.ticker,
      orderBook: s.orderBook,
      trades: s.trades,
      isAnalyzing: s.isAnalyzing,
      openModal: s.openModal,
      setAIAnalysis: s.setAIAnalysis,
      setIsAnalyzing: s.setIsAnalyzing,
    }));

  const activeSymbol = useDashboardStore((s) => s.activeSymbol);

  const handleAnalyze = async () => {
    if (!ticker || !orderBook || isAnalyzing) return;
    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol,
          ticker,
          orderBook,
          recentTrades: trades.slice(0, 20),
        }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setAIAnalysis(data);
      openModal();
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <button
      onClick={handleAnalyze}
      disabled={isAnalyzing || !ticker}
      className="flex items-center gap-2 px-3 py-1 rounded text-xs transition-all"
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        background: isAnalyzing ? "var(--bg-active)" : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))",
        border: "1px solid rgba(0,212,255,0.3)",
        color: isAnalyzing ? "var(--text-secondary)" : "var(--accent)",
        cursor: isAnalyzing || !ticker ? "not-allowed" : "pointer",
        opacity: !ticker ? 0.5 : 1,
      }}
    >
      {isAnalyzing ? (
        <>
          <span
            className="inline-block w-3 h-3 rounded-full border-2"
            style={{
              borderColor: "transparent var(--accent) var(--accent) transparent",
              animation: "spin 0.8s linear infinite",
            }}
          />
          Analyzing...
        </>
      ) : (
        <>
          <span>🤖</span>
          Analyze
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
