// data/macro.json → Gemini로 한국어 매크로 요약 글 작성 → posts/ 에 발행
// 무료: Google AI Studio API 키(GEMINI_API_KEY) + Flash 모델.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // 무료 티어 Flash 계열. AI Studio에서 현재 무료 모델 확인 권장.

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY 환경변수가 없습니다. (GitHub Secrets 또는 로컬 .env)");
  process.exit(1);
}

const macro = JSON.parse(await readFile(resolve(ROOT, "data", "macro.json"), "utf8"));
const today = new Date(macro.updated);
const dateKr = today.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
const dateId = today.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // 한국 날짜 YYYY-MM-DD

// 수집된 지표를 사람이 읽기 쉬운 한 줄씩으로 정리 (AI 입력용)
const pct = (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v}%`);
const lines = macro.indicators
  .map((i) =>
    i.ok
      ? `- ${i.name}: ${i.price} | 당일 ${pct(i.changePct)}, 주간 ${pct(i.weekPct)}, 월간 ${pct(
          i.monthPct
        )} → 국면: ${i.zone} (${i.note})`
      : `- ${i.name}: 데이터 수집 실패`
  )
  .join("\n");

// BTC 온체인 사이클 국면 판정 (대시보드 기준과 동일)
const zoneMvrv = (v) => (v < 0 ? "저평가/바닥권" : v < 2 ? "회복/매집 구간" : v < 5 ? "강세" : v < 7 ? "과열 주의" : "고점권/과열");
const zoneNupl = (v) => (v < 0 ? "항복(바닥)" : v < 25 ? "희망/공포" : v < 50 ? "낙관/불안" : v < 75 ? "신뢰/안도" : "행복/탐욕(고점권)");
const zonePuell = (v) => (v < 0.5 ? "채굴자 항복(바닥권)" : v < 1.2 ? "저평가/회복" : v < 2.5 ? "정상" : v < 4 ? "과열 경계" : "천장권/과열");
const zoneM2 = (v) => (v < 0 ? "유동성 긴축" : v < 5 ? "완만한 확장" : "유동성 확장");

// 비트코인 데이터(가격 + 온체인 사이클) — btc-onchain.json
let btcLines = "(비트코인 데이터 없음)";
let btcData = null;
try {
  btcData = JSON.parse(await readFile(resolve(ROOT, "data", "btc-onchain.json"), "utf8"));
  const m = btcData.metrics || {};
  const c = [];
  if (btcData.btc) c.push(`- BTC 가격: $${btcData.btc.price.toLocaleString()} (24h ${btcData.btc.changePct >= 0 ? "+" : ""}${btcData.btc.changePct}%)`);
  if (m.mvrv) c.push(`- MVRV Z-Score: ${m.mvrv.value} → 사이클: ${zoneMvrv(m.mvrv.value)}`);
  if (m.nupl) c.push(`- NUPL: ${m.nupl.value}% → 심리: ${zoneNupl(m.nupl.value)}`);
  if (m.puell) c.push(`- Puell Multiple: ${m.puell.value} → ${zonePuell(m.puell.value)}`);
  if (c.length) btcLines = c.join("\n");
} catch {}

const system = [
  "너는 한국 개인 투자자를 위한 '매크로 + 비트코인' 시황 블로그 필자다. 목표는 독자가 '3초 안에 핵심을 잡게' 하는 것.",
  "주어진 데이터만 근거로 쓴다. 데이터에 없는 수치를 지어내지 마라.",
  "시장이 움직인 '원인·이유(뉴스/이벤트)'는 추측 금지(뉴스 모름). 데이터가 보여주는 '추세·사이클 위치'만 해석한다.",
  "절대 금지: 모든 지표를 똑같이 나열하는 교과서식 요약. '전반적으로 ~한 환경', '주시할 필요가 있다' 같은 뻔하고 맹탕인 마무리.",
  "대신: 가장 눈에 띄는/특이한 점(동조 또는 괴리)을 콕 집어 직설적으로. 나머지는 과감히 생략.",
  "주식·매크로 = 주간·월간 추세 방향/강도, 당일이 추세와 같은지/되돌림인지, 지표 간 동조 vs 괴리.",
  "비트코인 = 가격 흐름 + 온체인 사이클 지표(MVRV·NUPL·Puell)로 '지금 사이클 어디인가(저평가~과열)'를 읽는 장기 관점.",
  "투자 판단은 독자 몫임을 말미에 한 줄 명시. 매수/매도 권유 금지.",
].join(" ");

const prompt = `오늘은 ${dateKr}.
[주식·매크로 지표]
${lines}

[비트코인]
${btcLines}

