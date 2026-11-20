# ASEA 디자인 총집합 (Design System Compendium)

기준일 2026-11-20 · 기준 화면 `survey.html`(교강사 평가 — AI 설문 생성·편집기) · 범위 저장소 HTML 64개 + 설문 관리자(설계·결과·분석) 내부 화면

새 페이지를 만들 때 이 폴더를 **복사해서 바로 쓰는 오픈소스 키트**로 사용합니다. 문서는 설명이고, 실제 재사용 단위는 아래 세 파일입니다.

| 파일 | 용도 |
|---|---|
| `ui-kit.css` | 토큰·버튼·입력·카드·표·그래프·탭·모달·토스트·편집 카드 등 전체 스타일(접두사 `ux-`, 기존 CSS와 충돌 없음) |
| `ui-kit.js` | 동작: 토스트·되돌리기·모달·서랍·확인창·탭(기억)·접기(기억)·아코디언·테마·다크·글자 배율·자동 저장 표시·책갈피·드래그 정렬·복사·처리중 버튼 |
| `gallery.html` | 위 전부를 실제로 보여 주는 견본. 파일을 열어 동작을 확인하고 마크업을 복사합니다 |
| `tokens.json` | 모든 토큰(색·테마·그림자·글자·간격·모션·z-index)의 기계 판독본 |

## 문서 구성

| 문서 | 내용 |
|---|---|
| `01-foundations.md` | 색·테마·다크·글자·간격·모서리·그림자·모션·z-index·반응형·접근성 |
| `02-components.md` | 헤더·버튼·입력·선택지·칩·알림·탭·단계·카드·편집 카드·로그인 카드 등 컴포넌트별 마크업·상태·동작 |
| `03-data-display.md` | 표·KPI·막대·누적·히스토그램·도넛·산점도·히트맵·분포·결과 도구 모음(엑셀·PDF·인쇄) |
| `04-interaction-motion.md` | 버튼·카드·행의 움직임, 저장(자동 저장·저장 상태), 책갈피, 되돌리기, 드래그, 접기, 모달·토스트, 키보드 |
| `05-page-patterns.md` | 상단 영역 실측 분류 7종(흰 헤더·주색 헤더·그라데이션·네이비 막대·짙은 남색·다크 스테이지·앱형)과 적용법, 설문 관리자 하위 화면 |
| `06-page-inventory.md` | 64개 페이지별 실측 표(주색·CSS 구성·규칙 수·키프레임·z-index) |
| `07-token-audit.md` | 페이지마다 다른 토큰 이름·값 불일치 현황과 통일 기준(별칭 대응표) |

## 3분 사용법

```html
<link rel="stylesheet" href="docs/design-system/ui-kit.css">
<body class="ux">
  <header class="ux-header"><span class="logo">제목</span></header>
  <main class="ux-main">
    <h2 class="ux-title">섹션 제목</h2>
    <div class="ux-card"> ... </div>
  </main>
  <script src="docs/design-system/ui-kit.js"></script>
  <script>UX.restore(); UX.toast('준비되었습니다');</script>
</body>
```

## 핵심 원칙 (survey.html에서 뽑은 것)

1. 모서리 **6px 고정**, 원형만 50%. 알약 모양 금지. 새 CSS에 6px 초과 반지름을 넣지 않습니다.
2. 이모지 금지, **인라인 SVG만** 사용(`stroke="currentColor"`, 굵기 2, 둥근 끝).
3. 색은 **주색 1개 + 의미색(초록·주황·빨강)** 만. 주색은 테마 3종(sky·aurora·mint)으로 교체되고 호버용 진한 색·연한 배경이 짝으로 따라옵니다.
4. 모든 상호작용은 **.12~.32초**. 눌림은 `translateY(1px)` 또는 `scale(.97)`. 호버는 배경·테두리 색 전환이 기본입니다.
5. 포커스는 **테두리 색 + 3px 링(주색 15%)**, 키보드 포커스는 2px 아웃라인. 절대 제거하지 않습니다.
6. 숫자는 `font-variant-numeric: tabular-nums`, 표 숫자 열은 오른쪽 정렬.
7. 저장은 **자동 저장 + 상태 표시(저장 중/저장됨/실패)**, 삭제는 **되돌리기 토스트**가 기본입니다.

## 검증 이력

- `gallery.html`을 Playwright로 열어 6개 탭 전환·모달 열기/ESC 닫기·토스트·접기·책갈피·테마 교체·버튼 실측(배경색·6px·37px·600)을 확인했습니다. 콘솔 오류 0건.
- 값은 `survey.html`을 실제로 렌더링해 computed style로 측정한 것이며 추정값은 포함하지 않았습니다. 확인하지 못한 항목은 각 문서에 '확인 필요'로 표시했습니다.

## 재측정 방법

1. 저장소 루트에서 `python3 -m http.server 8099` 실행
2. Playwright(chromium)로 페이지를 열어 `document.styleSheets`와 `getComputedStyle`을 수집
3. 결과를 `06-page-inventory.md` 형식으로 갱신

## 주의

- 기존 `UI-STANDARDS.md`는 반지름 12px·주색 #0EA5E9 등 **현재 코드와 다른 옛 기준**입니다. 이 폴더가 현행 기준입니다(상세 `07-token-audit.md`).
- 기존 페이지 CSS(`style.css`, `aseasurvey.css` 등)는 이 키트로 교체하지 않았습니다. 새 페이지부터 적용하고, 기존 페이지는 필요할 때 점진적으로 옮깁니다.
