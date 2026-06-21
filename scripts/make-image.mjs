// 지표 표를 PNG 이미지로 렌더 → posts/날짜.png (네이버 등 블로그 첨부용)
// @napi-rs/canvas: 프리빌트 바이너리(설치 쉬움). 한국어 폰트는 OS별 경로에서 등록.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 한국어 폰트 등록 (ubuntu: nanum / windows: malgun)
const FONTS = [
  ["/usr/share/fonts/truetype/nanum/NanumGothic.ttf", "KR"],
  ["/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf", "KRB"],
  ["C:\\Windows\\Fonts\\malgun.ttf", "KR"],
  ["C:\\Windows\\Fonts\\malgunbd.ttf", "KRB"],
];
let hasKR = false, hasKRB = false;
for (const [p, fam] of FONTS) {
  try {
    if (fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, fam);
      if (fam === "KR") hasKR = true;
      if (fam === "KRB") hasKRB = true;
    }
  } catch {}
}
const FKR = hasKR ? "KR" : "sans-serif";
const FKRB = hasKRB ? "KRB" : FKR;

// 데이터 로드
const macro = JSON.parse(await readFile(resolve(ROOT, "data", "macro.json"), "utf8"));
let oc = { metrics: {}, btc: null };
try { oc = JSON.parse(await readFile(resolve(ROOT, "data", "btc-onchain.json"), "utf8")); } catch {}
const today = new Date(macro.updated);
const dateKr = today.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
const dateId = today.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

const fmtNum = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const zoneMvrv = (v) => (v < 0 ? "저평가/바닥권" : v < 2 ? "회복/매집 구간" : v < 5 ? "강세" : v < 7 ? "과열 주의" : "고점권/과열");
const zoneNupl = (v) => (v < 0 ? "항복(바닥)" : v < 25 ? "희망/공포" : v < 50 ? "낙관/불안" : v < 75 ? "신뢰/안도" : "행복/탐욕(고점권)");
const zonePuell = (v) => (v < 0.5 ? "채굴자 항복(바닥권)" : v < 1.2 ? "저평가/회복" : v < 2.5 ? "정상" : v < 4 ? "과열 경계" : "천장권/과열");
const zoneM2 = (v) => (v < 0 ? "유동성 긴축" : v < 5 ? "완만한 확장" : "유동성 확장");

// 국면 → 색
function zoneColor(z) {
  const green = ["강세", "상승", "저평가", "회복", "매집", "안도", "완화", "약달러", "원화 강세", "확장"];
  const red = ["급락", "공포", "고점", "과열", "천장", "항복"];
  const orange = ["하락", "경계", "긴축", "강달러", "원화 약세", "주의", "분배"];
  if (red.some((k) => z.includes(k))) return "#d83a3a";
  if (orange.some((k) => z.includes(k))) return "#e08a1e";
  if (green.some((k) => z.includes(k))) return "#1ca85e";
  return "#b58a00"; // 보합/중립/정상
}

// 행 구성
const rows = [];
for (const i of macro.indicators) {
  if (!i.ok) continue;
  rows.push({ name: i.name, val: fmtNum(i.price), chg: `${i.changePct >= 0 ? "+" : ""}${i.changePct}%`, zone: i.zone });
}
rows.push({ header: "비트코인 · 온체인" });
const m = oc.metrics || {};
const dlt = (v, s = "") => (v == null ? "-" : `Δ${v >= 0 ? "+" : ""}${v}${s}`);
if (oc.btc) rows.push({ name: "비트코인 가격", val: `$${fmtNum(oc.btc.price)}`, chg: `${oc.btc.changePct >= 0 ? "+" : ""}${oc.btc.changePct}%`, zone: "-" });
if (m.mvrv) rows.push({ name: "MVRV Z-Score", val: `${m.mvrv.value}`, chg: dlt(m.mvrv.change), zone: zoneMvrv(m.mvrv.value) });
if (m.nupl) rows.push({ name: "NUPL", val: `${m.nupl.value}%`, chg: dlt(m.nupl.change, "%p"), zone: zoneNupl(m.nupl.value) });
if (m.puell) rows.push({ name: "Puell Multiple", val: `${m.puell.value}`, chg: dlt(m.puell.change), zone: zonePuell(m.puell.value) });
if (m.m2) rows.push({ name: "미국 M2 (YoY)", val: `${m.m2.value}%`, chg: "-", zone: zoneM2(m.m2.value) });

