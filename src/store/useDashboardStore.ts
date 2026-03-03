/**
 * useDashboardStore.ts
 *
 * Zustand store trung tâm của toàn bộ ứng dụng COINOVA.
 *
 * Triết lý thiết kế:
 * - STATELESS giữa các session: không dùng localStorage, không persist bất kỳ thứ gì ra disk.
 *   Mọi data reset hoàn toàn khi reload trang — đây là hành vi đúng và có chủ ý vì tất cả
 *   data (giá, order book, kết quả AI) đều là ephemeral và gắn với một thời điểm cụ thể.
 * - SINGLE SOURCE OF TRUTH: tất cả component đọc từ store này, không ai tự fetch riêng
 *   (ngoại trừ CoinInfoPanel fetch coin_meta.json một lần để lấy metadata tĩnh).
 * - ACTIONS ĐƠN GIẢN: mỗi action chỉ làm đúng một việc, không có side effect.
 *   Side effect (WebSocket, fetch) được xử lý ở hook useBinanceStream và component.
 */

import { create } from "zustand";
import type {
  DashboardState,
  Ticker,
  OrderBook,
  Trade,
  WatchListItem,
  AIAnalysisResult,
} from "@/types";

/**
 * Tập hợp tất cả actions (hàm thay đổi state) của store.
 * Được tách riêng khỏi DashboardState để dễ đọc và type-safe.
 */
interface DashboardActions {
  // ─── Symbol ────────────────────────────────────────────────────────────────

  /**
   * Đổi coin đang xem.
   * QUAN TRỌNG: Đồng thời reset ticker, orderBook, trades về null/[]
   * để đảm bảo không hiển thị data cũ của coin trước trong khoảng thời gian
   * ngắn chờ WebSocket reconnect + nhận frame đầu tiên từ coin mới.
   */
  setActiveSymbol: (symbol: string) => void;

  // ─── Ticker ────────────────────────────────────────────────────────────────

  /**
   * Cập nhật ticker (giá, 24h stats) của coin đang active.
   * Được gọi mỗi khi WebSocket nhận frame từ stream `{symbol}@ticker`.
   */
  setTicker: (ticker: Ticker) => void;

  /**
   * Khởi tạo toàn bộ mảng bottomTickers một lần khi app load.
   * Sau đó dùng updateBottomTicker để cập nhật từng item riêng lẻ.
   */
  setBottomTickers: (tickers: Ticker[]) => void;

  /**
   * Cập nhật ticker của một coin cụ thể trong danh sách bottom bar.
   * Được gọi mỗi khi WebSocket nhận frame từ stream `{coin}@ticker`
   * cho các coin phụ trong watchlist (không phải coin đang active).
   * So sánh theo symbol để tìm và thay thế đúng item.
   */
  updateBottomTicker: (ticker: Ticker) => void;

  // ─── Order Book ────────────────────────────────────────────────────────────

  /**
   * Ghi đè toàn bộ order book.
   * Được gọi trong 2 trường hợp:
   * 1. Lúc WebSocket onopen: nhận snapshot từ /api/history (REST) để hydrate ngay,
   *    tránh màn hình order book trống khi chờ WebSocket frame đầu tiên.
   * 2. Mỗi 100ms: WebSocket nhận update từ stream `{symbol}@depth20@100ms`.
   */
  setOrderBook: (orderBook: OrderBook) => void;

  // ─── Trades ────────────────────────────────────────────────────────────────

  /**
   * Ghi đè toàn bộ danh sách trades (dùng khi khởi tạo).
   * Tự động cắt bớt còn tối đa 50 item để tránh memory leak
   * trong session dài khi data liên tục đổ về.
   */
  setTrades: (trades: Trade[]) => void;

  /**
   * Thêm một trade mới vào đầu danh sách (giao dịch mới nhất hiển thị trên cùng).
   * Được gọi khi WebSocket nhận frame từ stream `{symbol}@aggTrade`.
   * Tự động giữ buffer tối đa 50 giao dịch — item cũ nhất bị đẩy ra khi vượt ngưỡng.
   */
  addTrade: (trade: Trade) => void;

