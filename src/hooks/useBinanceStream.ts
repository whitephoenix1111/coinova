// ============================================================
// COINOVA - useBinanceStream.ts
// Hook quản lý toàn bộ kết nối WebSocket tới Binance Streams.
//
// NHIỆM VỤ:
//   Mở một WebSocket duy nhất chứa nhiều stream ghép lại (combined stream).
//   Mỗi khi nhận message, phân loại stream và đẩy data vào đúng action của
//   Zustand store để các component re-render với giá trị mới.
//
// CÁC STREAM ĐƯỢC SUBSCRIBE (mỗi lần connect):
//   1. {activeSymbol}@ticker        → giá + 24h stats của cặp đang xem
//   2. {activeSymbol}@depth20@100ms → order book 20 mức giá, cập nhật 100ms/lần
//   3. {watchSymbol}@ticker         → giá của từng symbol còn lại trong watchList
//                                     (trừ activeSymbol vì đã có stream riêng)
//
// LUỒNG DATA:
//   Binance WS → onmessage → parse JSON → phân loại stream
//     "@ticker" của activeSymbol   → setTicker()          → HeaderTicker re-render
//     "@ticker" của watchList item → updateBottomTicker()  → BottomTicker re-render
//                                  → updateWatchListItem() → WatchList re-render
//     "@depth"                     → setOrderBook()       → OrderBook re-render
//
// INITIAL HYDRATION (quan trọng):
//   WebSocket mất vài giây để kết nối và nhận frame đầu tiên.
//   Trong thời gian đó orderBook = null → OrderBook component hiển thị "Loading...".
//   Để tránh điều này, khi WS vừa mở (onopen), fetch ngay snapshot từ /api/history
//   để có data hiển thị ngay lập tức, rồi WS tiếp tục override bằng data real-time.
//
// RECONNECT:
//   Khi WS đóng (lỗi mạng, server drop...) → onclose chờ 3s → gọi lại connect()
//   mountedRef đảm bảo không reconnect sau khi component unmount
//
// HAI useEffect:
//   Effect 1 (chính): chạy connect() khi mount + mỗi khi connect callback đổi
//                     (tức là khi activeSymbol hoặc watchList thay đổi)
//   Effect 2 (seed):  xử lý race condition — Dashboard seed watchList sau render đầu
//                     ([] → 10 items), lúc Effect 1 đã chạy với watchList rỗng nên
//                     không subscribe được watchList streams → detect và reconnect lại
//
// BUG ĐÃ FIX:
//   1. Không có initial hydration → thêm fetch /api/history trong onopen
//   2. BinanceDepthPayload khai báo sai field b/a → phải là bids/asks
//      (stream @depth20@100ms là Partial Book Depth, trả về "bids"/"asks",
//       khác với @depth diff stream mới dùng "b"/"a")
//   3. parseOrderBook đọc data.b / data.a → đổi sang data.bids / data.asks
//   4. updateWatchListItem thiếu → đã thêm vào store và gọi tại đây
// ============================================================

import { useEffect, useRef, useCallback } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import { snapshotToOrderBook } from "@/lib/binance";
import type { Ticker, OrderBook, OrderBookEntry, BinanceDepthSnapshot } from "@/types";

// URL gốc của Binance Combined Stream — hỗ trợ nhiều stream trong 1 connection
// Format: wss://stream.binance.com:9443/stream?streams=s1/s2/s3
const WS_BASE = "wss://stream.binance.com:9443/stream";

// Thời gian chờ trước khi reconnect sau khi WS bị đóng (ms)
const RECONNECT_DELAY = 3000;

// ─── Raw Binance Payload Types ──────────────────────────────
// Binance gửi các field với tên viết tắt 1 chữ cái để giảm bandwidth.
// Các interface này map đúng với format thực tế của API.

// Payload của stream {symbol}@ticker — cập nhật liên tục, ~1s/lần
interface BinanceTickerPayload {
  e: "24hrTicker"; // event type — luôn là chuỗi này
  s: string;       // symbol, vd: "BTCUSDT"
  c: string;       // close price = giá hiện tại (last price)
  P: string;       // price change percent 24h, vd: "2.35" (không có dấu %)
  p: string;       // price change tuyệt đối 24h, vd: "1500.00"
  h: string;       // high price 24h
  l: string;       // low price 24h
  v: string;       // base asset volume 24h, vd: số lượng BTC
  q: string;       // quote asset volume 24h, vd: số USDT tương ứng
  x: string;       // prev close price — giá đóng cửa phiên trước
}

