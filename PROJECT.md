# PROJECT.md — 매크로 + 비트코인 대시보드 (핸드오프 문서)

> 이 문서 하나로 새 세션/다른 AI가 프로젝트를 이어받을 수 있도록 정리한 컨텍스트 문서.
> 최종 업데이트: 2026-06-22

---

## 1. 한 줄 요약

주식·매크로 지수 + 비트코인(가격·온체인)을 **매일 자동 수집**하고, **Gemini 무료 API로 한국어 시황 글을 자동 발행**하는 **0원** 대시보드.
데이터·AI·자동화·호스팅 전부 무료. 목표는 **무자본 organic 트래픽**(매일 쌓이는 SEO 글 + 커뮤니티 공유).

- **라이브 사이트**: https://hunja9913-svg.github.io/macro-dashboard/
- **저장소**: https://github.com/hunja9913-svg/macro-dashboard
- **로컬 경로**: `C:\Users\hunja\macro-dashboard`
- **개발자**: 게임 개발자(연봉 1억), 시간 부족 → 자동화 필수. CMD/PowerShell 익숙하지 않은 편.

---

## 2. 페이지 구성 (전부 상호 링크)

| 파일 | 내용 |
|---|---|
| `index.html` | **매크로 대시보드** — 7개 지수 카드 + 스파크라인 그래프 + 당일/주/월 + 국면. `data/macro.json`·`data/history.json`을 fetch. |
| `btc.html` | **비트코인 대시보드** — 라이브 시세(Binance, 브라우저 직접) + 온체인(자동/수동). `data/btc-onchain.json` 자동 로드. |
| `posts/YYYY-MM-DD.html` | **매일 자동 발행되는 시황 글** (매크로+BTC) |
| `posts/index.html` | 지난 글 목록 (자동 생성) |

---

## 3. 파일 구조

```
macro-dashboard/
├─ index.html              # 매크로 대시보드
├─ btc.html                # BTC 대시보드 (원본 btc-dashboard.html 복사본 + 온체인 자동로드 추가)
├─ scripts/
│   ├─ fetch.mjs           # 매크로 7개 지수 수집(Yahoo) → macro.json + history.json
│   ├─ fetch-onchain.mjs   # BTC 온체인(bitcoin-data) + M2(FRED) + BTC가격(Binance) → btc-onchain.json
│   ├─ generate-post.mjs   # Gemini로 시황 글 작성 → posts/
│   └─ test-key.mjs        # Gemini 키 동작 테스트용
├─ data/                   # (자동 생성/커밋) macro.json, history.json, btc-onchain.json
├─ posts/                  # (자동 생성/커밋) 날짜별 글, index.html, posts.json
├─ .github/workflows/daily.yml  # 매일 자동 실행
├─ .env                    # 로컬 키 (gitignore — 깃허브에 안 올라감)
├─ .gitignore             # node_modules, .env 제외
├─ package.json           # type:module, deps: @google/genai
└─ README.md / PROJECT.md
```

---

## 4. 데이터 소스 (전부 무료)

| 데이터 | 소스 | 키 | 한도/주의 |
|---|---|---|---|
| 매크로 7개 (나스닥·S&P·코스피·원달러·미10년물·DXY·VIX) | Yahoo Finance `query1.finance.yahoo.com/v8/finance/chart` | 불필요 | 비공식 API, range=1y로 시계열+당일/주/월 계산 |
| BTC 온체인 (MVRV·NUPL·Puell) | bitcoin-data.com `/v1/{metric}` | 불필요 | **시간당 10회·하루 15회 제한**(IP별). 전체 시계열 받아 최신값+전일등락 계산 |
| 미국 M2 (YoY) | FRED `api.stlouisfed.org` 시리즈 `M2SL` | **FRED_API_KEY 필요** | 무료. 월간 발표(시차 있음). 진짜 글로벌 M2 아님(미 M2 대용) |
| BTC 가격(24h) | Binance `api/v3/ticker/24hr?symbol=BTCUSDT` | 불필요 | CORS 열림, 한도 없음 |

### bitcoin-data.com 메트릭 매핑 (NUPL 단위 주의!)
- `mvrv-zscore` → 필드 `mvrvZscore` (배율 1)
- `nupl` → 필드 `nupl` (**배율 ×100**: API는 0~1 비율, 대시보드는 % 기대)
- `puell-multiple` → 필드 `puellMultiple` (배율 1)

