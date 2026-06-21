# 오늘의 매크로 대시보드

BTC + 매크로 지수(나스닥·S&P·코스피·환율·금리·DXY·VIX)를 한눈에 보고,
**매일 자동으로 한국어 매크로 시황 글이 발행**되는 무료 프로젝트.

전부 무료: 데이터(Yahoo Finance) · 자동화(GitHub Actions) · 호스팅(GitHub Pages) · AI(Gemini 무료 API).

---

## 구성

```
macro-dashboard/
├─ scripts/
│   ├─ fetch.mjs          # 지수 수집 → data/macro.json
│   └─ generate-post.mjs  # Gemini로 한국어 시황 글 작성 → posts/
├─ data/macro.json        # (자동 생성) 최신 지표 + 국면
├─ posts/                 # (자동 생성) 날짜별 글 + 목록
├─ .github/workflows/daily.yml  # 매일 자동 실행
├─ index.html             # 대시보드 (BTC 대시보드 + 매크로 섹션) ← 추후 통합
└─ package.json
```

데이터 흐름:
```
[매일 22:30 UTC, 깃허브 임시 서버]
 fetch.mjs  → Yahoo에서 7개 지수 수집 → data/macro.json
 generate-post.mjs → Gemini가 시황 글 작성 → posts/YYYY-MM-DD.html
 → 자동 커밋 → GitHub Pages로 발행
```

---

## 처음 세팅 (한 번만)

### 1. Gemini 무료 API 키 발급

- https://aistudio.google.com → "Get API key" → 키 생성 (무료)
- ⚠️ 이건 Gemini Advanced **구독과 무관한 별도 무료 API**입니다.
- 무료 한도: Flash 모델 하루 1,500회 (하루 1글이라 차고 넘침).

### 2. 로컬 테스트

```powershell
npm install
$env:GEMINI_API_KEY = "발급받은_키"
npm run daily
```

성공하면 `data/macro.json` 과 `posts/<오늘날짜>.html` 이 생깁니다.
브라우저로 그 html을 열어 글이 잘 나오는지 확인.

### 3. GitHub 저장소 + 자동화

```powershell
git init
git add .
git commit -m "init: 매크로 대시보드"
# GitHub에서 새 저장소(public) 만든 뒤:
git remote add origin https://github.com/<사용자명>/macro-dashboard.git
git push -u origin main
```

- 저장소 **Settings → Secrets and variables → Actions → New repository secret**
  - 이름: `GEMINI_API_KEY` / 값: 발급받은 키
- **Settings → Pages**: Source를 `main` 브랜치 / `/ (root)` 로 설정 → 사이트 주소 생성
- **Actions 탭 → daily-macro → Run workflow** 로 수동 한 번 돌려 확인

이후 매일 자동 실행됩니다. (public 저장소면 Actions 무료 무제한)

---

## 모델 변경

`GEMINI_MODEL` 환경변수로 모델 교체 가능 (기본 `gemini-2.5-flash`).
무료 티어에서 쓸 수 있는 현재 Flash 모델명은 AI Studio에서 확인하세요.

## 다음 할 일 (TODO)

- [ ] 기존 BTC 대시보드(`btc-dashboard.html`)를 `index.html`로 옮기고 매크로 섹션 추가
      (`data/macro.json`을 fetch해서 표시)
- [ ] 커뮤니티 공유로 초기 유입 만들기
- [ ] 지표 확장(금·유가·글로벌 M2 등)은 `fetch.mjs`의 `INDICATORS`에 추가
