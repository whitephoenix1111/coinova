/**
 * binance.ts
 *
 * Helper functions để tương tác với Binance REST API.
 *
 * Vai trò trong kiến trúc:
 * - Được gọi từ /api/history route (server-side) để proxy depth snapshot về client, tránh CORS.
 * - Được gọi từ useBinanceStream hook lúc WebSocket onopen để hydrate OrderBook ngay lập tức,
 *   không để user nhìn thấy order book trống trong lúc chờ WebSocket frame đầu tiên đến.
 *
 * Lưu ý: File này chạy HOÀN TOÀN trên server (trong API route).
 * Không được import trực tiếp từ client component vì Binance API không cho phép
 * cross-origin request từ browser trong một số môi trường (Vercel production).
 */

import type { BinanceDepthSnapshot, OrderBook, OrderBookEntry } from "@/types";

/** Base URL của Binance REST API. Tất cả endpoint đều public, không cần API key. */
const BINANCE_REST = "https://api.binance.com";

// ─── Depth Snapshot ─────────────────────────────────────────────────────────

/**
 * Fetch order book snapshot tại một thời điểm từ Binance REST API.
 *
 * Tại sao cần REST snapshot khi đã có WebSocket?
 * WebSocket stream `@depth20@100ms` chỉ push UPDATE khi có thay đổi, không push
 * toàn bộ order book ngay lúc connect. Nếu chỉ dùng WebSocket, user sẽ thấy
 * order book trống cho đến khi frame đầu tiên đến (~100ms–vài giây).
 * Giải pháp: fetch snapshot qua REST ngay lúc onopen để "hydrate" ngay lập tức,
 * sau đó để WebSocket tiếp tục cập nhật theo thời gian thực.
 *
 * @param symbol - Trading pair, ví dụ "BTCUSDT". Tự động uppercase.
 * @param limit  - Số lượng bid/ask levels muốn lấy. Mặc định 20 (khớp với @depth20 WS stream).
 *                 Binance cho phép: 5, 10, 20, 50, 100, 500, 1000, 5000.
 * @returns BinanceDepthSnapshot gồm lastUpdateId, bids[], asks[] (raw string tuples từ Binance).
 * @throws Error nếu Binance trả về HTTP status không phải 2xx.
 */
export async function fetchDepthSnapshot(
  symbol: string,
  limit: number = 20
): Promise<BinanceDepthSnapshot> {
  const url = `${BINANCE_REST}/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`;

  // revalidate: 0 — tắt Next.js cache hoàn toàn, luôn fetch fresh data
  // vì order book thay đổi theo từng giây, cache dù 1 giây cũng là stale
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`Binance depth fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<BinanceDepthSnapshot>;
}

/**
 * Chuyển đổi BinanceDepthSnapshot (raw format từ API) sang OrderBook (typed internal format).
 *
 * Binance trả về bids/asks dưới dạng mảng tuple string: ["price", "quantity"]
 * Hàm này map sang OrderBookEntry có thêm field `total` (price × quantity)
 * để component có thể hiển thị volume bar visualization mà không cần tính lại.
 *
 * @param symbol   - Symbol để gắn vào OrderBook object (dùng để identify khi store có nhiều coin).
 * @param snapshot - Raw snapshot từ fetchDepthSnapshot().
 * @returns OrderBook với bids/asks đã được typed và tính sẵn total.
 */
export function snapshotToOrderBook(
  symbol: string,
  snapshot: BinanceDepthSnapshot
): OrderBook {
  /**
   * Chuyển một tuple ["price", "quantity"] từ Binance sang OrderBookEntry typed.
   * total = price × quantity, dùng để render thanh volume bar trong OrderBook component.
   */
  const toEntry = ([price, quantity]: [string, string]): OrderBookEntry => ({
    price,
    quantity,
    total: parseFloat(price) * parseFloat(quantity),
  });

  return {
    symbol: symbol.toUpperCase(),
    bids: snapshot.bids.map(toEntry),
    asks: snapshot.asks.map(toEntry),
    // lastUpdateId dùng để đồng bộ với WebSocket diff updates nếu sau này cần implement
    // incremental order book update (hiện tại app dùng full snapshot mỗi 100ms nên chưa cần)
    lastUpdateId: snapshot.lastUpdateId,
  };
}

// ─── 24hr Ticker ────────────────────────────────────────────────────────────

/**
 * Shape của response từ Binance GET /api/v3/ticker/24hr.
 * Chỉ định nghĩa các field mà COINOVA thực sự dùng — Binance trả về nhiều field hơn.
 *
 * Tất cả giá trị là string vì Binance trả về số dạng string để tránh floating point precision loss.
 */
export interface BinanceTicker24hr {
  symbol: string;
  /** Thay đổi giá tuyệt đối trong 24h (ví dụ: "-1234.56") */
  priceChange: string;
  /** Thay đổi giá phần trăm trong 24h (ví dụ: "-2.45") */
  priceChangePercent: string;
  /** Giá giao dịch cuối cùng */
  lastPrice: string;
  /** Giá cao nhất trong 24h */
  highPrice: string;
  /** Giá thấp nhất trong 24h */
  lowPrice: string;
  /** Khối lượng giao dịch tính theo base asset (ví dụ: BTC) */
  volume: string;
  /** Khối lượng giao dịch tính theo quote asset (ví dụ: USDT) */
  quoteVolume: string;
  /** Giá đóng cửa của nến 24h trước — dùng để tính priceChange */
  prevClosePrice: string;
}

/**
 * Fetch thống kê 24h của một trading pair từ Binance REST API.
 *
 * Hiện tại hàm này chưa được dùng trong runtime của app (data 24h đến từ WebSocket @ticker stream).
 * Được giữ lại vì có thể hữu ích cho:
 * - Server-side rendering ban đầu (SSR) nếu muốn page load với data thay vì skeleton
 * - Testing và debugging khi cần kiểm tra giá trị ticker mà không cần mở WebSocket
 * - Fallback khi WebSocket chưa kịp connect mà cần hiển thị data ngay
 *
 * @param symbol - Trading pair, ví dụ "ETHUSDT". Tự động uppercase.
 * @returns BinanceTicker24hr với đầy đủ thống kê 24h.
 * @throws Error nếu Binance trả về HTTP status không phải 2xx.
 */
export async function fetchTicker24hr(symbol: string): Promise<BinanceTicker24hr> {
  const url = `${BINANCE_REST}/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`;

  // revalidate: 0 — không cache, luôn lấy giá mới nhất
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`Binance ticker fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<BinanceTicker24hr>;
}
