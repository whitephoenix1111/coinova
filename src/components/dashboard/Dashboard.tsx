"use client";

// =============================================================================
// Dashboard.tsx — Component gốc khởi động toàn bộ ứng dụng COINOVA
//
// NHIỆM VỤ CHÍNH của file này (theo thứ tự):
//   1. Khởi tạo watchlist + bottom tickers vào Zustand store (nếu store rỗng)
//   2. Bật WebSocket Binance để nhận data real-time (useBinanceStream)
//   3. Expose hàm triggerAnalysis ra window object để BentoGrid gọi khi user nhấn nút Analyze
//   4. Render BentoGrid — layout tổng chứa tất cả component con
//
// CẤU TRÚC HAI LỚP:
//   Dashboard (outer)     → khởi tạo store một lần duy nhất khi mount
//       └─ DashboardInner → chạy WebSocket, xử lý AI analysis, render BentoGrid
//
// Lý do tách 2 lớp: Dashboard chạy useEffect để seed data TRƯỚC khi DashboardInner
// mount, tránh DashboardInner đọc store rỗng và gây lỗi hoặc render sai.
// =============================================================================

import { useEffect, useCallback } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useBinanceStream } from "@/hooks/useBinanceStream";
import BentoGrid from "./BentoGrid";
import type { WatchListItem, AnalysisRequestPayload } from "@/types";