  // ─── Watchlist ─────────────────────────────────────────────────────────────

  /**
   * Khởi tạo toàn bộ watchlist khi app load lần đầu.
   * Danh sách coin là cố định (hardcode trong codebase), không cho user tự thêm/xoá.
   */
  setWatchList: (watchList: WatchListItem[]) => void;

  /**
   * Cập nhật giá và % thay đổi của một coin trong watchlist.
   * Được gọi song song với updateBottomTicker khi WebSocket nhận ticker data
   * — WatchList và BottomTicker dùng cùng nguồn data nhưng render ở 2 nơi khác nhau.
   */
  updateWatchListItem: (
    symbol: string,
    price: string,
    priceChangePercent: string
  ) => void;

  /**
   * Toggle trạng thái yêu thích (isFavorite) của một coin trong watchlist.
   * Lưu ý: trạng thái này KHÔNG được persist — reset về false khi reload trang.
   * Nếu muốn persist trong tương lai, cần thêm localStorage middleware vào đây.
   */
  toggleFavorite: (symbol: string) => void;

  // ─── AI Analysis ───────────────────────────────────────────────────────────

  /**
   * Lưu kết quả phân tích AI vừa nhận từ /api/analysis.
   * Đồng thời xóa analysisError (nếu có từ lần phân tích trước)
   * để UI không hiển thị lỗi cũ khi đã có kết quả mới thành công.
   */
  setAIAnalysis: (result: AIAnalysisResult) => void;

  /**
   * Bật/tắt trạng thái loading của AI analysis.
   * true  → đang chờ Groq API trả về (hiển thị spinner trong modal)
   * false → đã nhận được kết quả hoặc gặp lỗi
   */
  setIsAnalyzing: (isAnalyzing: boolean) => void;

  /**
   * Ghi lại message lỗi khi /api/analysis thất bại.
   * Truyền null để xóa lỗi (ví dụ: khi bắt đầu một lần phân tích mới).
   * Modal sẽ render trạng thái "error" thay vì "success" khi field này khác null.
   */
  setAnalysisError: (error: string | null) => void;

  /**
   * Mở AIAnalysisModal.
   * Thường được gọi ngay trước khi dispatch request đến /api/analysis,
   * để user thấy modal với spinner xuất hiện ngay lập tức (không cần chờ response).
   */
  openModal: () => void;

  /**
   * Đóng AIAnalysisModal và đồng thời xóa analysisError.
   * Xóa error khi đóng để lần mở modal sau bắt đầu từ trạng thái sạch,
   * tránh flash lỗi cũ trong tích tắc trước khi loading mới bắt đầu.
   */
  closeModal: () => void;

  // ─── Connection ────────────────────────────────────────────────────────────

  /**
   * Cập nhật trạng thái kết nối WebSocket.
   * true  → WebSocket đang connected và nhận data
   * false → đang kết nối, mất kết nối, hoặc chưa khởi tạo
   * Được dùng để hiển thị indicator trạng thái kết nối trên UI.
   */
  setIsConnected: (isConnected: boolean) => void;

  // ─── Reset ─────────────────────────────────────────────────────────────────

  /**
   * Reset toàn bộ store về initialState.
   * Hiện tại chưa có use case cụ thể trong UI (reload trang đã tự reset),
   * nhưng hữu ích cho testing và có thể dùng cho tính năng "disconnect" trong tương lai.
   */
  reset: () => void;
}

/**
 * Trạng thái khởi tạo của store.
 * Được dùng cả khi tạo store lần đầu lẫn khi gọi reset().
 * Tách ra thành constant riêng để đảm bảo reset() luôn đồng bộ với initial values.
 */