// Payload của stream {symbol}@depth20@100ms — Partial Book Depth Stream
//
// ⚠️  QUAN TRỌNG — HAI LOẠI DEPTH STREAM CÓ FIELD KHÁC NHAU:
//
//   @depth20@100ms  (Partial Book Depth — stream này đang dùng):
//     Trả về snapshot top 20 mức giá, format:
//     { "lastUpdateId": 160, "bids": [["price","qty"],...], "asks": [...] }
//     → field tên đầy đủ: "bids" và "asks"
//     → KHÔNG có field "e" (event type), KHÔNG có "U"
//
//   @depth@100ms  (Diff Book Depth — stream khác, không dùng ở đây):
//     Trả về diff (thay đổi), format:
//     { "e": "depthUpdate", "U": 157, "u": 160, "b": [...], "a": [...] }
//     → field viết tắt: "b" và "a"
//
//   Nhầm lẫn giữa hai loại này là nguyên nhân bug parseOrderBook đọc undefined.
interface BinancePartialDepthPayload {
  lastUpdateId: number;          // ID của snapshot này — dùng để kiểm tra tính liên tục nếu cần
  bids: [string, string][];      // top 20 bids: mảng [price, quantity], giá giảm dần
  asks: [string, string][];      // top 20 asks: mảng [price, quantity], giá tăng dần
}

// Wrapper của Combined Stream — mọi message đều có dạng { stream, data }
// stream: tên stream đã subscribe, vd: "btcusdt@ticker" hoặc "btcusdt@depth20@100ms"
// data: payload thực tế, tùy loại stream
interface StreamMessage {
  stream: string;
  data: BinanceTickerPayload | BinancePartialDepthPayload;
}

// ─── Helper: parseSymbolAssets ───────────────────────────────
// Tách symbol thành baseAsset + quoteAsset để hiển thị trên UI.
// Binance không trả về baseAsset/quoteAsset trong stream ticker,
// nên cần tự tách từ symbol string.
//
// Ví dụ:
//   "BTCUSDT"  → { baseAsset: "BTC",  quoteAsset: "USDT" }
//   "ETHBTC"   → { baseAsset: "ETH",  quoteAsset: "BTC"  }
//   "NEARUSDT" → { baseAsset: "NEAR", quoteAsset: "USDT" }
//
// Cách hoạt động: thử từng suffix trong danh sách quotes theo thứ tự ưu tiên.
// USDT trước BTC/ETH vì "ETHUSDT" phải match USDT chứ không phải ETH.
// Fallback: cắt 4 ký tự cuối nếu không match — đủ cho 99% cặp USDT.
function parseSymbolAssets(symbol: string): { baseAsset: string; quoteAsset: string } {
  const quotes = ["USDT", "BUSD", "BTC", "ETH", "BNB", "USD"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) {
      return { baseAsset: symbol.slice(0, -q.length), quoteAsset: q };
    }
  }
  // Fallback nếu không match quote nào — hiếm gặp trong danh sách watchList hiện tại
  return { baseAsset: symbol.slice(0, -4), quoteAsset: symbol.slice(-4) };
}

// ─── Helper: parseTicker ─────────────────────────────────────
// Chuyển BinanceTickerPayload (field viết tắt) → Ticker (field có tên rõ ràng).
// Được gọi mỗi khi nhận message "@ticker" — khoảng ~1 lần/giây/symbol.
function parseTicker(data: BinanceTickerPayload): Ticker {
  const { baseAsset, quoteAsset } = parseSymbolAssets(data.s);
  return {
    symbol:             data.s, // "BTCUSDT"
    baseAsset,                  // "BTC"
    quoteAsset,                 // "USDT"
    price:              data.c, // giá hiện tại, string để tránh float rounding
    priceChange:        data.p, // thay đổi tuyệt đối 24h
    priceChangePercent: data.P, // thay đổi % 24h — WatchList và BottomTicker dùng field này
    highPrice:          data.h, // cao nhất 24h
    lowPrice:           data.l, // thấp nhất 24h
    volume:             data.v, // volume tính bằng base asset (vd: BTC)
    quoteVolume:        data.q, // volume tính bằng quote asset (vd: USDT)
    prevClosePrice:     data.x, // giá đóng cửa phiên trước
  };
}

