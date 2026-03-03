"use client";

// =============================================================================
// CoinInfoPanel.tsx — Tab "Thông tin": thống kê chi tiết + giới thiệu coin
//
// DATA SOURCE:
//   - /public/coin_meta.json  → metadata tĩnh (fetch 1 lần per coin, cache in-memory)
//   - Zustand store           → ticker + orderBook real-time từ Binance WS
//
// CHIẾN LƯỢC FETCH:
//   - metaCacheRef: Map<baseAsset, CoinMetaJSON | null> — cache trong RAM
//   - Khi đổi coin: check cache trước, nếu miss thì fetch /coin_meta.json 1 lần
//   - null trong cache = coin không có trong file (dùng fallback UI)
//   - File JSON chỉ tải 1 lần (browser cache + in-memory cache), không bao giờ
//     call CoinGecko trong runtime
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";

// ─── Type khớp với output của scripts/fetch-coin-meta.mjs ────────────────────
interface CoinMetaJSON {
  id: string;
  symbol: string;
  name: string;
  category: string;
  hashingAlgorithm: string | null;
  genesisDate: string | null;
  launchYear: number | null;
  description: string;
  links: { label: string; url: string; icon: string }[];
  maxSupply: string;
  circulatingSupply: string;
  marketCap: string;
  ath: string;
  athDate: string | null;
  fetchedAt: string;
}

// Toàn bộ file JSON: Record<baseAsset, CoinMetaJSON | null>
type CoinMetaFile = Record<string, CoinMetaJSON | null>;

