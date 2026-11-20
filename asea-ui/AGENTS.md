# AGENTS.md — asea-ui 사용 규칙 (Codex·범용 에이전트)

새 페이지·화면을 만들 때 **반드시** 이 키트를 쓴다. 새로 디자인하지 않는다.

## 순서
1. `css/ui-kit.css`, `ux/ui-kit.js`를 연결하고 `<body class="ux">`로 시작한다.
2. 컴포넌트는 `ui/gallery.html`의 마크업을 복사한다. 설명은 `ui/components.md`, `ui/data-display.md`.
3. 페이지 뼈대는 `ui/page-patterns.md`에서 고른다. 동작 규칙은 `ux/interaction-motion.md`.
4. 값은 `css/tokens.json`/CSS 변수(`--ux-*`)만 쓴다. 임의 색·크기를 만들지 않는다.
5. 끝나면 `node tools/check.js <경로>`를 실행하고 위반을 고친다.

## 금지
- 모서리 6px 초과(`border-radius`는 `var(--ux-r)` 또는 6px, 원형만 50%), 알약 모양
- 이모지(UI 문구·버튼·아이콘 모두). 아이콘은 인라인 SVG(`stroke="currentColor"`, 굵기 2)
- 토큰에 없는 임의 색 하드코딩, `outline:none`으로 포커스 제거
- 숫자 열 왼쪽 정렬(표 숫자는 오른쪽 + `tabular-nums`)
- 확인 없는 영구 삭제(삭제는 되돌리기 토스트가 기본)

## 필수
- 저장은 자동 저장 + 상태 표시(`UX.autosave`) 또는 하단 작업 바의 저장 버튼
- 결과·집계 화면은 엑셀·PDF·인쇄 버튼 제공
- 모바일 640px에서 버튼 44px, 가로 스크롤 방지
- 모든 값은 한국어 UI, 금액은 만원/천원 단위

## 버전
키트 버전은 `CHANGELOG.md` 최신 항목. 프로젝트 파일 머리에 `/* asea-ui vX.Y.Z */`를 남긴다.
