"use client";

import { useEffect, useCallback } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useBinanceStream } from "@/hooks/useBinanceStream";
import BentoGrid from "./BentoGrid";
import type { WatchListItem, AnalysisRequestPayload } from "@/types";

const DEFAULT_WATCHLIST: WatchListItem[] = [
  { symbol: "BTCUSDT",  baseAsset: "BTC",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: true },
  { symbol: "ETHUSDT",  baseAsset: "ETH",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: true },
  { symbol: "SOLUSDT",  baseAsset: "SOL",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "BNBUSDT",  baseAsset: "BNB",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "XRPUSDT",  baseAsset: "XRP",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "NEARUSDT", baseAsset: "NEAR", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "DOGEUSDT", baseAsset: "DOGE", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "ADAUSDT",  baseAsset: "ADA",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "LINKUSDT", baseAsset: "LINK", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "AVAXUSDT", baseAsset: "AVAX", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
];

const DEFAULT_BOTTOM_TICKERS = DEFAULT_WATCHLIST.map((w) => ({
  symbol: w.symbol,
  baseAsset: w.baseAsset,
  quoteAsset: w.quoteAsset,
  price: "0",
  priceChange: "0",
  priceChangePercent: "0",
  highPrice: "0",
  lowPrice: "0",
  volume: "0",
  quoteVolume: "0",
  prevClosePrice: "0",
}));

function DashboardInner() {
  useBinanceStream();

  const activeSymbol  = useDashboardStore((s) => s.activeSymbol);
  const ticker        = useDashboardStore((s) => s.ticker);
  const orderBook     = useDashboardStore((s) => s.orderBook);
  const trades        = useDashboardStore((s) => s.trades);
  const isAnalyzing   = useDashboardStore((s) => s.isAnalyzing);
  const setAIAnalysis = useDashboardStore((s) => s.setAIAnalysis);
  const setIsAnalyzing = useDashboardStore((s) => s.setIsAnalyzing);
  const openModal     = useDashboardStore((s) => s.openModal);

  const triggerAnalysis = useCallback(async () => {
    if (isAnalyzing || !ticker || !orderBook) return;
    setIsAnalyzing(true);
    openModal();

    const payload: AnalysisRequestPayload = {
      symbol: activeSymbol,
      ticker,
      orderBook,
      recentTrades: trades,
    };

    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setAIAnalysis(result);
    } catch (err) {
      console.error("[Dashboard] Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, ticker, orderBook, activeSymbol, trades, setAIAnalysis, setIsAnalyzing, openModal]);

  useEffect(() => {
    (window as Window & { coinovaTriggerAnalysis?: () => void }).coinovaTriggerAnalysis = triggerAnalysis;
    return () => {
      delete (window as Window & { coinovaTriggerAnalysis?: () => void }).coinovaTriggerAnalysis;
    };
  }, [triggerAnalysis]);

  return <BentoGrid />;
}

export default function Dashboard() {
  const watchListLen    = useDashboardStore((s) => s.watchList.length);
  const bottomTickerLen = useDashboardStore((s) => s.bottomTickers.length);
  const setWatchList    = useDashboardStore((s) => s.setWatchList);
  const setBottomTickers = useDashboardStore((s) => s.setBottomTickers);

  useEffect(() => {
    if (watchListLen === 0) setWatchList(DEFAULT_WATCHLIST);
    if (bottomTickerLen === 0) setBottomTickers(DEFAULT_BOTTOM_TICKERS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DashboardInner />;
}
