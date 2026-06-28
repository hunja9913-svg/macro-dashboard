// 매크로 지수 수집 → data/macro.json (오늘 스냅샷) + data/history.json (시계열)
// GitHub Actions(서버)에서 실행되므로 CORS 영향 없음. Node 20+ 전역 fetch 사용.
// range=1y 일별 데이터를 받아 어제/주간/월간 변화와 그래프용 시계열을 한 번에 만든다.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const INDICATORS = [
  { id: "nasdaq", name: "나스닥 종합", symbol: "^IXIC", kind: "index" },
  { id: "sp500", name: "S&P 500", symbol: "^GSPC", kind: "index" },
  { id: "kospi", name: "코스피", symbol: "^KS11", kind: "index" },
  // 코스피200 선물(최근월물). Yahoo엔 무료 선물 심볼이 없어 네이버 금융 API 사용.
  { id: "kospi200f", name: "코스피200 선물", symbol: "FUT", kind: "index", source: "naver-futures" },
  { id: "usdkrw", name: "원/달러 환율", symbol: "KRW=X", kind: "usdkrw" },
  { id: "ust10y", name: "미 국채 10년물 금리", symbol: "^TNX", kind: "yield" },
  { id: "dxy", name: "달러인덱스(DXY)", symbol: "DX-Y.NYB", kind: "dxy" },
  { id: "vix", name: "VIX 변동성지수", symbol: "^VIX", kind: "vix" },
  { id: "wti", name: "국제유가(WTI)", symbol: "CL=F", kind: "oil" },
];

// 지표별 "국면" 판정 — 단순 시세 나열과의 차별점.
function classify(kind, price, changePct) {
  switch (kind) {
    case "index":
      if (changePct >= 1.5) return { zone: "강세", note: "당일 강한 상승 — 위험선호 우세." };
      if (changePct >= 0.2) return { zone: "상승", note: "완만한 상승 흐름." };
      if (changePct > -0.2) return { zone: "보합", note: "방향성 약함, 관망." };
      if (changePct > -1.5) return { zone: "하락", note: "조정 압력." };
      return { zone: "급락", note: "당일 큰 하락 — 위험회피 심리." };
    case "vix":
      if (price < 15) return { zone: "안도(과열 경계)", note: "변동성 낮음 — 시장 안도, 과열 신호일 수 있음." };
      if (price < 20) return { zone: "정상", note: "평균적 변동성." };
      if (price < 30) return { zone: "불안 경계", note: "변동성 확대 — 경계 구간." };
      return { zone: "공포", note: "높은 변동성 — 시장 공포 국면." };
    case "yield":
      if (price < 3.5) return { zone: "완화적", note: "낮은 금리 — 위험자산에 우호." };
      if (price < 4.5) return { zone: "중립", note: "중간 수준 금리." };
      return { zone: "긴축적", note: "높은 금리 — 유동성 긴축, 위험자산 역풍." };
    case "dxy":
      if (price < 100) return { zone: "약달러", note: "달러 약세 — 위험자산·신흥국에 우호." };
      if (price < 105) return { zone: "중립", note: "달러 중립권." };
      return { zone: "강달러", note: "달러 강세 — 위험자산에 역풍." };
    case "usdkrw":
      if (price < 1300) return { zone: "원화 강세", note: "환율 안정 — 외국인 수급 우호." };
      if (price < 1400) return { zone: "중립", note: "평균적 환율 수준." };
      return { zone: "원화 약세", note: "고환율 — 위험회피·자본유출 경계." };
    case "oil":
      if (price < 60) return { zone: "저유가", note: "낮은 유가 — 인플레 완화 우호, 수요 둔화 신호일 수도." };
      if (price < 80) return { zone: "중립", note: "평균적 유가 수준." };
      if (price < 100) return { zone: "고유가", note: "유가 상승 — 인플레·비용 압력." };
      return { zone: "급등", note: "고유가 — 강한 인플레 압력·경기 부담." };
    default:
      return { zone: "-", note: "" };
  }
}

// 정렬된 시계열에서 n 거래일 전 대비 변화율(%)
function pctOverDays(series, n) {
  if (series.length < n + 1) return null;
  const last = series[series.length - 1].close;
  const past = series[series.length - 1 - n].close;
  return past ? Number((((last - past) / past) * 100).toFixed(2)) : null;
}