// ─── Accent color: đồng nhất theo design system ─────────────────────────────
const COIN_COLOR = "var(--accent)";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtPrice = (p: string) => {
  const n = parseFloat(p);
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return "$" + n.toFixed(4);
  return "$" + n.toFixed(6);
};
const fmtVolume = (v: string) => {
  const n = parseFloat(v);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
};
const fmtPct = (p: string) => {
  const n = parseFloat(p);
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
};
const pctColor = (p: string) =>
  parseFloat(p) >= 0 ? "var(--green)" : "var(--red)";

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      background: "var(--bg-base)", border: "1px solid var(--border-subtle)",
      borderRadius: "6px", padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: "3px",
    }}>
      <span style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-display)" }}>
        {label}
      </span>
      <span style={{ fontSize: "13px", fontFamily: "var(--font-display)", fontWeight: 600, color: accent ?? "var(--text-primary)" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
      <span style={{ width: "3px", height: "14px", background: "var(--accent)", borderRadius: "2px", display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: "10px", fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {children}
      </span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ fontSize: "10px", fontFamily: "var(--font-display)", color: "var(--text-tertiary)", whiteSpace: "nowrap", paddingTop: "1px" }}>
        {label}
      </span>
      <span style={{ fontSize: "11px", fontFamily: "var(--font-display)", color: "var(--text-secondary)", wordBreak: "break-word" }}>
        {value}
      </span>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CoinInfoPanel() {
  const ticker       = useDashboardStore((s) => s.ticker);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const orderBook    = useDashboardStore((s) => s.orderBook);

  const baseAsset = ticker?.baseAsset ?? activeSymbol.replace(/USDT$|BTC$|ETH$|BNB$/, "");
  const color     = COIN_COLOR;

  // ── Metadata state ──────────────────────────────────────────────────────────
  const [meta, setMeta]       = useState<CoinMetaJSON | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  // In-memory cache: tránh fetch lại khi đổi tab qua lại
  // Dùng useRef thay vì module-level variable để safe với SSR
  const metaCacheRef = useRef<Map<string, CoinMetaJSON | null>>(new Map());
  // Cache toàn bộ file để không fetch lại file khi đổi coin
  const fileRef = useRef<CoinMetaFile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      // Cache hit → dùng ngay, không fetch
      if (metaCacheRef.current.has(baseAsset)) {
        setMeta(metaCacheRef.current.get(baseAsset) ?? null);
        return;
      }

      setMetaLoading(true);

      try {
        // Fetch file JSON 1 lần duy nhất, cache vào fileRef
        if (!fileRef.current) {
          const res = await fetch("/coin_meta.json");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          fileRef.current = await res.json() as CoinMetaFile;
        }

        if (cancelled) return;

        const coinData = fileRef.current?.[baseAsset] ?? null;
        metaCacheRef.current.set(baseAsset, coinData);
        setMeta(coinData);

      } catch (err) {
        console.warn("CoinInfoPanel: failed to load coin_meta.json", err);
        metaCacheRef.current.set(baseAsset, null);
        setMeta(null);
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    }

    // Reset meta ngay khi đổi coin để không hiện data cũ trong lúc load
    if (!metaCacheRef.current.has(baseAsset)) setMeta(null);
    loadMeta();

    return () => { cancelled = true; };
  }, [baseAsset]);

  // ── Tính toán chỉ số từ ticker real-time ────────────────────────────────────
  const price     = parseFloat(ticker?.price ?? "0");
  const high24    = parseFloat(ticker?.highPrice ?? "0");
  const low24     = parseFloat(ticker?.lowPrice ?? "0");
  const change24  = parseFloat(ticker?.priceChangePercent ?? "0");
  const prevClose = parseFloat(ticker?.prevClosePrice ?? "0");

  const volatility24 = low24 > 0 ? ((high24 - low24) / low24 * 100).toFixed(2) : "—";
  const priceInRange = high24 > low24 && price > 0
    ? Math.round((price - low24) / (high24 - low24) * 100) : 50;

  // Volume dominance: tỷ lệ volume coin này trong tổng volume watchlist
  const bottomTickers = useDashboardStore((s) => s.bottomTickers);
  const totalWatchVol = bottomTickers.reduce((s, t) => s + parseFloat(t.quoteVolume ?? "0"), 0);
  const thisVol       = parseFloat(ticker?.quoteVolume ?? "0");
  const volDominance  = totalWatchVol > 0 ? (thisVol / totalWatchVol * 100).toFixed(1) : "—";

  const momentum = prevClose > 0
    ? ((price - prevClose) / prevClose * 100).toFixed(3) : "—";

  const totalBidVol = orderBook?.bids.slice(0, 10).reduce((s, b) => s + parseFloat(b.quantity), 0) ?? 0;
  const totalAskVol = orderBook?.asks.slice(0, 10).reduce((s, a) => s + parseFloat(a.quantity), 0) ?? 0;
  const totalVol    = totalBidVol + totalAskVol;
  const bidPct      = totalVol > 0 ? Math.round(totalBidVol / totalVol * 100) : 50;
  const askPct      = 100 - bidPct;

  if (!ticker) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: "12px", fontFamily: "var(--font-display)" }}>
        Đang kết nối...
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── HEADER ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "10px",
        padding: "12px", background: "var(--bg-base)",
        border: `1px solid ${color}33`, borderRadius: "8px",
        position: "relative",
      }}>
        {/* Glow */}
        <div style={{ position: "absolute", top: 0, right: 0, width: "100px", height: "100px", background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`, pointerEvents: "none", flexShrink: 0 }} />

        {/* Badge */}
        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: `linear-gradient(135deg, ${color}33, ${color}11)`, border: `1.5px solid ${color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontFamily: "var(--font-display)", fontWeight: 700, color, flexShrink: 0 }}>
          {baseAsset.slice(0, 2)}
        </div>

        {/* Text block: min-width:0 bắt buộc để flex child có thể shrink */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>

          {/* Dòng 1: tên + symbol */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "15px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
              {meta?.name ?? baseAsset}
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "10px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
              {ticker.baseAsset}/{ticker.quoteAsset}
            </span>
          </div>

          {/* Dòng 2: giá + % */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
              {fmtPrice(ticker.price)}
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "12px", fontWeight: 600, color: pctColor(ticker.priceChangePercent), whiteSpace: "nowrap" }}>
              {fmtPct(ticker.priceChangePercent)}
            </span>
          </div>

          {/* Dòng 3: category badge + launch year */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px", flexWrap: "wrap" }}>
            {meta?.category && (
              <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "3px", background: `${color}22`, color, fontFamily: "var(--font-display)", fontWeight: 600, border: `1px solid ${color}33`, whiteSpace: "nowrap" }}>
                {meta.category}
              </span>
            )}
            {(meta?.launchYear || meta?.hashingAlgorithm) && (
              <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
                {meta?.launchYear ? `${meta.launchYear}` : ""}{meta?.hashingAlgorithm ? ` · ${meta.hashingAlgorithm}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── MARKET STATS ── */}
      <div>
        <SectionTitle>Thống kê thị trường</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          <StatCard label="Giá hiện tại"   value={fmtPrice(ticker.price)}               accent={pctColor(ticker.priceChangePercent)} />
          <StatCard label="Thay đổi 24h"   value={fmtPct(ticker.priceChangePercent)}    sub={fmtPrice(ticker.priceChange)} accent={pctColor(ticker.priceChangePercent)} />
          <StatCard label="Cao nhất 24h"   value={fmtPrice(ticker.highPrice)}            accent="var(--green)" />
          <StatCard label="Thấp nhất 24h"  value={fmtPrice(ticker.lowPrice)}             accent="var(--red)" />
          <StatCard label="Volume 24h"     value={"$" + fmtVolume(ticker.quoteVolume)}  sub={fmtVolume(ticker.volume) + " " + baseAsset} />
          <StatCard label="Biến động 24h"  value={volatility24 === "—" ? "—" : volatility24 + "%"} sub="(High−Low) / Low" />
          {/* Từ coin_meta.json */}
          {meta && <StatCard label="Market Cap"      value={meta.marketCap}         />}
          {meta && <StatCard label="ATH"             value={meta.ath}               sub={meta.athDate ?? undefined} accent="var(--yellow)" />}
          {meta && <StatCard label="Lưu hành"        value={meta.circulatingSupply} />}
          {meta && <StatCard label="Max Supply"      value={meta.maxSupply}         />}
        </div>
      </div>

      {/* ── PRICE RANGE BAR ── */}
      <div>
        <SectionTitle>Vị trí giá trong dải 24h</SectionTitle>
        <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontFamily: "var(--font-display)", color: "var(--text-tertiary)", marginBottom: "6px" }}>
            <span style={{ color: "var(--red)" }}>↓ {fmtPrice(ticker.lowPrice)}</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Giá: {fmtPrice(ticker.price)}</span>
            <span style={{ color: "var(--green)" }}>↑ {fmtPrice(ticker.highPrice)}</span>
          </div>
          <div style={{ position: "relative", height: "6px", background: `linear-gradient(to right, var(--red-bg), var(--green-bg))`, borderRadius: "3px", border: "1px solid var(--border-subtle)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${priceInRange}%`, background: `linear-gradient(to right, var(--red-dim), ${change24 >= 0 ? "var(--green)" : "var(--red)"})`, borderRadius: "3px", transition: "width 0.4s ease" }} />
            <div style={{ position: "absolute", left: `${priceInRange}%`, top: "50%", transform: "translate(-50%, -50%)", width: "10px", height: "10px", borderRadius: "50%", background: change24 >= 0 ? "var(--green)" : "var(--red)", border: "2px solid var(--bg-elevated)", boxShadow: change24 >= 0 ? "0 0 6px var(--green)" : "0 0 6px var(--red)" }} />
          </div>
          <div style={{ textAlign: "center", marginTop: "6px", fontSize: "10px", fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>
            Giá đang ở <strong style={{ color: change24 >= 0 ? "var(--green)" : "var(--red)" }}>{priceInRange}%</strong> dải 24h
          </div>
        </div>
      </div>

      {/* ── TECHNICAL ── */}
      <div>
        <SectionTitle>Chỉ số kỹ thuật nhanh</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          <StatCard
            label="Volume Dominance"
            value={volDominance === "—" ? "—" : volDominance + "%"}
            sub="% trong watchlist"
            accent={volDominance !== "—" && parseFloat(volDominance) > 30 ? "var(--accent)" : "var(--text-primary)"}
          />
          <StatCard
            label="Momentum"
            value={momentum === "—" ? "—" : momentum + "%"}
            sub="Từ giá đóng cửa"
            accent={momentum !== "—" ? pctColor(momentum) : undefined}
          />
        </div>

        {orderBook && (
          <div style={{ marginTop: "6px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontFamily: "var(--font-display)", marginBottom: "6px" }}>
              <span style={{ color: "var(--green)", fontWeight: 600 }}>MUA {bidPct}%</span>
              <span style={{ color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Áp lực Order Book (Top 10)</span>
              <span style={{ color: "var(--red)", fontWeight: 600 }}>{askPct}% BÁN</span>
            </div>
            <div style={{ height: "6px", borderRadius: "3px", background: "var(--red-bg)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${bidPct}%`, background: "linear-gradient(to right, var(--green-dim), var(--green))", borderRadius: "3px", transition: "width 0.5s ease" }} />
            </div>
          </div>
        )}
      </div>

      {/* ── GIỚI THIỆU (từ coin_meta.json) ── */}
      {metaLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-display)" }}>
          <span className="spin" style={{ width: "10px", height: "10px", borderRadius: "50%", border: "2px solid transparent", borderTopColor: "var(--accent)", display: "inline-block" }} />
          Đang tải thông tin...
        </div>
      )}

      {!metaLoading && meta && (
        <>
          <div>
            <SectionTitle>Giới thiệu</SectionTitle>
            <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "12px" }}>
              <p style={{ fontSize: "12px", lineHeight: "1.7", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {meta.description}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", marginTop: "12px" }}>
                {meta.launchYear    && <MetaRow label="Năm ra mắt"  value={String(meta.launchYear)} />}
                {meta.hashingAlgorithm && <MetaRow label="Algorithm" value={meta.hashingAlgorithm} />}
                {meta.genesisDate   && <MetaRow label="Genesis Block" value={meta.genesisDate} />}
                {meta.fetchedAt     && <MetaRow label="Dữ liệu cập nhật" value={meta.fetchedAt.slice(0, 10)} />}
              </div>
            </div>
          </div>

          {/* ── LINKS ── */}
          {meta.links.length > 0 && (
            <div>
              <SectionTitle>Liên kết</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {meta.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontFamily: "var(--font-display)", padding: "4px 10px", borderRadius: "4px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", textDecoration: "none", transition: "border-color 0.15s, color 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!metaLoading && !meta && (
        <div style={{ padding: "12px", background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "6px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-display)", textAlign: "center", lineHeight: "1.6" }}>
          Chưa có thông tin chi tiết cho <strong style={{ color: "var(--text-secondary)" }}>{baseAsset}</strong>.<br />
          Chạy <code style={{ color: "var(--accent)", background: "var(--bg-elevated)", padding: "1px 5px", borderRadius: "3px" }}>node scripts/fetch-coin-meta.mjs</code> để cập nhật.
        </div>
      )}

      <div style={{ height: "8px" }} />
    </div>
  );
}
