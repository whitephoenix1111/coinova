// ============================================================
// COINOVA - Binance Helper
// Fetch depth snapshot và ticker data từ Binance REST API
// ============================================================

import type { BinanceDepthSnapshot, OrderBook, OrderBookEntry } from "@/types";

const BINANCE_REST = "https://api.binance.com";

// ─── Depth Snapshot ─────────────────────────────────────────

/**
 * Lấy order book snapshot qua REST API
 * Dùng để hydrate OrderBook lần đầu trước khi WebSocket kết nối
 */
export async function fetchDepthSnapshot(
  symbol: string,
  limit: number = 20
): Promise<BinanceDepthSnapshot> {
  const url = `${BINANCE_REST}/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`Binance depth fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<BinanceDepthSnapshot>;
}

/**
 * Convert BinanceDepthSnapshot → OrderBook (typed)
 */
export function snapshotToOrderBook(symbol: string, snapshot: BinanceDepthSnapshot): OrderBook {
  const toEntry = ([price, quantity]: [string, string]): OrderBookEntry => ({
    price,
    quantity,
    total: parseFloat(price) * parseFloat(quantity),
  });

  return {
    symbol: symbol.toUpperCase(),
    bids: snapshot.bids.map(toEntry),
    asks: snapshot.asks.map(toEntry),
    lastUpdateId: snapshot.lastUpdateId,
  };
}

// ─── 24hr Ticker ─────────────────────────────────────────────

export interface BinanceTicker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  prevClosePrice: string;
}

/**
 * Lấy ticker 24hr của một symbol
 */
export async function fetchTicker24hr(symbol: string): Promise<BinanceTicker24hr> {
  const url = `${BINANCE_REST}/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`Binance ticker fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<BinanceTicker24hr>;
}
