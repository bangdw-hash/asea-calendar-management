# 작업 현황 — ASEA Calendar Management
최종 업데이트: 2026-06-06 11:30 KST | 업데이트 주체: Claude Code

---

## 현재 단계: PHASE 4 — SIMULATE (4 / 6)

> PHASE 3 BUILD 완료. 전체 모듈 구현 완료. 시뮬레이션 단계 시작.

| 모듈 | 담당 | 상태 | 완료 |
|------|------|------|------|
| `config.js` | Claude Code | ✅ 완료 | 06-06 |
| `index.html` | Claude Code | ✅ 완료 | 06-06 |
| `style.css` | Claude Code | ✅ 완료 | 06-06 |
| `auth.js` | Claude Code | ✅ 완료 | 06-06 |
| `calendar.js` | Claude Code (대행) | ✅ 완료 | 06-06 |
| `drive.js` | Claude Code (대행) | ✅ 완료 | 06-06 |
| `gmail.js` | Claude Code (대행) | ✅ 완료 | 06-06 |
| `report.js` | Claude Code (대행) | ✅ 완료 | 06-06 |
| `app.js` | Claude Code | ✅ 완료 | 06-06 |

---

## 다음 단계: 시뮬레이션 체크리스트

```
공통 (전 모듈):
□ 브라우저 콘솔 오류 없음
□ window.Auth / window.CalendarModule / window.DriveModule / window.GmailModule / window.ReportModule 노출 확인
□ Auth.getToken() === null 시 각 모듈 오류 처리 확인
□ 빈 배열/null 응답 처리 확인

calendar.js:
□ 이벤트 생성 → 목록 확인
□ 중복 감지 로직 동작 확인

drive.js:
□ 파일명 연도·주차 파싱 확인
□ 빈 폴더 처리 확인

gmail.js:
□ 수신자 없을 때 발송 차단 확인
□ 한글 제목 인코딩 확인

report.js:
□ 카카오 문구 생성 패턴 확인
□ 클립보드 복사 후 토스트 표시 확인

app.js (통합):
□ 탭 전환 시 각 모듈 정상 초기화
□ 로그인 → 로그아웃 → 재로그인 사이클
□ 모바일 375px 레이아웃 확인
□ 이벤트 CRUD 전체 플로우
```

---

## 배포 전 필수 작업

1. **Google Cloud Console** → OAuth 2.0 클라이언트 ID 발급 후 `config.js`의 `YOUR_GOOGLE_CLIENT_ID` 교체
2. **Google Drive** → 보고서 폴더 ID 확인 후 `YOUR_FOLDER_ID` 교체 또는 앱 설정 탭에서 입력
3. **OAuth 동의 화면** → 테스트 사용자에 `bangdw@gmail.com` 추가
4. **Authorized redirect URIs** → GitHub Pages URL 등록

---

## 승인란

```
## 승인
[ ] PHASE 1-3 완료 확인 — PHASE 4 시뮬레이션 진행 승인
날짜:
승인자:
특이사항:
```

---

*기반 프로토콜: CLAUDE-CODEX-PROTOCOL v1.0*
