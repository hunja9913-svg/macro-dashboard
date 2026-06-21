// BTC 온체인 지표 수집 → data/btc-onchain.json
// 무료 소스: bitcoin-data.com (키 불필요, 시간당 10회 제한 → 하루 1번 3회 호출이라 안전).
// 실패(429/404) 시 기존값을 유지해 대시보드가 빈칸이 되지 않게 한다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data", "btc-onchain.json");

// 대시보드 지표 id → [API 엔드포인트, 응답 JSON 필드명]
const METRICS = [
  ["mvrv", "mvrv-zscore", "mvrvZscore"],
  ["nupl", "nupl", "nupl"],
  ["puell", "puell-multiple", "puellMultiple"],
];

// 기존 파일 로드(실패 시 폴백용)
let existing = { metrics: {} };
try {
  existing = JSON.parse(await readFile(OUT, "utf8"));
} catch {}

const metrics = { ...(existing.metrics || {}) };

for (const [id, ep, field] of METRICS) {
  try {
    const r = await fetch(`https://bitcoin-data.com/v1/${ep}/last`, {
      headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const v = j[field];
    if (typeof v !== "number") throw new Error("값 없음");
    metrics[id] = { value: Number(v.toFixed(4)), date: j.d };
    console.log(`[onchain] ${id} = ${metrics[id].value} (${j.d})`);
  } catch (e) {
    console.error(`[onchain] ${id} 실패: ${e.message} — 기존값 유지`);
  }
}

await mkdir(resolve(ROOT, "data"), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), metrics }, null, 2), "utf8");
console.log("[onchain] data/btc-onchain.json 저장");
