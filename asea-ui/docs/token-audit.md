# 07. 토큰 점검 (별칭 대응·불일치 현황·통일 기준)

64개 페이지 CSSOM 집계(2026-11-20). 건수는 선언 횟수입니다.

## 1. 모서리 — 6px로 수렴

6px 2,075건 · `var(--r)` 733 · 50% 370 · `--r-md` 197 · `--r-lg` 82 · `--r-full` 70 · `--r-sm` 67 · 4px 62 · 5px 56 · 2px 51 · 3px 35 · `--r-xl` 35.

판단: 변수명이 달라도 값은 6px로 고정됩니다(외관 엔진 `appear-head.js`가 상한 6을 적용). `4px·5px·3px·2px`는 막대·체크 표식 등 **작은 장식**이며 카드·버튼·입력에는 쓰지 않습니다. 통일 기준은 `--ux-r: 6px` 하나입니다.

## 2. 주색 이름 — 5계열

| 계열 | 변수 | 대표 값 | 쓰는 곳(건수) |
|---|---|---|---|
| core | `--color-accent` 외 `--color-*` | `#1A73E8` | survey·style.css·schedule·forum |
| primary | `--primary / --primary-dk / --primary-lt` | `#1A73E8` | 24페이지(amulbo·task·docgate 등) |
| sky | `--primary` | `#0EA5E9` | 설문(aseasurvey*)·budget·award·award-verify |
| 기타 | `--accent`, `--blue`, `--brand` | `#0EA5E9`·`#7c3aed` | assessment(보라 `#7c3aed`) 등 |
| 어두운 | `--color-accent` | `#5AA0FF` | 다크 스테이지 4페이지 |

**불일치**: 같은 '주색'이 `#1A73E8`(구글 블루)과 `#0EA5E9`(스카이)로 갈립니다. `UI-STANDARDS.md`는 스카이를 기준으로 적었으나 survey·schedule·forum은 구글 블루입니다.

**통일안(제안, 결정은 방시원님)**
1. 새 페이지: `--ux-accent`(#1A73E8) + 테마 3종.
2. 스카이 계열(설문·예산·상장)은 설문별 테마(`--primary` 덮어쓰기)가 의도된 설계이므로 유지.
3. 별칭 대응: `--primary = --color-accent = --ux-accent`, `--primary-dk = --color-accent-dk = --ux-accent-dk`, `--primary-lt = --color-accent-lt = --ux-accent-lt`, `--sh = --shadow-sm = --ux-sh`, `--sh-md = --shadow-md = --ux-sh-md`, `--sh-lg = --shadow-overlay = --ux-sh-lg`, `--r = --radius = --r-card = --ux-r`.

## 3. 글꼴

`-apple-system, sans-serif` 385(시스템 기본) · `inherit` 249 · `var(--font)` 76 · `var(--font-family)` 42 · Noto Sans KR 18. 상장 편집기는 한글 글꼴 수십 종(나눔명조·고운돋움·블랙한산스 등)을 사용자 선택용으로 포함합니다. 새 페이지는 키트의 `--ux-font` 하나로 통일합니다.

## 4. 그림자

`--sh` 95 · `--shadow-sm` 70 · `--sh-lg` 60 · `--sh-md` 42 · 하단 시트 `0 -6px 32px rgba(0,0,0,.18)` 35 · 모달 `0 20px 60px rgba(0,0,0,.25)` 16. 포커스 링은 주색 12~15% 3px로 같습니다(색만 `#0EA5E9`/`#1A73E8`/`#3b82f6`로 다름).

## 5. z-index

`9000`(42)·`9999`(41)·`9001`·`9100`이 많고(모달·시트·토스트 계열), 일반 레이어는 1·2·10·20·50·100·200. 최대 `100001`. 서로 다른 페이지 레이어끼리 충돌하지 않지만 새 페이지는 키트 값(100/60/1000/1100)을 쓰고, 기존 플로팅 외관 설정 시트(site-admin.js)와 겹칠 수 있으므로 그 위(≥9000)가 필요한 요소만 별도 지정합니다.

## 6. 전환·애니메이션

가장 많은 값: `0.15s`(97) · `background .15s`(63) · `opacity .25s`(40) · `transform .12s`(36) · `transform .32s cubic-bezier(.22,1,.36,1)`(35). 키트 토큰(.12/.15/.18/.25/.32)은 이 분포의 중심을 따랐습니다. `spin`은 .6~.8s로 흩어져 있어 .8s로 통일했습니다.

## 7. 미디어 쿼리

`max-width:600px` 105 · `prefers-color-scheme: dark` 39 · `min-width:769px` 37 · `max-width:640px` 27 · `prefers-reduced-motion` 15 · `print` 15. 모바일 분기점이 600/640/768/900 등으로 나뉘어 있습니다. 새 페이지는 640 하나만 사용합니다.

## 8. 다크 모드 방식 2종

`html[data-theme="dark"]`(수동) vs `@media (prefers-color-scheme: dark)`(자동 39건). 키트는 수동 속성을 기준으로 하되, 자동 추종이 필요하면 `UX.dark(matchMedia('(prefers-color-scheme: dark)').matches)`를 초기에 호출합니다.

## 9. 옛 문서

`UI-STANDARDS.md`: 반지름 12px, 주색 #0EA5E9, 카드 그림자 등 **현행 코드와 다른 내용**을 담고 있습니다. 삭제하지 않았고, 이 폴더를 현행 기준으로 삼도록 파일 머리에 안내를 추가했습니다.

## 10. 확인 필요 항목

- 정확한 소유자 결정: 새 페이지 기본 주색을 구글 블루/스카이 중 무엇으로 할지.
- `award.html`·`whiteboard.html`·`budget*.html` 내부 화면 중 로그인 뒤 화면은 비밀번호·계정이 필요해 렌더링 측정에서 **로그인 카드 위주**로만 확인했습니다. 해당 내부 값은 CSS 파일 정독(budget-app.css·task.css·aseasurvey*.css·docgate.css·platform.css) 기준이며, 실제 로그인 뒤 렌더링 실측은 하지 않았습니다.
