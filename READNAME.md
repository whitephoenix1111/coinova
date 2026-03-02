# COINOVA - Project Architecture

## Tech Stack
- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- **State:** Zustand v5
- **Chart:** TradingView Widget (embed, free, has TV watermark)
- **AI:** Groq SDK + Vercel AI SDK v6
- **Data:** Binance WebSocket + Binance REST API

---

## Decisions Đã Chốt
- Chart dùng **TradingView Widget** (không dùng Lightweight Charts dù đã cài)
- Volume tích hợp sẵn trong TradingView widget, không cần component riêng
- AI Analysis hiển thị dạng **Popup/Modal** khi nhấn nút Analyze
- Watchlist giữ nguyên như Binance (cột phải)
- Không làm: hỗ trợ trực tuyến và các tính năng ngoài READNAME

---

## Data Flow

```
[ EXTERNAL SOURCES ]
       |
       |--- (A) Binance WebSocket (wss://stream.binance.com) --> REAL-TIME DATA
       |--- (B) Binance REST API (https://api.binance.com)   --> HISTORY/SNAPSHOT
       |--- (C) Groq AI API                                  --> STRATEGY INSIGHTS

[ NEXT.JS APP ]
       |
       |-- [ CLIENT ]
       |    |-- useBinanceStream (hook) --> subscribe WebSocket (A)
       |    |-- useDashboardStore (zustand) --> buffer state
       |    |-- Components render từ store
       |
       |-- [ SERVER ]
       |    |-- /api/history  --> proxy (B) tránh CORS, lấy depth snapshot
       |    |-- /api/analysis --> nhận data từ client, gọi (C), trả JSON

[ PERSISTENCE ]
       |-- system_config.json --> prompt template cho AI
       |-- data.json          --> watchlist, user config
       |-- localStorage       --> UI preferences
```

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  HeaderTicker — BTC/USDT | Giá | 24h High/Low | Volume         │
├──────────────┬──────────────────────────────┬───────────────────┤
│              │  [Đồ thị] [Thông tin] [...]  │                   │
│  ORDER BOOK  │  [🤖 Analyze ▶]              │   WATCHLIST       │
│              ├──────────────────────────────┤                   │
│  Bids/Asks   │   TRADINGVIEW CHART WIDGET   ├───────────────────┤
│              │   (chart + volume + MA)      │   TRADE LIST      │
│              │                              │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
│  BottomTicker — ETH | SOL | BNB | XRP | NEAR ...               │
└─────────────────────────────────────────────────────────────────┘

                  ↕ khi nhấn Analyze
      ┌──────────────────────────────────┐
      │   🤖 AI Analysis Modal           │
      │   Trend | Signal | Confidence    │
      │   Entry / TP / SL                │
      │   Key Levels (Support/Resist)    │
      │   Indicators                     │
      └──────────────────────────────────┘
```

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── analysis/route.ts     # POST: nhận data → gọi Groq → trả AIAnalysisResult
│   │   └── history/route.ts      # GET: proxy Binance REST (depth snapshot)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # Dashboard chính
│
├── components/
│   ├── dashboard/
│   │   ├── BentoGrid.tsx         # Layout tổng, gắn kết tất cả
│   │   ├── HeaderTicker.tsx      # Thanh trên: BTC/USDT + 24h stats
│   │   ├── BottomTicker.tsx      # Thanh cuộn dưới: ETH, SOL, BNB...
│   │   ├── OrderBook.tsx         # Cột trái: Bids/Asks
│   │   ├── TradingViewChart.tsx  # Giữa: TradingView widget
│   │   ├── WatchList.tsx         # Cột phải trên: danh sách cặp tiền
│   │   ├── TradeList.tsx         # Cột phải dưới: giao dịch gần đây
│   │   └── AIAnalysisModal.tsx   # Modal popup khi nhấn Analyze
│   └── ui/                       # Shared UI components
│
├── hooks/
│   └── useBinanceStream.ts       # WebSocket Binance, đổ data vào store
│
├── store/
│   └── useDashboardStore.ts      # Zustand store (state + actions)
│
├── lib/
│   ├── binance.ts                # Helper: fetch depth, ticker từ REST
│   └── groq.ts                   # Helper: build prompt, call Groq
│
└── types/
    └── index.ts                  # Tất cả TypeScript interfaces
```

---

## Key Types (src/types/index.ts)

```ts
Ticker           // symbol, price, priceChange, high, low, volume
OrderBookEntry   // price, quantity, total
OrderBook        // symbol, bids[], asks[], lastUpdateId
Trade            // id, price, quantity, time, isBuyerMaker
WatchListItem    // symbol, price, priceChangePercent, leverage, isFavorite
AIAnalysisResult // symbol, trend, signal, summary, keyLevels, indicators
AISignal         // action (BUY/SELL/HOLD), strength, confidence, entry, tp, sl
DashboardState   // toàn bộ state của Zustand store
BinanceDepthSnapshot  // raw REST response
AnalysisRequestPayload // payload gửi lên /api/analysis
```

---

## Zustand Store (src/store/useDashboardStore.ts)

**State:** activeSymbol, ticker, bottomTickers, orderBook, trades (max 50),
watchList, aiAnalysis, isAnalyzing, isModalOpen, isConnected

**Actions:** setActiveSymbol (reset ticker/ob/trades), setTicker, updateBottomTicker,
setOrderBook, addTrade, toggleFavorite, setAIAnalysis, openModal, closeModal,
setIsConnected, reset

---

## WebSocket Streams (useBinanceStream)
- `{symbol}@ticker` → setTicker
- `{symbol}@depth20@100ms` → setOrderBook
- `{symbol}@trade` → addTrade
- Các symbol trong watchlist → updateBottomTicker

---

## API Routes

### POST /api/analysis
- Input: `AnalysisRequestPayload` { symbol, ticker, orderBook, recentTrades }
- Đọc prompt template từ `system_config.json`
- Gọi Groq, trả về `AIAnalysisResult` (JSON)

### GET /api/history?symbol=BTCUSDT
- Proxy Binance REST `/api/v3/depth`
- Trả về `BinanceDepthSnapshot` cho OrderBook hydration ban đầu

---

## Progress

- [x] Project setup (Next.js 16, TypeScript, Tailwind v4, Zustand, Groq, AI SDK)
- [x] Cấu trúc thư mục
- [x] types/index.ts
- [x] store/useDashboardStore.ts
- [x] hooks/useBinanceStream.ts
- [x] BentoGrid.tsx (layout)
- [x] TradingViewChart.tsx
- [x] HeaderTicker.tsx
- [x] BottomTicker.tsx
- [x] OrderBook.tsx
- [x] WatchList.tsx
- [~~] TradeList.tsx — REMOVED (feature dropped)
- [x] AIAnalysisModal.tsx
- [ ] lib/binance.ts
- [ ] lib/groq.ts
- [ ] api/history/route.ts
- [ ] api/analysis/route.ts
- [ ] page.tsx (gắn kết)