---

## 5. 자동화 흐름 (GitHub Actions)

`.github/workflows/daily.yml`:
- **스케줄**: `cron: "30 22 * * 1-5"` (평일 22:30 UTC ≈ 한국 07:30) + 수동 실행(workflow_dispatch)
- **단계**: checkout → setup-node@20 → `npm install` → `npm run daily` → 결과 자동 커밋·푸시
- `npm run daily` = `fetch.mjs && fetch-onchain.mjs && generate-post.mjs`
- **권한**: 저장소 Settings에서 "Read and write permissions" 켜둠(자동 커밋 위해 필수)
- **공개 저장소라 Actions 무료 무제한**

> 중요: **로컬에서 push해도 워크플로는 안 돌아간다.** 워크플로는 스케줄 또는 수동 버튼으로만 실행됨.
> 라이브 데이터 갱신을 즉시 보려면 Actions 탭 → daily-macro → Run workflow.

---

## 6. 키/시크릿 (값은 문서에 없음)

키는 **두 군데**에 둠 (같은 값, 다른 장소):
1. **로컬 `.env`** (테스트용, gitignore): `GEMINI_API_KEY=...`, `FRED_API_KEY=...`
2. **GitHub Secret** (자동화용): Settings → Secrets and variables → Actions → `GEMINI_API_KEY`, `FRED_API_KEY`

- **GEMINI_API_KEY**: Google AI Studio(aistudio.google.com)에서 무료 발급. **Gemini Advanced 구독과 무관한 별도 무료 API.** 현재 키는 `AQ.`로 시작(2026.6 새 auth-key 형식 — 정상 작동). 모델 `gemini-2.5-flash`(무료 Flash).
- **FRED_API_KEY**: fredaccount.stlouisfed.org/apikeys 무료 발급. **32자 정확히**(공백 들어가면 400 에러).

---

## 7. 지표 자동/수동 현황

### 매크로 (index.html) — 전부 자동
나스닥·S&P·코스피·원달러·미10년물금리·DXY·VIX (Yahoo)

### 비트코인 (btc.html)
- ✅ **자동(매일)**: MVRV Z-Score, NUPL, Puell Multiple (bitcoin-data) + 미국 M2 (FRED) + BTC가격(Binance). 온체인 3개는 전일 등락도 표시.
- ✅ **자동(브라우저 라이브)**: 가격·펀딩비·OI·200주선 등 (Binance, btc.html이 직접 fetch, 1시간 자동 갱신)
- ✋ **수동 입력**(무료 소스 없음, 대시보드에 `✋수동` 표시): **LTH 공급량, STH-MVRV, 현물 ETF 순유입**
  - 이유: Glassnode/CryptoQuant/Farside **유료 전용**. BGeometrics 무료 목록에 없음(확인됨).
  - 필요 시 사용자가 차트(링크 제공됨) 보고 직접 입력. Farside(farside.co.uk/btc)에서 ETF 확인.

---

## 8. 시황 글 구조 (generate-post.mjs)

- **모델**: Gemini `gemini-2.5-flash` (무료), `responseMimeType: "application/json"`로 JSON 강제
- **출력 JSON**: `{title, tldr, points[3], html}`
- **렌더링**: 💡한줄요약(TL;DR 박스) + 📋한눈에 3줄 + 지표 표(매크로+BTC, 전일등락 포함) + 📈주식·매크로/₿비트코인 두 미니섹션 + 면책
- **분석 방침** (프롬프트에 강제):
  - 데이터에 있는 수치만 사용(지어내기 금지)
  - **뉴스·원인 추측 금지**(AI는 뉴스 모름) → 데이터가 보여주는 **추세 흐름·사이클 위치만** 해석
  - 모든 지표 나열·"전반적으로 ~환경/주시 필요" 같은 **맹탕 마무리 금지** → 가장 눈에 띄는 1~2개에 집중
  - BTC는 MVRV·NUPL·Puell로 사이클 위치(저평가~과열) = 장기 관점
  - 투자권유 아님 면책 명시

---

## 9. 로컬 실행/테스트