// -----------------------------------------------------------------------------
// DEFAULT_WATCHLIST — Danh sách 10 cặp tiền mặc định hiển thị ở cột phải (WatchList)
//
// Mỗi item gồm:
//   symbol            → mã cặp tiền dùng để subscribe WebSocket Binance (vd: "BTCUSDT")
//   baseAsset         → tên coin chính (vd: "BTC") — dùng để hiển thị tên ngắn
//   quoteAsset        → tiền tệ định giá (vd: "USDT")
//   price             → giá hiện tại, khởi tạo "0" — sẽ được WebSocket cập nhật liên tục
//   priceChangePercent → % thay đổi giá 24h, khởi tạo "0"
//   isFavorite        → BTC và ETH mặc định được ghim lên đầu watchlist
// -----------------------------------------------------------------------------
const DEFAULT_WATCHLIST: WatchListItem[] = [
  { symbol: "BTCUSDT",  baseAsset: "BTC",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: true  },
  { symbol: "ETHUSDT",  baseAsset: "ETH",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: true  },
  { symbol: "SOLUSDT",  baseAsset: "SOL",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "BNBUSDT",  baseAsset: "BNB",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "XRPUSDT",  baseAsset: "XRP",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "NEARUSDT", baseAsset: "NEAR", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "DOGEUSDT", baseAsset: "DOGE", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "ADAUSDT",  baseAsset: "ADA",  quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "LINKUSDT", baseAsset: "LINK", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
  { symbol: "AVAXUSDT", baseAsset: "AVAX", quoteAsset: "USDT", price: "0", priceChangePercent: "0", isFavorite: false },
];

// -----------------------------------------------------------------------------
// DEFAULT_BOTTOM_TICKERS — Dữ liệu ban đầu cho thanh ticker cuộn ở dưới cùng (BottomTicker)
//
// Được tạo từ DEFAULT_WATCHLIST bằng cách map sang shape của BottomTicker:
//   Thêm các trường: priceChange, highPrice, lowPrice, volume, quoteVolume, prevClosePrice
//   Tất cả khởi tạo "0" — WebSocket sẽ fill dữ liệu thật sau khi kết nối
//
// Lý do tách riêng thay vì dùng chung WatchListItem:
//   BottomTicker cần thêm highPrice/lowPrice/volume để hiển thị tooltip đầy đủ
// -----------------------------------------------------------------------------
const DEFAULT_BOTTOM_TICKERS = DEFAULT_WATCHLIST.map((w) => ({
  symbol:            w.symbol,
  baseAsset:         w.baseAsset,
  quoteAsset:        w.quoteAsset,
  price:             "0",
  priceChange:       "0",   // thay đổi giá tuyệt đối (vd: "+1500")
  priceChangePercent:"0",   // thay đổi giá theo % (vd: "+2.35")
  highPrice:         "0",   // giá cao nhất 24h
  lowPrice:          "0",   // giá thấp nhất 24h
  volume:            "0",   // volume coin (vd: BTC)
  quoteVolume:       "0",   // volume tiền tệ (vd: USDT)
  prevClosePrice:    "0",   // giá đóng cửa phiên trước
}));

// =============================================================================
// DashboardInner — Lớp trong: chạy sau khi store đã được seed bởi Dashboard (outer)
//
// Làm 3 việc:
//   1. Gọi useBinanceStream() → bắt đầu kết nối WebSocket Binance, push data vào store
//   2. Định nghĩa triggerAnalysis → gửi data hiện tại lên /api/analysis, nhận kết quả AI
//   3. Expose triggerAnalysis lên window.coinovaTriggerAnalysis để BentoGrid gọi được
//      mà không cần prop drilling qua nhiều tầng component
// =============================================================================
function DashboardInner() {
  // Gọi hook WebSocket — tự động subscribe các stream Binance dựa theo activeSymbol trong store
  // Hook này không trả về gì, nó tự push data vào store qua setTicker, setOrderBook, addTrade, v.v.
  useBinanceStream();

  // Lấy các state cần thiết từ Zustand store để build payload gửi lên API analysis
  const activeSymbol   = useDashboardStore((s) => s.activeSymbol);   // cặp tiền đang xem, vd: "BTCUSDT"
  const ticker         = useDashboardStore((s) => s.ticker);          // giá + 24h stats của activeSymbol
  const orderBook      = useDashboardStore((s) => s.orderBook);       // danh sách bids/asks hiện tại
  const trades         = useDashboardStore((s) => s.trades);          // tối đa 50 giao dịch gần nhất

  // Lấy các action từ store để cập nhật trạng thái sau khi gọi API
  const isAnalyzing    = useDashboardStore((s) => s.isAnalyzing);     // true khi đang chờ API trả về
  const setAIAnalysis  = useDashboardStore((s) => s.setAIAnalysis);   // lưu kết quả AI vào store
  const setIsAnalyzing = useDashboardStore((s) => s.setIsAnalyzing);  // bật/tắt trạng thái loading
  const openModal      = useDashboardStore((s) => s.openModal);       // mở AIAnalysisModal

  // ---------------------------------------------------------------------------
  // triggerAnalysis — Hàm được gọi khi user nhấn nút "🤖 Analyze" trong BentoGrid
  //
  // Luồng xử lý tuần tự:
  //   1. Guard: nếu đang phân tích hoặc chưa có ticker/orderBook → bỏ qua
  //   2. Đánh dấu isAnalyzing = true → UI hiển thị spinner/loading
  //   3. Mở modal ngay lập tức → user thấy modal loading thay vì chờ không có gì
  //   4. Build payload: symbol + ticker + orderBook + recentTrades (50 lệnh gần nhất)
  //   5. POST payload lên /api/analysis → server gọi Groq AI, trả về AIAnalysisResult JSON
  //   6. Lưu kết quả vào store bằng setAIAnalysis → AIAnalysisModal tự render lại
  //   7. finally: tắt isAnalyzing dù thành công hay lỗi
  //
  // useCallback dependency array: bao gồm tất cả state/action dùng trong hàm
  // để tránh closure cũ (stale closure) giữ data cũ khi gọi API
  // ---------------------------------------------------------------------------
  const triggerAnalysis = useCallback(async () => {
    // Guard: không gọi API khi đang chờ kết quả, hoặc khi data chưa có
    if (isAnalyzing || !ticker || !orderBook) return;

    setIsAnalyzing(true); // bật trạng thái loading → UI hiển thị spinner
    openModal();          // mở modal ngay → user thấy modal với skeleton/loading

    // Build payload theo type AnalysisRequestPayload (src/types/index.ts)
    const payload: AnalysisRequestPayload = {
      symbol:       activeSymbol, // vd: "BTCUSDT"
      ticker,                     // giá hiện tại, % thay đổi, high, low, volume
      orderBook,                  // bids[] và asks[] snapshot hiện tại
      recentTrades: trades,       // tối đa 50 trades → AI dùng để đánh giá momentum
    };

    try {
      // POST lên /api/analysis/route.ts — server sẽ đọc system_config.json,
      // build prompt, gọi Groq SDK, parse JSON response, trả về AIAnalysisResult
      const res = await fetch("/api/analysis", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`); // ném lỗi nếu server báo lỗi

      const result = await res.json(); // parse AIAnalysisResult từ response body
      setAIAnalysis(result);           // lưu vào store → AIAnalysisModal render kết quả

    } catch (err) {
      // Log lỗi để debug — không hiển thị toast vì chưa có notification system
      console.error("[Dashboard] Analysis error:", err);
      // Modal vẫn mở nhưng sẽ hiển thị state rỗng/error do aiAnalysis không được set

    } finally {
      setIsAnalyzing(false); // luôn tắt loading dù thành công hay lỗi
    }
  }, [isAnalyzing, ticker, orderBook, activeSymbol, trades, setAIAnalysis, setIsAnalyzing, openModal]);

  // ---------------------------------------------------------------------------
  // Expose triggerAnalysis lên window.coinovaTriggerAnalysis
  //
  // Mục đích: BentoGrid (và các component con) có thể gọi hàm này mà không cần
  // prop drilling qua nhiều tầng. Thay vì truyền triggerAnalysis xuống:
  //   Dashboard → BentoGrid → TradingViewChart → AnalyzeButton
  // Chỉ cần gọi: window.coinovaTriggerAnalysis?.()
  //
  // useEffect re-run mỗi khi triggerAnalysis thay đổi (tức là khi state thay đổi),
  // đảm bảo window luôn giữ bản mới nhất của hàm (không bị stale closure)
  //
  // cleanup: xóa khỏi window khi DashboardInner unmount để tránh memory leak
  // ---------------------------------------------------------------------------
  useEffect(() => {
    (window as Window & { coinovaTriggerAnalysis?: () => void }).coinovaTriggerAnalysis = triggerAnalysis;
    return () => {
      delete (window as Window & { coinovaTriggerAnalysis?: () => void }).coinovaTriggerAnalysis;
    };
  }, [triggerAnalysis]); // re-assign mỗi khi triggerAnalysis được tạo lại

  // Render BentoGrid — layout tổng chứa toàn bộ UI của dashboard
  // BentoGrid không nhận prop nào, tự lấy data từ Zustand store
  return <BentoGrid />;
}

// =============================================================================
// Dashboard (default export) — Lớp ngoài: seed store trước khi render DashboardInner
//
// Tại sao cần lớp ngoài này?
//   Zustand store mặc định có watchList = [] và bottomTickers = []
//   Nếu DashboardInner mount ngay với store rỗng:
//     - useBinanceStream sẽ không subscribe watchlist symbols (vì mảng rỗng)
//     - WatchList và BottomTicker render danh sách rỗng
//   → Cần seed dữ liệu mặc định VÀO STORE TRƯỚC khi DashboardInner chạy
//
// Cách hoạt động:
//   1. useEffect chạy một lần sau khi Dashboard mount ([] dependency)
//   2. Kiểm tra nếu store chưa có data → gọi setWatchList và setBottomTickers
//   3. Sau khi store có data, DashboardInner được render (vì không dùng conditional render,
//      thực ra cả hai render cùng lúc — nhưng useEffect chạy sau render đầu,
//      store sẽ update và trigger re-render DashboardInner với data đúng)
//
// eslint-disable-next-line: bỏ qua warning thiếu dependency vì chỉ muốn chạy 1 lần lúc mount
// =============================================================================
export default function Dashboard() {
  // Đọc length thay vì cả mảng để tránh re-render không cần thiết
  const watchListLen     = useDashboardStore((s) => s.watchList.length);
  const bottomTickerLen  = useDashboardStore((s) => s.bottomTickers.length);

  // Lấy action để seed data vào store
  const setWatchList     = useDashboardStore((s) => s.setWatchList);
  const setBottomTickers = useDashboardStore((s) => s.setBottomTickers);

  // Seed dữ liệu mặc định vào store — chỉ chạy 1 lần khi app khởi động
  // Kiểm tra length trước để không ghi đè nếu user đã load data từ localStorage/server
  useEffect(() => {
    if (watchListLen === 0)    setWatchList(DEFAULT_WATCHLIST);
    if (bottomTickerLen === 0) setBottomTickers(DEFAULT_BOTTOM_TICKERS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // [] = chỉ chạy 1 lần khi mount, không chạy lại khi state thay đổi

  // Render DashboardInner — lớp trong xử lý WebSocket, AI analysis, và UI chính
  return <DashboardInner />;
}
