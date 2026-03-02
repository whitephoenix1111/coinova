"use client";

// ============================================================
// AIAnalysisModal — Popup với kết quả phân tích từ Groq AI
// ============================================================

import { useDashboardStore } from "@/store/useDashboardStore";
import type { AIAnalysisResult, TrendDirection, TradeAction } from "@/types";

// ─── Sub-components ──────────────────────────────────────────

function TrendBadge({ trend }: { trend: TrendDirection }) {
  const map: Record<TrendDirection, { color: string; bg: string; label: string; icon: string }> = {
    BULLISH:  { color: "var(--green)", bg: "var(--green-bg)",  label: "Bullish",  icon: "↑" },
    BEARISH:  { color: "var(--red)",   bg: "var(--red-bg)",    label: "Bearish",  icon: "↓" },
    NEUTRAL:  { color: "var(--yellow)", bg: "var(--yellow-bg)", label: "Neutral", icon: "→" },
  };
  const s = map[trend];
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "12px",
        fontWeight: 600,
        color: s.color,
        background: s.bg,
        padding: "3px 10px",
        borderRadius: "3px",
        border: `1px solid ${s.color}33`,
      }}
    >
      {s.icon} {s.label}
    </span>
  );
}

function ActionBadge({ action }: { action: TradeAction }) {
  const map: Record<TradeAction, { color: string; bg: string }> = {
    BUY:  { color: "var(--green)", bg: "var(--green-bg)" },
    SELL: { color: "var(--red)",   bg: "var(--red-bg)" },
    HOLD: { color: "var(--yellow)", bg: "var(--yellow-bg)" },
  };
  const s = map[action];
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "18px",
        fontWeight: 700,
        color: s.color,
        background: s.bg,
        padding: "6px 20px",
        borderRadius: "4px",
        border: `1px solid ${s.color}44`,
        letterSpacing: "0.1em",
      }}
    >
      {action}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 70 ? "var(--green)" : value >= 40 ? "var(--yellow)" : "var(--red)";

  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          flex: 1,
          height: "4px",
          background: "var(--border-subtle)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            background: color,
            borderRadius: "2px",
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "12px",
          fontWeight: 600,
          color,
          minWidth: "36px",
          textAlign: "right",
        }}
      >
        {value}%
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "10px",
        fontWeight: 600,
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "8px",
        paddingBottom: "4px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {children}
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "4px 0",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "12px",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────

function AnalysisContent({ result }: { result: AIAnalysisResult }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Top: Signal + Trend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "10px",
              color: "var(--text-tertiary)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Signal
          </div>
          <ActionBadge action={result.signal.action} />
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "10px",
              color: "var(--text-tertiary)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Trend
          </div>
          <TrendBadge trend={result.trend} />
        </div>
      </div>

      {/* Confidence */}
      <div>
        <SectionTitle>Confidence — {result.signal.strength}</SectionTitle>
        <ConfidenceBar value={result.signal.confidence} />
      </div>

      {/* Summary */}
      <div>
        <SectionTitle>AI Summary</SectionTitle>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          {result.summary}
        </p>
      </div>

      {/* Reasoning */}
      {result.signal.reasoning && (
        <div>
          <SectionTitle>Reasoning</SectionTitle>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "12px",
              lineHeight: 1.6,
              color: "var(--text-tertiary)",
            }}
          >
            {result.signal.reasoning}
          </p>
        </div>
      )}

      {/* Trade levels */}
      <div>
        <SectionTitle>Trade Levels</SectionTitle>
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            padding: "12px",
          }}
        >
          <PriceRow label="Entry Price" value={result.signal.entryPrice} />
          <PriceRow label="Take Profit" value={result.signal.takeProfit} />
          <PriceRow label="Stop Loss" value={result.signal.stopLoss} />
        </div>
      </div>

      {/* Key Levels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <SectionTitle>Support</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {result.keyLevels.support.map((level) => (
              <span
                key={level}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "12px",
                  color: "var(--green)",
                  background: "var(--green-bg)",
                  padding: "3px 8px",
                  borderRadius: "3px",
                  borderLeft: "2px solid var(--green)",
                }}
              >
                {level}
              </span>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>Resistance</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {result.keyLevels.resistance.map((level) => (
              <span
                key={level}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "12px",
                  color: "var(--red)",
                  background: "var(--red-bg)",
                  padding: "3px 8px",
                  borderRadius: "3px",
                  borderLeft: "2px solid var(--red)",
                }}
              >
                {level}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Indicators */}
      {result.indicators.length > 0 && (
        <div>
          <SectionTitle>Indicators</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {result.indicators.map((ind) => (
              <div
                key={ind.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 80px 1fr",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 10px",
                  background: "var(--bg-elevated)",
                  borderRadius: "4px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  {ind.name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--accent)",
                  }}
                >
                  {ind.value}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "11px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {ind.interpretation}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--text-muted)",
          textAlign: "right",
        }}
      >
        Analysis at {new Date(result.timestamp).toLocaleString()}
      </div>
    </div>
  );
}

export default function AIAnalysisModal() {
  const { isModalOpen, aiAnalysis, isAnalyzing, closeModal } = useDashboardStore((s) => ({
    isModalOpen: s.isModalOpen,
    aiAnalysis: s.aiAnalysis,
    isAnalyzing: s.isAnalyzing,
    closeModal: s.closeModal,
  }));

  const activeSymbol = useDashboardStore((s) => s.activeSymbol);

  if (!isModalOpen && !isAnalyzing) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeModal}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          zIndex: 50,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 51,
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "80vh",
          background: "var(--bg-panel)",
          border: "1px solid var(--border-default)",
          borderRadius: "8px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.05)",
          animation: "slideUp 0.2s ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
            flexShrink: 0,
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "16px" }}>🤖</span>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "0.05em",
                }}
              >
                AI Analysis
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--text-tertiary)",
                }}
              >
                {activeSymbol} · Powered by Groq
              </div>
            </div>
          </div>
          <button
            onClick={closeModal}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-tertiary)",
              fontSize: "18px",
              padding: "2px 6px",
              borderRadius: "4px",
              lineHeight: 1,
              transition: "color 0.1s",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>
          {isAnalyzing ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
                padding: "40px 20px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  border: "3px solid var(--border-subtle)",
                  borderTopColor: "var(--accent)",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                }}
              >
                Analyzing market data...
              </span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : aiAnalysis ? (
            <AnalysisContent result={aiAnalysis} />
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-display)",
                fontSize: "12px",
              }}
            >
              No analysis data available
            </div>
          )}
        </div>
      </div>
    </>
  );
}
