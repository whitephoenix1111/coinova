# COINOVA — Project Architecture

## Tổng quan

COINOVA là một **stateless trading dashboard** theo dõi thị trường crypto real-time. Toàn bộ data chỉ tồn tại trong RAM (Zustand) trong phiên làm việc — không có database, không có persistence giữa các session. Mỗi lần mở lại là một phiên mới, kéo data tươi từ Binance.

---

## Tech Stack

| Lớp | Công nghệ | Lý do chọn |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Server-side API route để giấu API key |
| Styling | Tailwind CSS v4 | Utility-first, không cần CSS file riêng |
| State | Zustand v5 | Nhẹ, không boilerplate, đủ cho dashboard đơn giản |
| Chart | TradingView Widget (embed) | Miễn phí, tích hợp sẵn volume + MA + RSI + MACD |
| AI | Groq SDK (llama-3.3-70b-versatile) | Nhanh, free tier đủ dùng, JSON mode ổn định |
| Data | Binance WebSocket + REST API | Miễn phí, không cần auth cho public market data |

---

## Kiến trúc: Không cần Database

Dự án **không có và không cần database** vì toàn bộ data đều là ephemeral (tạm thời):

- **Giá, order book, trades** — đến từ Binance WebSocket real-time, lưu lại vô nghĩa vì lỗi thời ngay sau vài giây
- **Kết quả AI** — là snapshot phân tích tại một thời điểm cụ thể, gắn với mức giá lúc đó, không có giá trị sử dụng lại
- **Watchlist** — danh sách coin cố định, không có tính năng yêu thích hay tuỳ chỉnh, không cần lưu

Ba thứ được lưu trên disk là **file cấu hình của developer**, không phải user data:
- `system_config.json` — prompt template cho AI, developer chỉnh khi muốn thay đổi hành vi phân tích
- `.env.local` — chứa `GROQ_API_KEY`, không bao giờ commit lên Git
- `public/coin_meta.json` — metadata tĩnh các coin, được generate bởi `scripts/fetch-coin-meta.mjs`, commit vào repo, Vercel serve như static file

---

## Data Flow

```
[ NGUỒN DỮ LIỆU NGOÀI ]
       |
       |--- (A) Binance WebSocket (wss://stream.binance.com:9443)
       |         Giá real-time, order book, bottom ticker
       |
       |--- (B) Binance REST API (https://api.binance.com)
       |         Depth snapshot lúc mở app (hydrate order book ngay, không chờ WS)
       |
       |--- (C) Groq AI API (llama-3.3-70b-versatile)
       |         Nhận market data → trả AIAnalysisResult JSON (tiếng Việt)
       |
       |--- (D) public/coin_meta.json (static file, served by Vercel)
       |         Metadata tĩnh: tên, mô tả, supply, ATH, links — fetch 1 lần per session

[ NEXT.JS APP ]
       |
       |-- [ CLIENT ]
       |    |-- useBinanceStream   → subscribe (A), hydrate từ (B) lúc onopen
       |    |-- useDashboardStore  → Zustand, buffer toàn bộ state trong RAM
       |    |-- Components         → render trực tiếp từ store, không fetch riêng
       |
       |-- [ SERVER — API Routes ]
       |    |-- /api/history       → proxy (B) tránh CORS, trả depth snapshot
       |    |-- /api/analysis      → nhận payload từ client, giấu GROQ_API_KEY,
       |                             đọc system_config.json, gọi (C), trả JSON
       |
       |-- [ STATIC ]
       |    |-- /coin_meta.json    → (D) served trực tiếp bởi Next.js/Vercel, không qua API route

[ KHÔNG CÓ PERSISTENCE ]
       Không có database, không có localStorage, không có data.json.
       Mọi state reset khi reload trang — đây là hành vi đúng và có chủ ý.
```

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  HeaderTicker — BTC/USDT | Giá | 24h Change | 24h High/Low      │
├──────────────┬──────────────────────────────┬───────────────────┤
│              │  [Chart] [Thông tin]          │                   │
│  ORDER BOOK  │  [🤖 Analyze ▶]              │    WATCHLIST      │
│              │                              │                   │
│  Bids/Asks   │   TRADINGVIEW CHART WIDGET   │  Danh sách coin   │
│  real-time   │   (candle + volume + MA      │  giá + % thay đổi │
│              │    + RSI + MACD tích hợp)    │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
  BottomTicker — ETH | SOL | BNB | XRP | NEAR | ... (cuộn ngang)
