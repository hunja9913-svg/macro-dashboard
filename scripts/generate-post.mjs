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

const system = [
  "너는 한국 개인 투자자를 위한 매크로 시황 블로그 필자다.",
  "주어진 '지표 데이터(당일·주간·월간 변화 포함)'만 근거로 작성한다. 데이터에 없는 수치를 지어내지 마라.",
  "중요: 시장이 움직인 '원인·이유(뉴스/이벤트)'를 추측하지 마라. 너는 뉴스를 모른다. 오직 데이터가 보여주는 '추세 흐름'만 해석한다.",
  "추세 분석 = 주간·월간 방향(상승/하락/횡보)과 강도, 당일 움직임이 추세와 같은지 다른지(숨고르기/전환 조짐), 지표 간 동조/괴리.",
  "특정 종목 매수/매도를 권유하지 않는다. 투자 판단은 독자 몫임을 글 말미에 한 줄로 명시한다.",
  "과장·단정 금지. '~로 보인다, ~흐름, ~가능성' 등 신중한 표현. 분량은 한국어 600~900자.",
].join(" ");

const prompt = `오늘은 ${dateKr}.
아래는 자동 수집된 주요 매크로 지표와 당일·주간·월간 변화, 국면 판정이다.

[지표 데이터]
${lines}

위 데이터를 종합해 '오늘의 매크로 추세 시황' 블로그 글을 작성하라.
- 각 지표의 주간·월간 추세 방향과 강도를 읽고, 당일 움직임이 그 추세와 같은 방향인지/되돌림인지 해석.
- 위험자산(나스닥·S&P·코스피)과 매크로(달러·금리·VIX)의 추세가 서로 동조하는지 괴리하는지 짚을 것.
- 원인·이유는 쓰지 말고, "데이터상 추세는 ~로 보인다" 식의 흐름 해석에 집중.
- 다음 JSON 형식으로만 응답: {"title": "...", "html": "..."}
  - title: 날짜와 핵심을 담은 매력적인 한글 제목 (예: "${dateKr} 매크로: 나스닥 강세 속 강달러, 위험자산 우호?")
  - html: <p>, <ul>, <li>, <strong> 정도만 쓴 본문 HTML (스크립트/스타일 금지).`;

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

let title, bodyHtml;
try {
  const parsed = JSON.parse(res.text);
  title = parsed.title;
  bodyHtml = parsed.html;
  if (!title || !bodyHtml) throw new Error("title/html 누락");
} catch (e) {
  console.error("[post] Gemini 응답 파싱 실패:", e.message);
  console.error(res.text?.slice(0, 500));
  process.exit(1);
}

// 지표 요약 표 (글 상단에 데이터 출처로 첨부)
const tableRows = macro.indicators
  .filter((i) => i.ok)
  .map(
    (i) =>
      `<tr><td>${i.name}</td><td>${i.price}</td><td>${i.changePct >= 0 ? "+" : ""}${i.changePct}%</td><td>${i.zone}</td></tr>`
  )
  .join("");

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
 a{color:#2a6}
</style></head><body>
<p class="date">${dateKr} · 오늘의 매크로</p>
<h1>${title}</h1>
<table><thead><tr><th>지표</th><th>값</th><th>등락</th><th>국면</th></tr></thead><tbody>${tableRows}</tbody></table>
${bodyHtml}
<p class="disc">본 글은 자동 수집 데이터 기반 정보 제공이며, 특정 종목의 매수·매도 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다. 데이터 출처: Yahoo Finance.</p>
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