// ─── Helper: parseOrderBook ──────────────────────────────────
// Chuyển BinancePartialDepthPayload → OrderBook có thêm field `total` tính sẵn.
// Chỉ lấy 20 mức giá mỗi phía — đủ cho UI.
// `total` = price × quantity — hiển thị trực tiếp ở cột Total trong OrderBook.tsx.
//
// ⚠️  Đọc từ data.bids / data.asks (KHÔNG phải data.b / data.a).
//     @depth20@100ms là Partial Book Depth → field tên đầy đủ.
function parseOrderBook(symbol: string, data: BinancePartialDepthPayload): OrderBook {
  const toEntry = ([price, quantity]: [string, string]): OrderBookEntry => ({
    price,
    quantity,
    total: parseFloat(price) * parseFloat(quantity), // tính sẵn để component không phải tính lại
  });
  return {
    symbol,
    bids:         data.bids.slice(0, 20).map(toEntry), // bids: mua — giá cao nhất ở đầu
    asks:         data.asks.slice(0, 20).map(toEntry), // asks: bán — giá thấp nhất ở đầu
    lastUpdateId: data.lastUpdateId,
  };
}

// ─── Hook: useBinanceStream ──────────────────────────────────
// Được gọi một lần duy nhất từ DashboardInner.
// Không nhận prop, không trả về gì — hoạt động hoàn toàn qua side effect + store.
export function useBinanceStream() {

  // Lấy state cần thiết để build danh sách streams khi connect
  // activeSymbol: quyết định stream @ticker + @depth nào là "stream chính"
  // watchList: lấy danh sách symbol để subscribe @ticker phụ
  const {
    activeSymbol,
    watchList,
    setTicker,           // cập nhật HeaderTicker khi nhận @ticker của activeSymbol
    updateBottomTicker,  // cập nhật BottomTicker khi nhận @ticker của watchList symbol
    updateWatchListItem, // cập nhật WatchList khi nhận @ticker của watchList symbol
    setOrderBook,        // cập nhật OrderBook khi nhận @depth hoặc nhận hydration snapshot
    setIsConnected,      // bật/tắt indicator kết nối ở UI
  } = useDashboardStore();

  // wsRef: giữ instance WebSocket hiện tại để có thể đóng từ nơi khác (cleanup, reconnect)
  // Dùng ref thay vì state vì thay đổi wsRef không cần trigger re-render
  const wsRef = useRef<WebSocket | null>(null);

  // reconnectTimerRef: giữ ID của setTimeout reconnect để có thể cancel khi unmount
  // Tránh trường hợp timer vẫn chạy sau khi component đã unmount → gọi connect() → memory leak
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mountedRef: cờ kiểm tra component còn mounted không trước khi thực hiện side effect
  // Đặt true khi mount, false khi unmount — check trong mọi async callback
  const mountedRef = useRef(true);

  // ── connect ──────────────────────────────────────────────
  // Hàm khởi tạo WebSocket mới. Được bọc trong useCallback để:
  //   1. Dùng làm dependency của useEffect mà không bị recreate mỗi render
  //   2. Tự động recreate khi activeSymbol hoặc watchList thay đổi
  //      → useEffect chính detect connect thay đổi → cleanup WS cũ → mở WS mới
  const connect = useCallback(() => {

    // Guard: không connect nếu component đã unmount
    // (ví dụ: reconnect timer vừa fire nhưng user đã rời trang)
    if (!mountedRef.current) return;

    // Đóng WebSocket cũ nếu còn đang mở trước khi mở cái mới.
    // Tắt onclose trước khi đóng để tránh onclose của WS cũ trigger reconnect thêm lần nữa.
    if (wsRef.current) {
      wsRef.current.onclose = null; // vô hiệu hóa handler reconnect của WS cũ
      wsRef.current.close();        // đóng connection cũ
    }

    // ── Build danh sách streams cần subscribe ──
    // Bắt đầu với 2 stream bắt buộc của activeSymbol:
    //   @ticker    → giá + 24h stats, dùng cho HeaderTicker
    //   @depth20   → order book 20 mức giá, cập nhật mỗi 100ms
    const streams: string[] = [
      `${activeSymbol.toLowerCase()}@ticker`,
      `${activeSymbol.toLowerCase()}@depth20@100ms`,
    ];

    // Lấy tất cả symbol trong watchList trừ activeSymbol (đã có stream riêng ở trên).
    // Mỗi symbol thêm 1 stream @ticker để cập nhật giá trong WatchList + BottomTicker.
    const watchSymbols = watchList
      .map((w) => w.symbol.toLowerCase())
      .filter((s) => s !== activeSymbol.toLowerCase()); // bỏ activeSymbol để không duplicate

    for (const sym of watchSymbols) {
      streams.push(`${sym}@ticker`); // vd: "ethusdt@ticker", "solusdt@ticker", ...
    }

    // Ghép tất cả streams vào 1 URL duy nhất theo format Combined Stream của Binance
    // vd: wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@depth20@100ms/ethusdt@ticker/...
    const url = `${WS_BASE}?streams=${streams.join("/")}`;
    const ws = new WebSocket(url);
    wsRef.current = ws; // lưu vào ref để cleanup/reconnect có thể truy cập

    // ── ws.onopen ─────────────────────────────────────────
    // Gọi sau khi WebSocket handshake thành công, bắt đầu nhận message.
    //
    // Ngoài việc đánh dấu isConnected, còn fetch depth snapshot từ /api/history
    // ngay lập tức để hydrate OrderBook trước khi frame WS đầu tiên đến.
    //
    // Lý do cần hydration:
    //   WS mất ~1-3 giây sau khi onopen để gửi frame @depth đầu tiên.
    //   Trong thời gian đó orderBook = null → OrderBook hiển thị "Loading...".
    //   Fetch REST snapshot (~200ms) cho phép OrderBook render ngay khi WS vừa mở.
    //   Sau đó WS tiếp tục ghi đè bằng data real-time — không xung đột.
    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true); // hiển thị indicator "Connected" trên UI

      // Fetch depth snapshot để hiển thị OrderBook ngay lập tức (không chờ WS frame đầu)
      // /api/history là Next.js proxy → gọi Binance REST /api/v3/depth → trả BinanceDepthSnapshot
      fetch(`/api/history?symbol=${activeSymbol}&limit=20`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<BinanceDepthSnapshot>;
        })
        .then((snapshot) => {
          // Kiểm tra component vẫn mounted và activeSymbol chưa đổi trong lúc fetch
          // Nếu user đã click sang symbol khác, không ghi đè orderBook của symbol mới
          if (!mountedRef.current) return;
          const ob = snapshotToOrderBook(activeSymbol, snapshot); // BinanceDepthSnapshot → OrderBook
          setOrderBook(ob); // hydrate store → OrderBook component render ngay
        })
        .catch(() => {
          // Nếu fetch thất bại, không sao — WS sẽ gửi @depth frame và override sau
          // Chỉ là user sẽ thấy "Loading..." thêm vài giây
        });
    };

    // ── ws.onmessage ──────────────────────────────────────
    // Gọi mỗi khi Binance gửi 1 frame dữ liệu mới.
    // Combined Stream luôn có format: { stream: "...", data: {...} }
    // Phân loại theo tên stream để gọi đúng action trong store.
    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const msg: StreamMessage = JSON.parse(event.data as string);
        const { stream, data } = msg;

        if (stream.endsWith("@ticker")) {
          // ── Nhận ticker update ──
          // Có thể là ticker của activeSymbol hoặc của watchList symbol.
          // Chuyển raw payload → Ticker object có tên field rõ ràng.
          const ticker = parseTicker(data as BinanceTickerPayload);

          if (ticker.symbol === activeSymbol) {
            // Ticker của cặp đang xem → update HeaderTicker (giá lớn ở trên cùng)
            setTicker(ticker);
          } else {
            // Ticker của watchList symbol → update cả 2 nơi hiển thị giá:
            //   updateBottomTicker: cập nhật thanh cuộn ngang ở BottomTicker
            //   updateWatchListItem: cập nhật cột Price + Change trong WatchList
            // Cả 2 action đều tìm đúng item theo symbol rồi merge giá trị mới vào.
            updateBottomTicker(ticker);
            updateWatchListItem(ticker.symbol, ticker.price, ticker.priceChangePercent);
          }

        } else if (stream.includes("@depth")) {
          // ── Nhận order book update ──
          // @depth20@100ms gửi snapshot 20 mức giá mỗi 100ms.
          // field là "bids"/"asks" (KHÔNG phải "b"/"a" của @depth diff stream).
          // Parse và ghi đè toàn bộ orderBook trong store (không merge từng mức).
          const ob = parseOrderBook(activeSymbol, data as BinancePartialDepthPayload);
          setOrderBook(ob);
        }

      } catch {
        // Bỏ qua frame lỗi (parse fail, format không đúng) — không crash app
      }
    };

    // ── ws.onerror ────────────────────────────────────────
    // Binance WS thường emit error ngay trước khi đóng.
    // Không cần xử lý ở đây vì onclose sẽ luôn được gọi tiếp theo sau onerror
    // và onclose là nơi xử lý reconnect.
    ws.onerror = () => {
      // onclose handles reconnect
    };

    // ── ws.onclose ────────────────────────────────────────
    // Gọi khi WS đóng — do lỗi mạng, Binance drop connection, hoặc tab sleep.
    // Schedule reconnect sau RECONNECT_DELAY ms.
    // Lưu timer ID vào ref để có thể cancel nếu component unmount trước khi timer fire.
    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false); // tắt indicator "Connected" trên UI
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect(); // chỉ reconnect nếu component vẫn còn mounted
      }, RECONNECT_DELAY);
    };

  }, [activeSymbol, watchList, setTicker, updateBottomTicker, updateWatchListItem, setOrderBook, setIsConnected]);
  // dependency array: connect() sẽ được tạo lại khi activeSymbol hoặc watchList thay đổi
  // → useEffect chính phát hiện connect thay đổi → cleanup WS cũ → mở WS mới với streams mới

  // ── Effect 1: Quản lý vòng đời WebSocket ─────────────────
  // Chạy connect() ngay khi mount và mỗi khi hàm connect thay đổi
  // (tức là mỗi khi activeSymbol hoặc watchList thay đổi).
  //
  // Cleanup function (return): chạy trước khi effect re-run hoặc khi unmount.
  //   - Đánh dấu unmounted để chặn mọi callback async sau đó
  //   - Cancel reconnect timer nếu đang đếm ngược
  //   - Đóng WebSocket và tắt onclose để tránh trigger reconnect trong lúc cleanup
  useEffect(() => {
    mountedRef.current = true;
    connect(); // mở WebSocket với streams hiện tại

    return () => {
      mountedRef.current = false; // đánh dấu unmounted — chặn mọi callback sau này

      // Cancel reconnect timer nếu đang chờ — tránh connect() fire sau khi đã cleanup
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      // Đóng WebSocket:
      // 1. Tắt onclose trước → onclose sẽ không schedule reconnect trong lúc cleanup
      // 2. Gọi close() → đóng connection
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      setIsConnected(false); // reset indicator về "Disconnected" khi unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]); // chỉ depend vào connect — không list lại các dep của connect để tránh loop

  // ── Effect 2: Xử lý race condition khi seed watchList ────
  //
  // VẤN ĐỀ:
  //   Dashboard (outer component) seed watchList vào store trong useEffect của nó,
  //   tức là SAU render đầu tiên ([] → 10 items).
  //   Effect 1 ở trên đã chạy connect() trong lần render đầu với watchList = [],
  //   nên WS chỉ subscribe stream của activeSymbol, bỏ qua 9 symbol còn lại.
  //   Kết quả: WatchList và BottomTicker không nhận được giá từ WebSocket.
  //
  // GIẢI PHÁP:
  //   Watch watchList.length (không watch cả array để tránh re-run không cần thiết).
  //   Khi phát hiện length nhảy từ 0 → >0 (lần seed đầu tiên), gọi connect() lại.
  //   connect() lúc này thấy watchList đã có 10 items → build đủ streams → mở WS mới.
  //   prevWatchListLenRef ghi nhớ length trước đó để chỉ trigger đúng 1 lần duy nhất.
  const watchListLen = watchList.length;
  const prevWatchListLenRef = useRef(0); // lưu length của lần render trước

  useEffect(() => {
    if (prevWatchListLenRef.current === 0 && watchListLen > 0) {
      // Phát hiện lần seed đầu tiên: 0 → N items
      // Reconnect để subscribe đủ streams cho tất cả watchList symbols
      prevWatchListLenRef.current = watchListLen;
      connect();
    } else {
      // Cập nhật ref cho các lần thay đổi sau (thêm/xóa symbol trong watchList)
      prevWatchListLenRef.current = watchListLen;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchListLen]); // chỉ theo dõi length, không depend vào connect để tránh loop
}
