# asea-ui

ASEA(아세아항공직업전문학교) 페이지 공용 **UI·UX·CSS 키트**. Claude Code·Codex·Lovable 어디서든 같은 모양으로 새 페이지를 만들기 위한 단일 원천입니다. 기준 화면은 `survey.html`(2026-11-20 실측). 버전은 `CHANGELOG.md`를 따릅니다.

```
asea-ui/
├─ css/   tokens.json · ui-kit.css          값(색·간격·모션)과 스타일
├─ ux/    ui-kit.js · interaction-motion.md  동작(토스트·모달·저장·책갈피·드래그)과 규칙
├─ ui/    gallery.html · components.md · data-display.md · page-patterns.md  컴포넌트·표·그래프·페이지 뼈대
├─ docs/  foundations.md · page-inventory.md · token-audit.md   기초·64개 페이지 실측·불일치 점검
├─ skill/ SKILL.md                           Claude 스킬
├─ tools/ check.js                           규칙 위반 검사
└─ AGENTS.md · CLAUDE.md · llms.txt · CHANGELOG.md
```

## 사용

```html
<link rel="stylesheet" href="asea-ui/css/ui-kit.css">
<body class="ux"> ... <script src="asea-ui/ux/ui-kit.js"></script>
```

1. `ui/gallery.html`을 브라우저로 열어 동작을 확인하고 마크업을 복사합니다.
2. 새 페이지는 `ui/page-patterns.md`에서 뼈대를 고릅니다.
3. 작성 후 `node tools/check.js <페이지.html 또는 폴더>`로 규칙 위반을 검사합니다.

## 버전 규칙 (SemVer, git 태그 `vX.Y.Z`)

- 패치: 오타·값 보정 / 마이너: 컴포넌트 추가(기존 페이지 영향 없음) / 메이저: 클래스·색 이름 변경(기존 페이지가 깨질 수 있음)
- 프로젝트는 쓰는 버전을 파일 머리 주석(`/* asea-ui v1.0.0 */`)과 `CLAUDE.md`에 적습니다.
- 로컬에는 저장소 전체(이력 포함)를 두고, `git checkout v1.0.0`으로 버전을 고정합니다. 각 프로젝트에는 쓰는 버전의 파일만 복사합니다.
- 저장 위치는 OneDrive 밖(`C:\Dev\ASEA\asea-ui`)을 권장합니다(`.git` 동기화 충돌 방지).

## 재측정 방법

1. 저장소 루트에서 `python3 -m http.server 8099`
2. Playwright(chromium)로 페이지를 열어 `document.styleSheets`·`getComputedStyle` 수집
3. 결과로 `docs/page-inventory.md`, `css/tokens.json` 갱신

## 한계 (확인 필요)

- 로그인 뒤 내부 화면(예산 입력·상장 편집기 등)은 CSS 정독 기준이며 렌더링 실측은 하지 않았습니다.
- 새 페이지 기본 주색(구글 블루 #1A73E8 / 스카이 #0EA5E9)은 미결정이며 현재 키트 기본은 #1A73E8입니다(`docs/token-audit.md` 2절).
- 책갈피는 기준안(`UX.bookmarks`, localStorage)이며 기존 페이지에 구현된 것은 없습니다.
