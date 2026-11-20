---
name: asea-ui
description: ASEA 새 페이지·화면·컴포넌트를 만들거나 수정할 때 사용. 버튼·표·그래프·모달·저장 표시·책갈피·테마·페이지 뼈대를 survey.html 기준 공용 키트(asea-ui)로 일관되게 만든다. 트리거 — "새 페이지", "화면 설계", "UI 만들어", "디자인 맞춰", "survey.html처럼".
---

# asea-ui 사용 절차

1. 키트 위치를 확인한다(프로젝트 `CLAUDE.md`의 asea-ui 경로). 없으면 사용자에게 묻는다.
2. `AGENTS.md`를 읽고 금지·필수 규칙을 따른다.
3. 페이지 종류에 맞는 뼈대를 `ui/page-patterns.md`에서 고르고, 컴포넌트는 `ui/gallery.html` 마크업을 복사한다.
4. `css/ui-kit.css`·`ux/ui-kit.js`를 연결하고 `<body class="ux">`로 작성한다. 값은 `--ux-*` 변수만 쓴다.
5. 저장 표시·되돌리기 토스트·포커스 링·640px 모바일을 확인한다.
6. `node <asea-ui>/tools/check.js <변경 파일>`을 실행해 위반을 고친다.
7. 결과 보고에 사용한 asea-ui 버전(`CHANGELOG.md` 최신)을 적는다.

주의: 모서리 6px 초과·이모지·임의 색 금지. 키트에 없는 컴포넌트는 새로 만들지 말고 가장 가까운 것을 조합한 뒤 사용자에게 추가 여부를 묻는다.
