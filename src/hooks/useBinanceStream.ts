// ============================================================
// COINOVA - useBinanceStream
// WebSocket hook kết nối Binance streams, đổ data vào Zustand store
// (Trade stream đã bỏ — không dùng TradeList)
// ============================================================

import { useEffect, useRef, useCallback } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import type { Ticker, OrderBook, OrderBookEntry } from "@/types";

const WS_BASE = "wss://stream.binance.com:9443/stream";
const RECONNECT_DELAY = 3000;

// ─── Raw Binance Payload Types ──────────────────────────────

interface BinanceTickerPayload {
  e: "24hrTicker";
  s: string;
  c: string;   // last price
  P: string;   // price change percent
  p: string;   // price change
  h: string;   // high
  l: string;   // low
  v: string;   // base volume
  q: string;   // quote volume
  x: string;   // prev close
}

interface BinanceDepthPayload {
  e: "depthUpdate";
  s: string;
  U: number;
  u: number;
  b: [string, string][];
  a: [string, string][];
}

interface StreamMessage {
  stream: string;
  data: BinanceTickerPayload | BinanceDepthPayload;
}

// ─── Helpers ────────────────────────────────────────────────

function parseSymbolAssets(symbol: string): { baseAsset: string; quoteAsset: string } {
  const quotes = ["USDT", "BUSD", "BTC", "ETH", "BNB", "USD"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) {
      return { baseAsset: symbol.slice(0, -q.length), quoteAsset: q };
    }
  }
  return { baseAsset: symbol.slice(0, -4), quoteAsset: symbol.slice(-4) };
}

function parseTicker(data: BinanceTickerPayload): Ticker {
  const { baseAsset, quoteAsset } = parseSymbolAssets(data.s);
  return {
    symbol: data.s,
    baseAsset,
    quoteAsset,
    price: data.c,
    priceChange: data.p,
    priceChangePercent: data.P,
    highPrice: data.h,
    lowPrice: data.l,
    volume: data.v,
    quoteVolume: data.q,
    prevClosePrice: data.x,
  };
}

function parseOrderBook(symbol: string, data: BinanceDepthPayload): OrderBook {
  const toEntry = ([price, quantity]: [string, string]): OrderBookEntry => ({
    price,
    quantity,
    total: parseFloat(price) * parseFloat(quantity),
  });
  return {
    symbol,
    bids: data.b.slice(0, 20).map(toEntry),
    asks: data.a.slice(0, 20).map(toEntry),
    lastUpdateId: data.u,
  };
}

// ─── Hook ───────────────────────────────────────────────────

export function useBinanceStream() {
  const {
    activeSymbol,
    watchList,
    setTicker,
    updateBottomTicker,
    setOrderBook,
    setIsConnected,
  } = useDashboardStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const streams: string[] = [
      `${activeSymbol.toLowerCase()}@ticker`,
      `${activeSymbol.toLowerCase()}@depth20@100ms`,
    ];

    const watchSymbols = watchList
      .map((w) => w.symbol.toLowerCase())
      .filter((s) => s !== activeSymbol.toLowerCase());

    for (const sym of watchSymbols) {
      streams.push(`${sym}@ticker`);
    }

    const url = `${WS_BASE}?streams=${streams.join("/")}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const msg: StreamMessage = JSON.parse(event.data as string);
        const { stream, data } = msg;

        if (stream.endsWith("@ticker")) {
          const ticker = parseTicker(data as BinanceTickerPayload);
          if (ticker.symbol === activeSymbol) {
            setTicker(ticker);
          } else {
            updateBottomTicker(ticker);
          }
        } else if (stream.includes("@depth")) {
          const ob = parseOrderBook(activeSymbol, data as BinanceDepthPayload);
          setOrderBook(ob);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      // onclose sẽ xử lý reconnect
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY);
    };
  }, [activeSymbol, watchList, setTicker, updateBottomTicker, setOrderBook, setIsConnected]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);
}