```

```
                  ↕ khi nhấn Analyze
      ┌──────────────────────────────────────┐
      │   🤖 AI Analysis Modal               │
      │   ─────────────────────────────────  │
      │   Signal (BUY/SELL/HOLD)  |  Trend   │
      │   Confidence bar + Strength          │
      │   AI Summary (tiếng Việt)            │
      │   Reasoning (tiếng Việt)             │
      │   Trade Levels: Entry / TP / SL      │
      │   Key Levels: Support / Resistance   │
      │   Indicators: Volume, Spread, Flow   │
      └──────────────────────────────────────┘
```

---

## File Structure

```
COINOVA/
├── .env.local                        # GROQ_API_KEY — không commit
├── system_config.json                # Prompt template cho Groq AI
├── public/
│   └── coin_meta.json                # Metadata tĩnh các coin (fetch từ CoinGecko 1 lần, commit vào repo)
├── scripts/
│   └── fetch-coin-meta.mjs           # Script fetch CoinGecko → tạo coin_meta.json (chạy thủ công trước deploy)
│
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── analysis/route.ts     # POST: nhận market data → gọi Groq → trả AIAnalysisResult
    │   │   └── history/route.ts      # GET: proxy Binance REST /api/v3/depth (tránh CORS)
    │   ├── globals.css               # CSS variables, keyframe animations (fadeIn, slideUp, spin)
    │   ├── layout.tsx
    │   └── page.tsx                  # Mount BentoGrid + khởi động WebSocket
    │
    ├── components/dashboard/
    │   ├── BentoGrid.tsx             # Layout tổng: flex column + CSS grid 3 cột
    │   ├── HeaderTicker.tsx          # Thanh trên: symbol, giá, 24h stats
    │   ├── BottomTicker.tsx          # Thanh cuộn ngang dưới: các coin phụ
    │   ├── OrderBook.tsx             # Cột trái: bids/asks real-time
    │   ├── TradingViewChart.tsx      # Cột giữa: TV widget + tab bar (Chart / Thông tin) + nút Analyze
    │   ├── CoinInfoPanel.tsx         # Tab "Thông tin": stats real-time + metadata tĩnh từ coin_meta.json
    │   ├── WatchList.tsx             # Cột phải: danh sách coin để chuyển nhanh
    │   └── AIAnalysisModal.tsx       # Modal kết quả AI (4 state: loading/success/error/empty)
    │
    ├── hooks/
    │   └── useBinanceStream.ts       # Quản lý WebSocket: connect, subscribe, cleanup
    │
    ├── store/
    │   └── useDashboardStore.ts      # Zustand store: toàn bộ state + actions
    │
    ├── lib/
    │   ├── binance.ts                # Helper: fetch depth snapshot từ REST
    │   └── groq.ts                   # Helper: build prompt, gọi Groq, parse JSON
    │
    └── types/
        └── index.ts                  # Tất cả TypeScript interfaces