const initialState: DashboardState = {
  /** Coin đang được xem và phân tích, mặc định là Bitcoin. */
  activeSymbol: "BTCUSDT",

  /** Ticker của coin active (giá real-time, 24h stats). null khi chưa nhận được data từ WS. */
  ticker: null,

  /** Mảng ticker cho tất cả coin trong watchlist — dùng bởi BottomTicker và WatchList. */
  bottomTickers: [],

  /** Order book (bids/asks) hiện tại. null trong khoảng thời gian ngắn sau khi đổi coin. */
  orderBook: null,

  /** Buffer tối đa 50 giao dịch gần nhất. Reset về [] khi đổi coin. */
  trades: [],

  /** Danh sách coin trong watchlist (cố định, không user-editable). */
  watchList: [],

  /** Kết quả phân tích AI gần nhất. null khi chưa phân tích hoặc sau khi reset. */
  aiAnalysis: null,

  /** true khi đang chờ Groq API — dùng để hiển thị loading spinner trong modal. */
  isAnalyzing: false,

  /** Kiểm soát việc hiển thị AIAnalysisModal. */
  isModalOpen: false,

  /** Message lỗi từ /api/analysis. null khi không có lỗi. */
  analysisError: null,

  /** Trạng thái kết nối WebSocket tới Binance stream. */
  isConnected: false,
};

/**
 * Store chính của ứng dụng — kết hợp DashboardState và DashboardActions.
 *
 * Cách dùng trong component:
 * @example
 * // Lấy một giá trị
 * const ticker = useDashboardStore((state) => state.ticker);
 *
 * // Lấy một action
 * const setActiveSymbol = useDashboardStore((state) => state.setActiveSymbol);
 *
 * // Lấy nhiều thứ cùng lúc (dùng shallow nếu cần tối ưu re-render)
 * const { ticker, orderBook } = useDashboardStore();
 */
export const useDashboardStore = create<DashboardState & DashboardActions>(
  (set) => ({
    ...initialState,

    // ─── Symbol ──────────────────────────────────────────────────────────────

    setActiveSymbol: (symbol) =>
      // Reset data cũ của coin trước để tránh hiển thị nhầm trong lúc chờ WS reconnect
      set({ activeSymbol: symbol, ticker: null, orderBook: null, trades: [] }),

    // ─── Ticker ──────────────────────────────────────────────────────────────

    setTicker: (ticker) => set({ ticker }),

    setBottomTickers: (tickers) => set({ bottomTickers: tickers }),

    updateBottomTicker: (ticker) =>
      set((state) => ({
        bottomTickers: state.bottomTickers.map((t) =>
          t.symbol === ticker.symbol ? ticker : t
        ),
      })),

    // ─── Order Book ──────────────────────────────────────────────────────────

    setOrderBook: (orderBook) => set({ orderBook }),

    // ─── Trades ──────────────────────────────────────────────────────────────

    // Giữ tối đa 50 giao dịch để tránh memory leak trong session dài
    setTrades: (trades) => set({ trades: trades.slice(0, 50) }),

    addTrade: (trade) =>
      set((state) => ({
        // Thêm vào đầu mảng (mới nhất lên trên), sau đó cắt còn 50
        trades: [trade, ...state.trades].slice(0, 50),
      })),

    // ─── Watchlist ───────────────────────────────────────────────────────────

    setWatchList: (watchList) => set({ watchList }),

    updateWatchListItem: (symbol, price, priceChangePercent) =>
      set((state) => ({
        watchList: state.watchList.map((item) =>
          item.symbol === symbol
            ? { ...item, price, priceChangePercent }
            : item
        ),
      })),

    toggleFavorite: (symbol) =>
      set((state) => ({
        watchList: state.watchList.map((item) =>
          item.symbol === symbol
            ? { ...item, isFavorite: !item.isFavorite }
            : item
        ),
      })),

    // ─── AI Analysis ─────────────────────────────────────────────────────────

    // Xóa error cũ khi có kết quả mới thành công
    setAIAnalysis: (aiAnalysis) => set({ aiAnalysis, analysisError: null }),

    setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

    setAnalysisError: (analysisError) => set({ analysisError }),

    openModal: () => set({ isModalOpen: true }),

    // Xóa error khi đóng modal để lần mở sau bắt đầu từ trạng thái sạch
    closeModal: () => set({ isModalOpen: false, analysisError: null }),

    // ─── Connection ──────────────────────────────────────────────────────────

    setIsConnected: (isConnected) => set({ isConnected }),

    // ─── Reset ───────────────────────────────────────────────────────────────

    reset: () => set(initialState),
  })
);
