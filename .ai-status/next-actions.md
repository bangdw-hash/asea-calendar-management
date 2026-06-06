# 다음 예정 작업 — asea-calendar-management
최종 업데이트: 2026-06-06 10:43 KST | 업데이트 주체: Claude Code

## 즉시 시작 가능 (Codex 순서 3)
- [ ] [CX] `calendar.js` 구현 — `.ai-interfaces/calendar.interface.md` 참조
- [ ] [CX] `drive.js` 구현 — `.ai-interfaces/drive.interface.md` 참조

## calendar.js + drive.js 완료 후 (Codex 순서 4)
- [ ] [CX] `gmail.js` 구현 — drive.js 의존, `.ai-interfaces/gmail.interface.md` 참조
- [ ] [CX] `report.js` 구현 — drive.js + calendar.js 의존, `.ai-interfaces/report.interface.md` 참조

## 전체 Codex 모듈 완료 후 (CC 순서 5)
- [ ] [CC] `app.js` 작성 — 라우터 + 초기화 + 통합
- [ ] [CC] 각 Codex 모듈 코드 리뷰
- [ ] [CC] integration 브랜치 병합
- [ ] [CC] PHASE 4 시뮬레이션 (end-to-end)
- [ ] [CC] main 브랜치 PR 생성

## 참고
- Codex 구현 지시: `CODEX.md`
- 인터페이스 계약: `.ai-interfaces/[module].interface.md`
- 작업 시작 전 `locks.json` 등록 필수
- 완료 후 즉시 `locks.json` 해제 + `WORK_STATUS.md` 갱신