async function fetchOne(ind) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ind.symbol
  )}?interval=1d&range=1y`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const result = j?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) throw new Error("no meta");

    // 일별 시계열 구성 (유효한 종가만)
    const ts = result.timestamp ?? [];
    const closesRaw = result.indicators?.quote?.[0]?.close ?? [];
    const series = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closesRaw[i];
      if (typeof c === "number") {
        series.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: Number(c.toFixed(2)) });
      }
    }
    if (series.length < 2) throw new Error("series too short");

    // regularMarketPrice가 가장 최신 종가지만, 장 마감 직후엔 Yahoo 일별 시계열(series)이
    // 아직 그 거래일을 반영 못 하는 경우가 있다. 그때 prev=series.at(-2)로 잡으면 하루를
    // 건너뛴 잘못된 등락이 나온다(코스피 -0.7% vs 실제 -5.8% 버그). → regularMarketPrice를
    // 최신점으로 정규화(시계열에 없으면 추가, 당일이면 갱신)한 뒤 마지막 두 점으로 계산.
    const s = series.slice();
    const rmp = meta.regularMarketPrice;
    if (typeof rmp === "number") {
      const fresh = {
        date: meta.regularMarketTime
          ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
          : s.at(-1).date,
        close: Number(rmp.toFixed(2)),
      };
      if (fresh.date > s.at(-1).date) s.push(fresh);
      else if (Math.round(fresh.close * 100) !== Math.round(s.at(-1).close * 100)) s[s.length - 1] = fresh;
    }

    const price = s.at(-1).close;
    const prev = s.at(-2).close;
    const changePct = prev ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0;
    const weekPct = pctOverDays(s, 5); // 약 1주(거래일 5)
    const monthPct = pctOverDays(s, 21); // 약 1개월(거래일 21)
    const { zone, note } = classify(ind.kind, price, changePct);

    return {
      id: ind.id,
      name: ind.name,
      symbol: ind.symbol,
      price,
      changePct,
      weekPct,
      monthPct,
      zone,
      note,
      series: s,
      ok: true,
    };
  } catch (e) {
    console.error(`[fetch] ${ind.id} 실패: ${e.message}`);
    return { id: ind.id, name: ind.name, symbol: ind.symbol, ok: false, error: e.message };
  }
}

// 네이버 금융 코스피200 선물(최근월물) — 일별 종가 시계열.
// 엔드포인트: m.stock.naver.com/api/index/FUT/price (최신→과거 순, 숫자는 콤마 포함 문자열).
// pageSize=60이 안정적(그 이상은 빈 응답), page로 페이징해 ~1년치 확보.
async function fetchNaverFutures(ind) {
  try {
    const num = (s) => Number(String(s).replace(/,/g, ""));
    const raw = [];
    for (let page = 1; page <= 5; page++) {
      const url = `https://m.stock.naver.com/api/index/${encodeURIComponent(
        ind.symbol
      )}/price?pageSize=60&page=${page}`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) break; // 더 이상 데이터 없음
      raw.push(...arr);
    }

    // 과거→최신으로 뒤집고, 날짜 기준 중복 제거(페이지 경계 대비).
    const byDate = new Map();
    for (const d of raw) {
      const close = num(d.closePrice);
      if (d.localTradedAt && Number.isFinite(close)) {
        byDate.set(d.localTradedAt, Number(close.toFixed(2)));
      }
    }
    const series = [...byDate.entries()]
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (series.length < 2) throw new Error("series too short");

    const price = series.at(-1).close;
    const prev = series.at(-2).close;
    const changePct = prev ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0;
    const weekPct = pctOverDays(series, 5);
    const monthPct = pctOverDays(series, 21);
    const { zone, note } = classify(ind.kind, price, changePct);

    return {
      id: ind.id,
      name: ind.name,
      symbol: ind.symbol,
      price,
      changePct,
      weekPct,
      monthPct,
      zone,
      note,
      series,
      ok: true,
    };
  } catch (e) {
    console.error(`[fetch] ${ind.id} 실패: ${e.message}`);
    return { id: ind.id, name: ind.name, symbol: ind.symbol, ok: false, error: e.message };
  }
}

const results = await Promise.all(
  INDICATORS.map((ind) => (ind.source === "naver-futures" ? fetchNaverFutures(ind) : fetchOne(ind)))
);
const updated = new Date().toISOString();

// macro.json: 오늘 스냅샷 (시계열 제외 → 가벼움). 글 생성·요약용.
const macro = {
  updated,
  indicators: results.map(({ series, ...rest }) => rest),
};

// history.json: 그래프용 시계열.
const history = {
  updated,
  indicators: Object.fromEntries(
    results.filter((r) => r.ok).map((r) => [r.id, { name: r.name, series: r.series }])
  ),
};

await mkdir(resolve(ROOT, "data"), { recursive: true });
await writeFile(resolve(ROOT, "data", "macro.json"), JSON.stringify(macro, null, 2), "utf8");
await writeFile(resolve(ROOT, "data", "history.json"), JSON.stringify(history), "utf8");

const okCount = results.filter((r) => r.ok).length;
console.log(`[fetch] 완료: ${okCount}/${results.length} 지표, macro.json + history.json 저장`);
