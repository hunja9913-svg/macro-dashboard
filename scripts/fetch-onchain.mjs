// BTC 온체인 + M2 수집 → data/btc-onchain.json
// 온체인(MVRV·NUPL·Puell): bitcoin-data.com 무료 API (키 불필요, 10회/시간 제한).
// M2: FRED 무료 API (FRED_API_KEY 필요). 미국 M2(M2SL) YoY 증가율 = 글로벌 유동성 대용.
// 어느 소스든 실패 시 기존값 유지(폴백)해 대시보드가 빈칸이 되지 않게 한다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data", "btc-onchain.json");

// 대시보드 지표 id → [API 엔드포인트, 응답 JSON 필드, 배율]
// 배율: bitcoin-data 단위 → 대시보드 단위 (NUPL은 비율 0~1 → %)
const ONCHAIN = [
  ["mvrv", "mvrv-zscore", "mvrvZscore", 1],
  ["nupl", "nupl", "nupl", 100],
  ["puell", "puell-multiple", "puellMultiple", 1],
];

let existing = { metrics: {} };
try {
  existing = JSON.parse(await readFile(OUT, "utf8"));
} catch {}
const metrics = { ...(existing.metrics || {}) };

// 1) 온체인 (bitcoin-data.com)
for (const [id, ep, field, scale] of ONCHAIN) {
  try {
    // 전체 시계열을 받아 최신값 + 전일 대비 변화율 계산 (요청 수는 /last와 동일).
    const r = await fetch(`https://bitcoin-data.com/v1/${ep}`, {
      headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length < 2) throw new Error("시계열 부족");
    const last = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    if (typeof last[field] !== "number") throw new Error("값 없음");
    const v = last[field] * scale;
    const pv = prev[field] * scale;
    // 전일 대비 절대 변화(Δ). %는 저베이스(예: MVRV 0.35)에서 과장돼 보여 부적합.
    const change = pv != null ? Number((v - pv).toFixed(4)) : null;
    metrics[id] = { value: Number(v.toFixed(4)), change, date: last.d };
    console.log(`[onchain] ${id} = ${metrics[id].value} (전일 Δ${change ?? "-"}) ${last.d}`);
  } catch (e) {
    console.error(`[onchain] ${id} 실패: ${e.message} — 기존값 유지`);
  }
}

// 2) M2 (FRED) — 미국 M2 통화량 YoY 증가율(%)
const fredKey = process.env.FRED_API_KEY;
if (fredKey) {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=${fredKey}&file_type=json&sort_order=desc&limit=14`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const obs = (j.observations || [])
      .filter((o) => o.value !== ".")
      .map((o) => ({ date: o.date, v: parseFloat(o.value) }));
    // obs는 최신순(desc): obs[0]=이번달, obs[12]=12개월 전
    if (obs.length >= 13 && obs[12].v) {
      const yoy = ((obs[0].v - obs[12].v) / obs[12].v) * 100;
      metrics.m2 = { value: Number(yoy.toFixed(2)), date: obs[0].date };
      console.log(`[onchain] m2 (미국 M2 YoY) = ${metrics.m2.value}% (${obs[0].date})`);
    } else {
      throw new Error("관측치 부족");
    }
  } catch (e) {
    console.error(`[onchain] m2 실패: ${e.message} — 기존값 유지`);
  }
} else {
  console.log("[onchain] FRED_API_KEY 없음 — M2 건너뜀");
}

// 3) BTC 가격 (키 불필요)
// ⚠️ GitHub 러너는 미국 IP라 Binance(api.binance.com)가 451로 지역차단된다.
// 그래서 Binance(로컬·KR에서 동작) → Coinbase(미국 IP에서도 동작) 순으로 폴백.
// (브라우저 btc.html은 한국 IP라 Binance 라이브가 정상 — 거긴 그대로 둔다.)
let btc = existing.btc || null;
const priceSources = [
  {
    name: "Binance",
    url: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
    parse: (j) => ({
      price: Math.round(parseFloat(j.lastPrice)),
      changePct: Number(parseFloat(j.priceChangePercent).toFixed(2)),
    }),
  },
  {
    name: "Coinbase",
    url: "https://api.exchange.coinbase.com/products/BTC-USD/stats",
    parse: (j) => {
      const last = parseFloat(j.last);
      const open = parseFloat(j.open); // 24시간 롤링 시가
      return {
        price: Math.round(last),
        changePct: open ? Number((((last - open) / open) * 100).toFixed(2)) : 0,
      };
    },
  },
];
let btcOk = false;
for (const src of priceSources) {
  try {
    const r = await fetch(src.url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const parsed = src.parse(await r.json());
    if (!Number.isFinite(parsed.price) || parsed.price <= 0) throw new Error("가격 파싱 실패");
    btc = parsed;
    btcOk = true;
    console.log(`[onchain] BTC = $${btc.price} (24h ${btc.changePct}%) via ${src.name}`);
    break;
  } catch (e) {
    console.error(`[onchain] BTC 가격 ${src.name} 실패: ${e.message}`);
  }
}
if (!btcOk) console.error("[onchain] BTC 가격 전체 소스 실패 — 기존값 유지");

await mkdir(resolve(ROOT, "data"), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), metrics, btc }, null, 2), "utf8");
console.log("[onchain] data/btc-onchain.json 저장");