```powershell
cd C:\Users\hunja\macro-dashboard
npm install
# 키는 .env 파일에 (notepad .env). 절대 채팅/코드에 키 붙이지 말 것.
node --env-file=.env scripts/fetch.mjs          # 매크로 수집
node --env-file=.env scripts/fetch-onchain.mjs  # 온체인+M2+BTC가격
node --env-file=.env scripts/generate-post.mjs  # 글 생성
# 대시보드 미리보기: file:// 직접 열면 CORS로 JSON 로딩 막힘 → 로컬 서버 필요
npx serve   # 또는 간단한 http 서버 띄우고 localhost로 접속
```

---

## 10. 알려진 제약·주의사항 (gotchas)

1. **bitcoin-data.com 10회/시간 한도**: 개발 중 테스트로 자주 429 뜸. **GitHub 서버는 IP가 달라 보통 안 걸림.** 코드에 폴백 있음(429 시 기존값 유지 → 대시보드 안 깨짐). 로컬 확인 막히면 워크플로 수동 실행으로 검증.
2. **NUPL 단위**: bitcoin-data는 0~1 비율, 대시보드는 % → fetch-onchain에서 ×100.
3. **글로벌 M2 ≠ 미국 M2**: 진짜 글로벌은 환율 합산 필요해 무료 불가. 미 M2(M2SL)로 대용. 라벨도 "미국 M2"로 표기.
4. **Yahoo 당일 등락**: `chartPreviousClose`(범위 시작 종가)가 아니라 일별 시계열의 전일 종가로 계산해야 정확(과거에 코스피 +11% 버그 났던 부분).
5. **file:// CORS**: 대시보드를 파일 더블클릭으로 열면 data/*.json fetch가 막혀 빈 화면. 로컬은 http 서버, 배포는 GitHub Pages(http)면 정상.
6. **CMD vs PowerShell**: `$env:VAR=...`는 PowerShell 전용. CMD에서 치면 "구문이 잘못되었습니다" 에러. → `.env` 파일 + `node --env-file` 방식이 쉘 무관하게 안전.
7. **FRED 키 공백**: 32자여야 함. 복사 시 공백 들어가면 HTTP 400.

---

## 11. Git 운영 흐름

```powershell
git -C C:\Users\hunja\macro-dashboard add -A
git -C C:\Users\hunja\macro-dashboard commit -m "..."
# 워크플로가 자동 커밋을 올려서 원격이 앞서있는 경우가 많음 → pull 먼저
git -C C:\Users\hunja\macro-dashboard pull -X theirs --no-edit   # 데이터 충돌은 원격(최신 자동생성) 우선
git -C C:\Users\hunja\macro-dashboard push
```
- LF→CRLF 경고는 무해(Windows). git이 stderr로 정상 출력하는 메시지를 PowerShell이 빨간색으로 보여주는 것도 정상(성공 여부는 `main -> main` 줄로 판단).
- 커밋 author가 `hunja8282`로 나올 수 있음(전역 git 설정). 저장소 주인은 `hunja9913-svg`. push 인증은 저장소 주인 계정으로.

---

## 12. 남은 작업(TODO) / 다음 아이디어

- [ ] **차트 PNG 자동 생성** — 네이버 블로그 복붙용 이미지(네이버는 외부 JS/iframe 차단 → 이미지로). 글에 박으면 "근거 시각화". (`@napi-rs/canvas` 등으로 서버 렌더)
- [ ] **매크로 지표 확장** — 금·유가·하이일드 스프레드 등 (`fetch.mjs`의 `INDICATORS`에 추가)
- [ ] **BTC 온체인 그래프** — bitcoin-data 전체 시계열을 history로 저장해 대시보드에 선그래프
- [ ] **커뮤니티 공유** ← 트래픽의 진짜 관건. 기술 아니라 마케팅. 디시·클리앙·레딧 등에 "BTC+매크로 한눈에" 공유 + 매일 SEO 글 누적.

> 핵심 인식: "만들면 저절로 사람이 오진 않는다." 기술 구축은 끝났고, **유입은 공유/누적이 실제 과제.**

---

## 13. 사용자 작업 스타일 메모 (협업 시 참고)

- **팩트 기반·무동조**를 원함. 공감·맞장구보다 검증된 사실과 최적 해결책. 틀린 전제는 정정해주길 원함.
- 불확실하면 추측 말고 검증(웹검색/실제 호출) 후 출처 제시.
- 키 등 민감정보는 채팅에 붙이지 않도록 유도(.env/Secret 사용).
```
