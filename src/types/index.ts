// ============================================================
// COINOVA - Type Definitions
// ============================================================

// ------------------------------------------------------------
// TICKER (HeaderTicker + BottomTicker)
// Source: Binance WebSocket @ticker
// ------------------------------------------------------------
export interface Ticker {
  symbol: string;          // "BTCUSDT"
  baseAsset: string;       // "BTC"
  quoteAsset: string;      // "USDT"
  price: string;           // "66811.84"
  priceChange: string;     // "-587.06"
  priceChangePercent: string; // "-0.87"
  highPrice: string;       // "67574.65"
  lowPrice: string;        // "65056.00"
  volume: string;          // "21465.63" (base asset)
  quoteVolume: string;     // "1425926145.39" (quote asset)
  prevClosePrice: string;
}

// ------------------------------------------------------------
// ORDER BOOK (OrderBook component)
// Source: Binance WebSocket @depth + REST /api/v3/depth
// ------------------------------------------------------------
export interface OrderBookEntry {
  price: string;
  quantity: string;
  total?: number; // computed: price * quantity
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[]; // buy orders, sorted desc by price
  asks: OrderBookEntry[]; // sell orders, sorted asc by price
  lastUpdateId: number;
}

// ------------------------------------------------------------
// TRADE (TradeList component)
// Source: Binance WebSocket @trade
// ------------------------------------------------------------
export interface Trade {
  id: number;
  price: string;
  quantity: string;
  time: number;       // timestamp ms
  isBuyerMaker: boolean; // true = sell, false = buy
}

// ------------------------------------------------------------
// WATCHLIST
// ------------------------------------------------------------
export interface WatchListItem {
  symbol: string;       // "BTCUSDT"
  baseAsset: string;    // "BTC"
  quoteAsset: string;   // "USDT"
  price: string;
  priceChangePercent: string;
  leverage?: string;    // "5x"
  isFavorite: boolean;
}

// ------------------------------------------------------------
// AI ANALYSIS (AIAnalysisModal)
// Source: Groq API response
// ------------------------------------------------------------
export type TrendDirection = "BULLISH" | "BEARISH" | "NEUTRAL";
export type SignalStrength = "STRONG" | "MODERATE" | "WEAK";
export type TradeAction = "BUY" | "SELL" | "HOLD";

export interface AISignal {
  action: TradeAction;
  strength: SignalStrength;
  confidence: number;       // 0-100
  entryPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
  reasoning: string;
}

export interface AIAnalysisResult {
  symbol: string;
  timestamp: number;
  trend: TrendDirection;
  signal: AISignal;
  summary: string;
  keyLevels: {
    support: string[];
    resistance: string[];
  };
  indicators: {
    name: string;
    value: string;
    interpretation: string;
  }[];
}

// ------------------------------------------------------------
// ZUSTAND STORE STATE
// ------------------------------------------------------------
export interface DashboardState {
  // Symbol đang xem
  activeSymbol: string;

  // Ticker data
  ticker: Ticker | null;
  bottomTickers: Ticker[];

  // Order book
  orderBook: OrderBook | null;

  // Recent trades
  trades: Trade[];

  // Watchlist
  watchList: WatchListItem[];

  // AI Analysis
  aiAnalysis: AIAnalysisResult | null;
  isAnalyzing: boolean;
  isModalOpen: boolean;

  // Connection status
  isConnected: boolean;
}

// ------------------------------------------------------------
// BINANCE REST API RESPONSES
// ------------------------------------------------------------
export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
}

export interface BinanceDepthSnapshot {
  lastUpdateId: number;
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][]; // [price, quantity]
}

// ------------------------------------------------------------
// API ROUTE PAYLOADS
// ------------------------------------------------------------
export interface AnalysisRequestPayload {
  symbol: string;
  ticker: Ticker;
  orderBook: OrderBook;
  recentTrades: Trade[];
}

export interface HistoryRequestParams {
  symbol: string;
  interval?: string;
  limit?: number;
}
