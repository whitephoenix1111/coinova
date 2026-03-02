"use client";

import { useEffect, useRef } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView: any;
  }
}

// ─── TVWidget: React never touches the inner div after mount ──
function TVWidget({ symbol }: { symbol: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Create a plain div OUTSIDE React's control
    const container = document.createElement("div");
    const containerId = `tv_${symbol.toLowerCase()}_${Date.now()}`;
    container.id = containerId;
    container.style.width = "100%";
    container.style.height = "100%";
    wrapper.appendChild(container);

    const init = () => {
      if (!window.TradingView) return;
      try {
        new window.TradingView.widget({
          autosize: true,
          symbol: `BINANCE:${symbol}`,
          interval: "15",
          timezone: "Asia/Ho_Chi_Minh",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0d1117",
          enable_publishing: false,
          save_image: false,
          container_id: containerId,
          backgroundColor: "#0d1117",
          gridColor: "rgba(30, 42, 53, 0.8)",
          studies: ["STD;MACD", "STD;RSI"],
          hide_side_toolbar: true,
          allow_symbol_change: false,
          details: false,
          hotlist: false,
          calendar: false,
        });
      } catch (e) {
        console.error("TradingView widget error:", e);
      }
    };

    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (window.TradingView) {
      init();
    } else if (!document.getElementById("tv-script")) {
      const script = document.createElement("script");
      script.id = "tv-script";
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    } else {
      intervalId = setInterval(() => {
        if (window.TradingView) {
          if (intervalId) clearInterval(intervalId);
          init();
        }
      }, 100);
    }

    // Cleanup: remove the container we created (not managed by React)
    return () => {
      if (intervalId) clearInterval(intervalId);
      try {
        if (wrapper.contains(container)) {
          wrapper.removeChild(container);
        }
      } catch {
        // ignore
      }
    };
  }, [symbol]);

  // This div is just an anchor — React only manages THIS element
  // The actual TV content lives in a child we create imperatively
  return (
    <div
      ref={wrapperRef}
      style={{ width: "100%", height: "calc(100% - 36px)" }}
    />
  );
}

// ─── Main Chart Component ─────────────────────────────────────
export default function TradingViewChart() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--bg-panel)" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0 12px", height: "36px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
        {["Chart", "Info", "Trading"].map((tab, i) => (
          <button key={tab} style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "12px", padding: "4px 12px", borderRadius: "4px", color: i === 0 ? "var(--accent)" : "var(--text-secondary)", background: i === 0 ? "var(--accent-glow)" : "transparent", border: i === 0 ? "1px solid rgba(0,212,255,0.2)" : "1px solid transparent", cursor: "pointer" }}>
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <AnalyzeButton />
      </div>

      {/* key=activeSymbol forces full unmount+remount of TVWidget on symbol change */}
      <TVWidget key={activeSymbol} symbol={activeSymbol} />
    </div>
  );
}

// ─── Analyze Button ───────────────────────────────────────────
function AnalyzeButton() {
  const activeSymbol   = useDashboardStore((s) => s.activeSymbol);
  const ticker         = useDashboardStore((s) => s.ticker);
  const orderBook      = useDashboardStore((s) => s.orderBook);
  const trades         = useDashboardStore((s) => s.trades);
  const isAnalyzing    = useDashboardStore((s) => s.isAnalyzing);
  const openModal      = useDashboardStore((s) => s.openModal);
  const setAIAnalysis  = useDashboardStore((s) => s.setAIAnalysis);
  const setIsAnalyzing = useDashboardStore((s) => s.setIsAnalyzing);

  const handleAnalyze = async () => {
    if (!ticker || !orderBook || isAnalyzing) return;
    setIsAnalyzing(true);
    openModal();
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: activeSymbol, ticker, orderBook, recentTrades: trades.slice(0, 20) }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setAIAnalysis(data);
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
      style={{ fontFamily: "var(--font-display)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px", borderRadius: "4px", background: isAnalyzing ? "var(--bg-active)" : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))", border: "1px solid rgba(0,212,255,0.3)", color: isAnalyzing ? "var(--text-secondary)" : "var(--accent)", cursor: isAnalyzing || !ticker ? "not-allowed" : "pointer", opacity: !ticker ? 0.5 : 1, fontSize: "12px" }}
    >
      {isAnalyzing
        ? <><span className="spin" style={{ width: "10px", height: "10px", borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--accent)", display: "inline-block" }} /> Analyzing...</>
        : <><span>🤖</span> Analyze</>
      }
    </button>
  );
}
