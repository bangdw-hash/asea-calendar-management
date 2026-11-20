# CLAUDE.md

이 저장소는 ASEA 공용 UI 키트다. 규칙은 `AGENTS.md`와 동일하며 그 파일이 원본이다. 먼저 읽는다.

- 값의 단일 원천: `css/tokens.json` (바꾸면 `css/ui-kit.css`의 `:root`도 맞춘다)
- 변경 시: `CHANGELOG.md`에 버전 항목 추가 → `ui/gallery.html`로 확인 → `node tools/check.js .` 통과 → git 태그 `vX.Y.Z`
- 클래스 이름(`ux-*`)은 호환성 때문에 바꾸지 않는다(바꾸면 메이저 버전).
- 다른 프로젝트에서 쓸 때는 그 프로젝트 `CLAUDE.md`에 아래를 추가한다:

```
UI는 asea-ui(vX.Y.Z)를 따른다. 경로: <asea-ui 위치>. AGENTS.md 규칙과 ui/gallery.html 마크업을 사용하고,
작업 후 node <asea-ui>/tools/check.js <변경 파일>을 실행한다.
```