// 레이아웃
const W = 840, PAD = 28, TITLE_H = 96, COLH = 40, ROWH = 44, FOOT = 46;
const H = TITLE_H + COLH + rows.length * ROWH + FOOT;
const cv = createCanvas(W, H);
const ctx = cv.getContext("2d");
ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

// 헤더
ctx.fillStyle = "#8a8f98"; ctx.font = `15px ${FKR}`;
ctx.fillText(`${dateKr} · 데이터 자동 수집`, PAD, 38);
ctx.fillStyle = "#15171a"; ctx.font = `26px ${FKRB}`;
ctx.fillText("오늘의 매크로 + 비트코인 지표", PAD, 74);

// 컬럼 x
const X = { name: PAD, val: 470, chg: 600, zone: 630 };
let y = TITLE_H;
// 컬럼 헤더
ctx.fillStyle = "#f3f5f8"; ctx.fillRect(0, y, W, COLH);
ctx.fillStyle = "#6b7280"; ctx.font = `14px ${FKRB}`;
ctx.textAlign = "left"; ctx.fillText("지표", X.name, y + 26);
ctx.textAlign = "right"; ctx.fillText("값", X.val, y + 26); ctx.fillText("등락", X.chg, y + 26);
ctx.textAlign = "left"; ctx.fillText("국면", X.zone, y + 26);
y += COLH;

for (const r of rows) {
  if (r.header) {
    ctx.fillStyle = "#eef2f7"; ctx.fillRect(0, y, W, ROWH);
    ctx.fillStyle = "#3a3f47"; ctx.font = `16px ${FKRB}`; ctx.textAlign = "left";
    ctx.fillText(r.header, X.name, y + 28);
    y += ROWH; continue;
  }
  // 구분선
  ctx.strokeStyle = "#eceef1"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y + ROWH); ctx.lineTo(W, y + ROWH); ctx.stroke();
  // 지표명
  ctx.fillStyle = "#222"; ctx.font = `16px ${FKR}`; ctx.textAlign = "left";
  ctx.fillText(r.name, X.name, y + 28);
  // 값
  ctx.fillStyle = "#15171a"; ctx.font = `16px ${FKRB}`; ctx.textAlign = "right";
  ctx.fillText(r.val, X.val, y + 28);
  // 등락 (색)
  const up = /^\+|Δ\+/.test(r.chg), down = /^-?\d|Δ-/.test(r.chg) && /-/.test(r.chg);
  ctx.fillStyle = r.chg === "-" ? "#9aa0a6" : up ? "#1ca85e" : down ? "#d83a3a" : "#444";
  ctx.font = `15px ${FKR}`;
  ctx.fillText(r.chg, X.chg, y + 28);
  // 국면 (색)
  ctx.fillStyle = r.zone === "-" ? "#9aa0a6" : zoneColor(r.zone);
  ctx.font = `15px ${FKRB}`; ctx.textAlign = "left";
  ctx.fillText(r.zone, X.zone, y + 28);
  y += ROWH;
}

// 푸터
ctx.fillStyle = "#9aa0a6"; ctx.font = `12px ${FKR}`; ctx.textAlign = "left";
ctx.fillText("출처: Yahoo Finance · Binance · bitcoin-data.com · FRED  |  정보 제공용, 투자 권유 아님", PAD, H - 18);

await mkdir(resolve(ROOT, "posts"), { recursive: true });
await writeFile(resolve(ROOT, "posts", `${dateId}.png`), cv.toBuffer("image/png"));
console.log(`[image] posts/${dateId}.png 생성 (폰트 KR=${hasKR}, KRB=${hasKRB})`);
