# ASEA Calendar Management — UI / CSS 기준서

> 이 문서는 모든 HTML 페이지에 적용되는 디자인 토큰·컴포넌트 규칙·작업 원칙을 정의합니다.  
> 새 페이지 또는 기능을 추가할 때 반드시 이 기준을 따릅니다.

---

## 1. 색상 토큰 (Color Tokens)

### 1-1. 테마 색상 — 스카이 블루 (전 페이지 통일 기준)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-accent` | `#0EA5E9` | 주요 CTA 버튼, 링크, 활성 상태 |
| `--color-accent-hover` / `--color-accent-dk` | `#0284C7` | 호버, 누름 상태 |
| `--color-accent-light` / `--color-accent-lt` | `#E0F2FE` | 배경 강조, secondary 버튼 배경 |
| `--color-bg` | `#F0F9FF` | 페이지 기본 배경 |
| `--color-card` | `#FFFFFF` | 카드·패널 배경 |
| `--color-border` | `#E8EAED` | 일반 테두리 |

> **스카이 블루 RGBA 표기:** `rgba(14, 165, 233, …)`  
> 포커스 링 표준: `box-shadow: 0 0 0 3px rgba(14,165,233,.15)`

### 1-2. 의미 색상 (Semantic Colors)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-success` | `#34A853` | 성공, 완료 상태 |
| `--color-success-light` | `#E6F4EA` | 성공 배경 |
| `--color-warning` | `#FBBC05` | 경고 |
| `--color-warning-light` | `#FEF7E0` | 경고 배경 |
| `--color-error` | `#EA4335` | 오류, 삭제 |
| `--color-error-light` | `#FCE8E6` | 오류 배경 |

### 1-3. 텍스트 색상

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-text` | `#202124` | 본문 |
| `--color-text-secondary` | `#5F6368` | 부가 설명, 레이블 |

### 1-4. 부서 색상 (schedule.html / index.html)

| 부서 | 값 |
|------|----|
| 기획처 | `#4285F4` |
| 교학처 | `#34A853` |
| 행정처 | `#FBBC05` |
| 기타 | `#EA4335` |

> 부서 색상은 테마 교체 대상에서 제외합니다.

---

## 2. 타이포그래피

```css
--font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-xs:   11px;
--font-sm:   12px;
--font-base: 14px;   /* 본문 기본 */
--font-md:   15px;
--font-lg:   16px;
--font-xl:   18px;
--font-2xl:  22px;
```

---

## 3. 간격 (Spacing)

```css
--sp-1:  4px;
--sp-2:  8px;
--sp-3: 12px;
--sp-4: 16px;
--sp-5: 20px;
--sp-6: 24px;
--sp-8: 32px;
```

---

## 4. 모서리 반경 (Border Radius)

- **전 페이지 통일값:** `12px` (`--r: 12px`, `--r-sm/md/lg/xl/full` 모두 12px)
- **pill 형태 (완전 원형) 금지** — 모든 버튼·배지·카드는 `12px` 고정
- 예외: 아바타·로딩 스피너 등 정원형 UI는 `border-radius: 50%` 허용

---

## 5. 그림자 (Shadow)

```css
--shadow-sm:      0 1px 3px rgba(60,64,67,.08), 0 1px 2px rgba(60,64,67,.06);
--shadow-md:      0 2px 8px rgba(60,64,67,.12), 0 2px 4px rgba(60,64,67,.08);
--shadow-lg:      0 8px 24px rgba(60,64,67,.14), 0 4px 8px rgba(60,64,67,.10);
--shadow-overlay: 0 12px 40px rgba(60,64,67,.22);
```

---

## 6. 버튼 클래스

| 클래스 | 배경 | 텍스트 | 용도 |
|--------|------|--------|------|
| `.btn-primary` | `--color-accent` | `#fff` | 주 CTA |
| `.btn-secondary` | `--color-accent-light` | `--color-accent` | 보조 액션 |
| `.btn-success` | `--color-success` | `#fff` | 완료·저장 |
| `.btn-danger` | `--color-error` | `#fff` | 삭제·취소 |
| `.btn-ghost` | `transparent` | `--color-text-secondary` | 텍스트 버튼 |
| `.btn-sm` | — | — | 작은 버튼 (padding 축소) |

모든 버튼은 `border-radius: 12px`, `font-weight: 500` 이상.

---

## 7. 아이콘 규칙

- **인라인 SVG만 사용** — 이모지 아이콘 사용 금지
- 아이콘 크기: `18px × 18px` (표준), `22px` (헤더 액션)
- `color: currentColor` 사용으로 테마 색상 자동 상속

---

## 8. 페이지별 CSS 사용 규칙

| 페이지 | 사용 CSS |
|--------|---------|
| `index.html` (메인 캘린더) | `style.css` |
| `schedule.html` | 인라인 `<style>` (CSS 변수 동기화) |
| `forum.html` | 인라인 `<style>` + `--primary` 변수 체계 |
| `survey.html` | 인라인 `<style>` (sky 기본 테마) |
| `checkin.html` | `checkin.css` |
| `dormitory/*.html` | `dormitory.css` |
| `facility-request.html` | `facility-request.css` |
| `reservation.html` | 인라인 `<style>` |
| `parking.html` / `park.html` | 인라인 `<style>` |

---

## 9. 레이아웃 구조 (앱 계층)

```
.app
  ├── .app-header (height: 56px, sticky)
  ├── .tab-nav    (height: 48px, scroll)
  └── .tab-content
        └── .tab-panel (scroll-y)
              └── .tab-body (max-width: 1100px, margin: auto)
```

모바일 기준: `@media (max-width: 600px)`에서 헤더·탭 높이 52px로 축소.

---

## 10. 폼 요소 (Form Elements)

- 포커스 상태: `border-color: var(--color-accent)` + `box-shadow: 0 0 0 3px rgba(14,165,233,.15)`
- `border-radius: 12px` 통일
- placeholder 색상: `#adb5bd`

---

## 11. 작업 규칙 (Coding Rules)

1. **하드코딩 금지:** 색상·간격은 반드시 CSS 변수 사용 (`var(--color-accent)` 등)
2. **새 페이지 추가 시:** `:root` 변수 블록을 위 색상 토큰과 동일하게 선언
3. **스카이 블루 hex 참조:**
   - 메인: `#0EA5E9`
   - 다크: `#0284C7`
   - 라이트: `#E0F2FE`
   - 배경: `#F0F9FF`
   - RGBA: `rgba(14,165,233, …)`
4. **테마 토큰 변수명 통일:**
   - `style.css` 기반 페이지: `--color-accent`, `--color-accent-hover`, `--color-accent-light`, `--color-bg`
   - standalone 페이지: `--primary`, `--primary-dk`, `--primary-lt` (forum.html 패턴)
5. **부서 색상(`#4285F4` 등)은 교체 대상 아님**
6. **border-radius는 12px 고정** (pill 금지)
7. **이모지 아이콘 금지** (인라인 SVG만)

---

## 12. 색상 교체 이력

| 날짜 | 변경 내용 |
|------|---------|
| 2026-09-13 | 전 페이지 테마 Google 블루(`#1A73E8`) → 스카이 블루(`#0EA5E9`) 통일 |
| 2026-09-13 | 배경색 `#F8F9FB` → `#F0F9FF` (스카이 50 틴트) 전환 |
| 2026-09-13 | `rgba(26,115,232,…)` → `rgba(14,165,233,…)` 전환 |