```

---

## Components

### BentoGrid
Layout container duy nhất của toàn app. Dùng `flex column` cho chiều dọc (Header → Main → BottomTicker) và `CSS grid 3 cột` cho phần giữa. Không chứa logic, không đọc store — chỉ sắp xếp vị trí các component con.

### HeaderTicker
Hiển thị thông tin tổng quan của symbol đang xem: tên cặp tiền, giá hiện tại, % thay đổi 24h, high/low 24h. Đọc trực tiếp từ `ticker` trong store, cập nhật mỗi khi WebSocket push frame mới.

### BottomTicker
Thanh cuộn ngang liên tục ở cuối màn hình, hiển thị giá và % thay đổi của các coin trong watchlist. Dùng CSS animation marquee, data từ `bottomTickers` trong store.

### OrderBook
Cột trái hiển thị bids (lệnh mua, màu xanh) và asks (lệnh bán, màu đỏ) real-time. Được hydrate ngay lập tức từ REST snapshot lúc kết nối, sau đó cập nhật liên tục qua `@depth20@100ms` WebSocket stream.

### TradingViewChart
Cột giữa. Nhúng TradingView widget bằng DOM imperative (không phải React component) vì TV widget inject iframe vào container div. Dùng `key=activeSymbol` để force remount khi đổi coin. Tab bar có 2 tab: **Chart** và **Thông tin** — switching dùng `useState`, TVWidget dùng `display: none` khi ẩn (không unmount) để tránh reload chart mỗi lần đổi tab. Nút Analyze chỉ hiện ở tab Chart.

### CoinInfoPanel
Tab "Thông tin" trong TradingViewChart. Hiển thị thông tin chi tiết của coin đang xem, gồm 2 lớp data:
- **Real-time từ Binance** (qua Zustand store): giá, % thay đổi, high/low 24h, volume, biến động, momentum, volume dominance, order book pressure
- **Metadata tĩnh từ `public/coin_meta.json`**: tên, mô tả, category, năm ra mắt, hashing algorithm, max supply, circulating supply, market cap, ATH, links

Fetch `coin_meta.json` một lần duy nhất rồi cache vào `fileRef`, không bao giờ call CoinGecko trong runtime. Per-coin cache dùng `metaCacheRef` (Map) — đổi tab qua lại không fetch lại.

### WatchList
Cột phải, danh sách các cặp tiền để chuyển symbol nhanh. Click vào một item gọi `setActiveSymbol()` → store reset ticker/orderbook/trades → WebSocket reconnect với symbol mới → TradingView widget remount.

### AIAnalysisModal
Modal hiển thị kết quả phân tích AI. Có 4 trạng thái:
- **Loading** — spinner khi đang chờ Groq
- **Success** — render đầy đủ: Signal, Trend, Confidence, Summary, Reasoning, Trade Levels, Key Levels, Indicators
- **Error** — hiển thị message lỗi cụ thể từ API (không còn "No analysis data available" mơ hồ)
- **Empty** — edge case khi modal mở nhưng chưa có data

---

## Zustand Store

**State:**
- `activeSymbol` — coin đang xem, mặc định BTCUSDT
- `ticker` — giá và stats 24h của symbol active
- `bottomTickers` — mảng ticker cho BottomTicker + WatchList
- `orderBook` — bids/asks hiện tại
- `trades` — tối đa 50 giao dịch gần nhất
- `watchList` — danh sách coin cố định
- `aiAnalysis` — kết quả phân tích AI gần nhất (null khi chưa có)
- `analysisError` — message lỗi nếu API thất bại (null khi không có lỗi)
- `isAnalyzing` — true khi đang chờ Groq API
- `isModalOpen` — kiểm soát hiển thị AIAnalysisModal
- `isConnected` — trạng thái WebSocket

**Nguyên tắc:** `setActiveSymbol()` reset `ticker`, `orderBook`, `trades` về null/[] để đảm bảo không hiển thị data cũ của coin trước trong khoảng thời gian chờ WebSocket kết nối lại.

---

## WebSocket Streams (useBinanceStream)

Một WebSocket connection duy nhất subscribe nhiều streams cùng lúc qua Binance Combined Stream (`/stream?streams=`):
- `{symbol}@ticker` → `setTicker` (giá real-time cho HeaderTicker)
- `{symbol}@depth20@100ms` → `setOrderBook` (order book cập nhật mỗi 100ms)
- `{coin}@ticker` cho mỗi coin trong watchlist → `updateBottomTicker` + `updateWatchListItem`

Khi `onopen`: fetch `/api/history` ngay lập tức để hydrate OrderBook — tránh màn hình trống trong lúc chờ WebSocket frame đầu tiên.

---

## API Routes

### POST /api/analysis
Nhận `{ symbol, ticker, orderBook, recentTrades }` từ client. Đọc `system_config.json` để lấy prompt template, build user prompt bằng cách replace placeholder với data thực, gọi Groq với `response_format: json_object`, trả về `AIAnalysisResult`. Dùng `502` (không phải `500`) khi Groq thất bại vì lỗi đến từ upstream service. GROQ_API_KEY chỉ tồn tại server-side, client không bao giờ biết.

### GET /api/history?symbol=BTCUSDT
Proxy đơn giản đến Binance REST `/api/v3/depth`. Tồn tại để tránh CORS — browser không được gọi Binance API trực tiếp từ một số môi trường. Trả `BinanceDepthSnapshot` để hydrate OrderBook ngay lúc kết nối.

---

## AI Analysis

Groq được gọi với model `llama-3.3-70b-versatile`, `temperature: 0.3` (ưu tiên nhất quán hơn sáng tạo), `max_tokens: 1024`, `response_format: json_object`.

Ngôn ngữ output được chia làm hai loại:
- **Enum cố định** (`BULLISH/BEARISH/NEUTRAL`, `BUY/SELL/HOLD`, `STRONG/MODERATE/WEAK`) — giữ tiếng Anh vì code map trực tiếp vào badge components
- **Văn bản tự do** (`summary`, `reasoning`, `interpretation`) — tiếng Việt, được ràng buộc trong system prompt

Kết quả chỉ sống trong Zustand store trong phiên hiện tại. Không lưu file, không lưu database — đây là hành vi đúng vì phân tích gắn với snapshot giá tại thời điểm đó, không có giá trị sử dụng lại.
