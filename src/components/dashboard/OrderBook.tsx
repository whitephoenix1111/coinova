"use client";

import { useMemo } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import type { OrderBookEntry } from "@/types";

function PanelHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {title}
      </span>
    </div>
  );
}

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

function OrderRow({ entry, side, maxTotal }: { entry: OrderBookEntry; side: "bid" | "ask"; maxTotal: number }) {
  const price = parseFloat(entry.price);
  const qty = parseFloat(entry.quantity);
  const total = entry.total ?? price * qty;
  const depth = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const color = side === "bid" ? "var(--green)" : "var(--red)";
  const bgColor = side === "bid" ? "var(--green-bg)" : "var(--red-bg)";

  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "3px 12px", cursor: "default" }} className="order-row">
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: `${depth}%`, background: bgColor, pointerEvents: "none" }} />
      <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 500, color, position: "relative", zIndex: 1 }}>
        {price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-primary)", textAlign: "right", position: "relative", zIndex: 1 }}>
        {qty.toFixed(4)}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", textAlign: "right", position: "relative", zIndex: 1 }}>
        {(total / 1000).toFixed(1)}K
      </span>
    </div>
  );
}

export default function OrderBook() {
  const orderBook = useDashboardStore((s) => s.orderBook);
  const ticker    = useDashboardStore((s) => s.ticker);

  const maxAskTotal = useMemo(() => orderBook ? Math.max(...orderBook.asks.map((e) => e.total ?? parseFloat(e.price) * parseFloat(e.quantity))) : 0, [orderBook]);
  const maxBidTotal = useMemo(() => orderBook ? Math.max(...orderBook.bids.map((e) => e.total ?? parseFloat(e.price) * parseFloat(e.quantity))) : 0, [orderBook]);

  const spread = useMemo(() => {
    if (!orderBook?.asks[0] || !orderBook?.bids[0]) return null;
    const ask = parseFloat(orderBook.asks[0].price);
    const bid = parseFloat(orderBook.bids[0].price);
    const s = ask - bid;
    return { spread: s.toFixed(2), pct: ((s / bid) * 100).toFixed(3) };
  }, [orderBook]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-panel)", borderRight: "1px solid var(--border-subtle)", overflow: "hidden" }}>
      <PanelHeader title="Order Book" />
      <ColHeader />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {!orderBook ? (
          <div style={{ padding: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-display)", fontSize: "11px", textAlign: "center" }}>Loading...</div>
        ) : (
          [...orderBook.asks].reverse().map((entry) => (
            <OrderRow key={entry.price} entry={entry} side="ask" maxTotal={maxAskTotal} />
          ))
        )}
      </div>

      <div style={{ padding: "6px 12px", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: parseFloat(ticker?.priceChangePercent ?? "0") >= 0 ? "var(--green)" : "var(--red)" }}>
          {ticker ? parseFloat(ticker.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        </span>
        {spread && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>
            Spread: {spread.pct}%
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {orderBook?.bids.map((entry) => (
          <OrderRow key={entry.price} entry={entry} side="bid" maxTotal={maxBidTotal} />
        ))}
      </div>

      <style>{`.order-row:hover { background: var(--bg-hover); }`}</style>
    </div>
  );
}