위 데이터로 '오늘의 매크로 + 비트코인' 글을 작성하라. 짧고 핵심만. 다음 JSON으로만 응답:
{"title":"...","tldr":"...","points":["...","...","..."],"html":"..."}
- title: 오늘의 핵심을 담은 직설적 제목.
- tldr: 매크로와 BTC를 통틀어 가장 중요한 포인트 하나를 한 문장으로, 임팩트 있게.
- points: '한눈에' 3개(각 15자 내외). 매크로·BTC 섞어도 됨 (예: "BTC, 사이클상 회복 구간").
- html: 두 미니 섹션으로. (1) "<strong>📈 주식·매크로</strong>" 가장 눈에 띄는 1~2개. (2) "<strong>₿ 비트코인</strong>" 가격 흐름 + 온체인 사이클 위치(MVRV·NUPL·Puell가 저평가/회복/과열 중 어디인지) 명시. 각 섹션 2~3문장. <p><strong>만 사용. 지표 나열·뻔한 마무리 금지.`;

const ai = new GoogleGenAI({ apiKey });
const res = await ai.models.generateContent({
  model: MODEL,
  contents: prompt,
  config: {
    systemInstruction: system,
    temperature: 0.7,
    responseMimeType: "application/json",
  },
});

let title, tldr, points, bodyHtml;
try {
  const parsed = JSON.parse(res.text);
  title = parsed.title;
  tldr = parsed.tldr;
  points = Array.isArray(parsed.points) ? parsed.points : [];
  bodyHtml = parsed.html;
  if (!title || !tldr || !bodyHtml) throw new Error("필드 누락");
} catch (e) {
  console.error("[post] Gemini 응답 파싱 실패:", e.message);
  console.error(res.text?.slice(0, 500));
  process.exit(1);
}

// 지표 요약 표 (주식·매크로 + 비트코인)
const fmtNum = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const macroRows = macro.indicators
  .filter((i) => i.ok)
  .map(
    (i) =>
      `<tr><td>${i.name}</td><td>${fmtNum(i.price)}</td><td>${i.changePct >= 0 ? "+" : ""}${i.changePct}%</td><td>${i.zone}</td></tr>`
  )
  .join("");

let btcRows = "";
if (btcData) {
  const m = btcData.metrics || {};
  const r = [];
  if (btcData.btc)
    r.push(`<tr><td>비트코인 가격</td><td>$${fmtNum(btcData.btc.price)}</td><td>${btcData.btc.changePct >= 0 ? "+" : ""}${btcData.btc.changePct}%</td><td>-</td></tr>`);
  if (m.mvrv) r.push(`<tr><td>MVRV Z-Score</td><td>${m.mvrv.value}</td><td>-</td><td>${zoneMvrv(m.mvrv.value)}</td></tr>`);
  if (m.nupl) r.push(`<tr><td>NUPL</td><td>${m.nupl.value}%</td><td>-</td><td>${zoneNupl(m.nupl.value)}</td></tr>`);
  if (m.puell) r.push(`<tr><td>Puell Multiple</td><td>${m.puell.value}</td><td>-</td><td>${zonePuell(m.puell.value)}</td></tr>`);
  if (m.m2) r.push(`<tr><td>미국 M2 (YoY)</td><td>${m.m2.value}%</td><td>-</td><td>${zoneM2(m.m2.value)}</td></tr>`);
  if (r.length)
    btcRows = `<tr><td colspan="4" style="background:#eef2f7;font-weight:600">₿ 비트코인 · 온체인</td></tr>` + r.join("");
}
const tableRows = macroRows + btcRows;

const postHtml = `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
 body{max-width:760px;margin:0 auto;padding:24px;font-family:"Malgun Gothic",sans-serif;line-height:1.7;color:#1a1a1a}
 h1{font-size:22px;line-height:1.4} .date{color:#888;font-size:13px}
 table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14px}
 th,td{border:1px solid #ddd;padding:6px 8px;text-align:left} th{background:#f5f5f5}
 .disc{margin-top:28px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:12px}
 .tldr{background:#fff8e1;border-left:4px solid #ffb300;padding:14px 16px;border-radius:8px;margin:14px 0;font-size:16px;font-weight:700;line-height:1.5}
 .glance{background:#f5f7fa;border-radius:8px;padding:12px 16px;margin:14px 0}
 .glance b{font-size:13px;color:#555} .glance ul{margin:6px 0 0;padding-left:18px} .glance li{margin:3px 0}
 a{color:#2a6}
</style></head><body>
<p class="date">${dateKr} · 오늘의 매크로</p>
<h1>${title}</h1>
<div class="tldr">💡 ${tldr}</div>
<div class="glance"><b>한눈에</b><ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul></div>
<table><thead><tr><th>지표</th><th>값</th><th>등락</th><th>국면</th></tr></thead><tbody>${tableRows}</tbody></table>
${bodyHtml}
<p class="disc">본 글은 자동 수집 데이터 기반 정보 제공이며, 특정 종목의 매수·매도 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다. 데이터 출처: Yahoo Finance · Binance · bitcoin-data.com · FRED.</p>
<p><a href="../index.html">← 대시보드로</a> · <a href="index.html">지난 글 목록</a></p>
</body></html>`;

await mkdir(resolve(ROOT, "posts"), { recursive: true });
await writeFile(resolve(ROOT, "posts", `${dateId}.html`), postHtml, "utf8");

// 글 목록 매니페스트(posts.json) 갱신 → index.html 재생성
const manifestPath = resolve(ROOT, "posts", "posts.json");
let manifest = [];
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  manifest = [];
}
manifest = manifest.filter((p) => p.date !== dateId); // 같은 날 재실행 시 중복 제거
manifest.unshift({ date: dateId, title, file: `${dateId}.html` });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

const listItems = manifest
  .map((p) => `<li><span class="d">${p.date}</span> <a href="${p.file}">${p.title}</a></li>`)
  .join("\n");
const indexHtml = `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>오늘의 매크로 — 지난 글</title>
<style>
 body{max-width:760px;margin:0 auto;padding:24px;font-family:"Malgun Gothic",sans-serif;line-height:1.7}
 li{margin:6px 0} .d{color:#999;font-size:13px;margin-right:8px} a{color:#2a6}
</style></head><body>
<h1>오늘의 매크로 — 지난 글</h1>
<ul>${listItems}</ul>
<p><a href="../index.html">← 대시보드로</a></p>
</body></html>`;
await writeFile(resolve(ROOT, "posts", "index.html"), indexHtml, "utf8");

console.log(`[post] 발행 완료: posts/${dateId}.html — "${title}"`);
