import { create } from "zustand";
import type {
  DashboardState,
  Ticker,
  OrderBook,
  Trade,
  WatchListItem,
  AIAnalysisResult,
} from "@/types";

interface DashboardActions {
  // Symbol
  setActiveSymbol: (symbol: string) => void;

  // Ticker
  setTicker: (ticker: Ticker) => void;
  setBottomTickers: (tickers: Ticker[]) => void;
  updateBottomTicker: (ticker: Ticker) => void;

  // Order Book
  setOrderBook: (orderBook: OrderBook) => void;

  // Trades
  setTrades: (trades: Trade[]) => void;
  addTrade: (trade: Trade) => void;

  // Watchlist
  setWatchList: (watchList: WatchListItem[]) => void;
  toggleFavorite: (symbol: string) => void;

  // AI Analysis
  setAIAnalysis: (result: AIAnalysisResult) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  openModal: () => void;
  closeModal: () => void;

  // Connection
  setIsConnected: (isConnected: boolean) => void;

  // Reset
  reset: () => void;
}

const initialState: DashboardState = {
  activeSymbol: "BTCUSDT",
  ticker: null,
  bottomTickers: [],
  orderBook: null,
  trades: [],
  watchList: [],
  aiAnalysis: null,
  isAnalyzing: false,
  isModalOpen: false,
  isConnected: false,
};

export const useDashboardStore = create<DashboardState & DashboardActions>(
  (set) => ({
    ...initialState,

    // Symbol
    setActiveSymbol: (symbol) =>
      set({ activeSymbol: symbol, ticker: null, orderBook: null, trades: [] }),

    // Ticker
    setTicker: (ticker) => set({ ticker }),
    setBottomTickers: (tickers) => set({ bottomTickers: tickers }),
    updateBottomTicker: (ticker) =>
      set((state) => ({
        bottomTickers: state.bottomTickers.map((t) =>
          t.symbol === ticker.symbol ? ticker : t
        ),
      })),

    // Order Book
    setOrderBook: (orderBook) => set({ orderBook }),

    // Trades - giữ tối đa 50 giao dịch gần nhất
    setTrades: (trades) => set({ trades: trades.slice(0, 50) }),
    addTrade: (trade) =>
      set((state) => ({
        trades: [trade, ...state.trades].slice(0, 50),
      })),

    // Watchlist
    setWatchList: (watchList) => set({ watchList }),
    toggleFavorite: (symbol) =>
      set((state) => ({
        watchList: state.watchList.map((item) =>
          item.symbol === symbol
            ? { ...item, isFavorite: !item.isFavorite }
            : item
        ),
      })),

    // AI Analysis
    setAIAnalysis: (aiAnalysis) => set({ aiAnalysis }),
    setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false }),

    // Connection
    setIsConnected: (isConnected) => set({ isConnected }),

    // Reset về initial state
    reset: () => set(initialState),
  })
);
