// =============================================================================
// scripts/fetch-coin-meta.mjs
//
// Chạy 1 lần duy nhất để fetch metadata từ CoinGecko → lưu ra coin_meta.json
// Sau đó app đọc file tĩnh, không bao giờ call CoinGecko nữa.
//
// Cách dùng:
//   node scripts/fetch-coin-meta.mjs
//
// Output:
//   public/coin_meta.json
//
// Rate limit safety:
//   - CoinGecko free tier thực tế ~8 req/phút (docs nói 30 nhưng không đúng)
//   - Delay 8s giữa mỗi request → 10 coin mất ~80s, hoàn toàn an toàn
//   - Tự động chờ 60s và retry nếu bị 429
//   - Chạy 1 lần duy nhất trước khi deploy, commit file JSON vào repo
// =============================================================================

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Danh sách coin cần fetch ─────────────────────────────────────────────────
// Map: baseAsset (Binance) → CoinGecko ID
// Chạy 1 lần, commit public/coin_meta.json vào repo → Vercel serve static.
const COIN_MAP = {
  BTC:  "bitcoin",
  ETH:  "ethereum",
  BNB:  "binancecoin",
  SOL:  "solana",
  XRP:  "ripple",
  NEAR: "near",
  DOGE: "dogecoin",
  ADA:  "cardano",
  AVAX: "avalanche-2",
  DOT:  "polkadot",
};

// ─── Helper: delay ────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ─── Fetch 1 coin từ CoinGecko ────────────────────────────────────────────────
async function fetchCoin(coinId) {
  const url = [
    `https://api.coingecko.com/api/v3/coins/${coinId}`,
    `?localization=false`,
    `&tickers=false`,
    `&market_data=true`,
    `&community_data=false`,
    `&developer_data=false`,
    `&sparkline=false`,
  ].join("");

  console.log(`  Fetching ${coinId} ...`);

  const res = await fetch(url, {
    headers: {
      "Accept":     "application/json",
      "User-Agent": "COINOVA-meta-fetcher/1.0",
    },
  });

  if (res.status === 429) {
    console.warn(`  ⚠️  Rate limited. Waiting 60s then retry...`);
    await delay(60_000);
    return fetchCoin(coinId); // retry 1 lần
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Extract chỉ những field UI cần ──────────────────────────────────────────
function extractMeta(raw) {
  const symbol = (raw.symbol ?? "").toUpperCase();

  // Description: strip HTML, truncate
  const description = (raw.description?.en ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r?\n+/g, " ")
    .trim()
    .slice(0, 600);

  // Links hữu ích
  const links = [];
  const homepage = raw.links?.homepage?.find((l) => l?.length > 0);
  if (homepage) {
    try { links.push({ label: new URL(homepage).hostname.replace("www.", ""), url: homepage, icon: "🌐" }); } catch {}
  }
  if (raw.links?.whitepaper) {
    links.push({ label: "Whitepaper", url: raw.links.whitepaper, icon: "📄" });
  }
  for (const ex of (raw.links?.blockchain_site ?? []).filter(Boolean).slice(0, 2)) {
    try { links.push({ label: new URL(ex).hostname.replace("www.", ""), url: ex, icon: "🔍" }); } catch {}
  }
  if (raw.links?.subreddit_url) {
    links.push({ label: "Reddit", url: raw.links.subreddit_url, icon: "💬" });
  }
  if (raw.links?.twitter_screen_name) {
    links.push({ label: "Twitter", url: `https://twitter.com/${raw.links.twitter_screen_name}`, icon: "🐦" });
  }

  // Supply helpers
  const fmtSupply = (n) => {
    if (!n) return "Không giới hạn";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B " + symbol;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M " + symbol;
    return n.toLocaleString("en-US") + " " + symbol;
  };
  const fmtUsd = (n) => {
    if (!n) return "N/A";
    if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
    if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6)  return "$" + (n / 1e6).toFixed(2) + "M";
    return "$" + n.toLocaleString("en-US");
  };

  const md = raw.market_data ?? {};

  return {
    id:                raw.id,
    symbol,
    name:              raw.name ?? symbol,
    category:          raw.categories?.[0] ?? "Cryptocurrency",
    hashingAlgorithm:  raw.hashing_algorithm ?? null,
    genesisDate:       raw.genesis_date ?? null,
    launchYear:        raw.genesis_date ? parseInt(raw.genesis_date.slice(0, 4)) : null,
    description,
    links,
    maxSupply:         fmtSupply(md.max_supply),
    circulatingSupply: fmtSupply(md.circulating_supply),
    marketCap:         fmtUsd(md.market_cap?.usd),
    ath:               md.ath?.usd ? "$" + md.ath.usd.toLocaleString("en-US") : "N/A",
    athDate:           md.ath_date?.usd?.slice(0, 10) ?? null,
    fetchedAt:         new Date().toISOString(),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const coins = Object.entries(COIN_MAP);
  console.log(`\n🚀 COINOVA — Fetch coin metadata`);
  console.log(`   Coins  : ${Object.keys(COIN_MAP).join(", ")}`);
  console.log(`   Total  : ${coins.length} coins`);
  console.log(`   Delay  : 1.5s between requests\n`);

  const result = {};

  for (let i = 0; i < coins.length; i++) {
    const [baseAsset, coinId] = coins[i];
    try {
      const raw = await fetchCoin(coinId);
      result[baseAsset] = extractMeta(raw);
      console.log(`  ✅ ${baseAsset.padEnd(6)} ${raw.name}`);
    } catch (err) {
      console.error(`  ❌ ${baseAsset.padEnd(6)} ${err.message}`);
      result[baseAsset] = null; // app dùng fallback khi null
    }

    if (i < coins.length - 1) {
      console.log(`     (waiting 8s to respect rate limit...)`);
      await delay(8000); // 8s delay — CoinGecko free tier thực tế ~8 req/phút
    }
  }

  // Ghi ra public/ để Next.js serve như static file
  const outDir  = path.resolve(__dirname, "..", "public");
  const outFile = path.join(outDir, "coin_meta.json");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");

  const ok = Object.values(result).filter(Boolean).length;
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`\n✅ Done! ${ok}/${coins.length} coins → public/coin_meta.json (${kb} KB)\n`);
}

main().catch((err) => {
  console.error("\n💥 Fatal:", err.message);
  process.exit(1);
});
