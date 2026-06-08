# 작업 현황 — ASEA Calendar Management
최종 업데이트: 2026-06-06 KST (신규 기능 추가) | 업데이트 주체: Claude Code

---

## 현재 단계: PHASE 8 완료 ✅ — 대규모 기능 확장

### 추가된 기능 (커밋 `4b49794`)

| 기능 | 파일 | 상태 |
|------|------|------|
| 공유 캘린더 URL 등록 (설정 탭) | config.js, index.html, app.js | ✅ |
| 일정 추가 시 대상 캘린더 선택 | index.html, app.js | ✅ |
| CSV 일괄 등록 (드롭존, 미리보기, 등록) | index.html, style.css, app.js | ✅ |
| 공유 캘린더 이벤트 캘린더 통합 표시 | app.js | ✅ |

---

## 현재 단계: PHASE 6 완료 ✅ (6 / 6)

> PHASE 4 시뮬레이션(정적 코드 분석 + 버그 수정) → PHASE 5 통합 → PHASE 6 배포 완료.

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

## PHASE 4 시뮬레이션 결과 (정적 코드 분석)

### 수정된 버그

| # | 파일 | 위치 | 문제 | 수정 |
|---|------|------|------|------|
| 1 | `app.js` | `openEventModal()` L381 | ISO 문자열 `.slice(0,16)` — UTC 형식 dateTime 시 9시간 오차 | `toLocalDateTime(new Date(...))` 로 변경 |
| 2 | `style.css` | L497–501 | CSS4 전용 `:not(.today .day-number)` complex selector | 캐스케이드 순서로 대체 (today 규칙을 마지막에 배치) |

### 확인된 정상 동작

- ✅ 모든 `window.*` 모듈 노출 (Config → Auth → Calendar/Drive → Gmail/Report → App 순 로드)
- ✅ 미인증 시 모든 API 호출에서 `requireToken()` 예외 발생
- ✅ DELETE 204 No Content 처리 (`apiFetch` status 체크)
- ✅ 이메일 RFC 2822 + UTF-8 MIME Encoded-Word 인코딩 로직
- ✅ 중복 감지 자기 제외 (수정 모드 `editEventId` 필터링)
- ✅ localStorage 수신자·폴더 ID 영속성

---

## PHASE 6 배포 현황

| 항목 | 상태 |
|------|------|
| GitHub Pages | ✅ 활성화 (HTTP 200 확인) |
| 배포 URL | https://bangdw-hash.github.io/asea-calendar-management/ |
| 최신 커밋 | `c8eb15f` — Fix datetime timezone + CSS cascade |

---

## 미결 사항 (코드 문제 아님 — Google Cloud Console 설정)

아래 항목은 **Google Cloud Console에서 수동 설정**이 필요합니다.  
코드 수정으로 해결 불가.

1. **Authorized JavaScript origins** 추가  
   `https://console.cloud.google.com/apis/credentials` → OAuth 2.0 Client ID 수정  
   → `https://bangdw-hash.github.io` 추가

2. **OAuth 동의 화면 → 테스트 사용자**  
   `bangdw@gmail.com` 추가 (앱이 게시 전이라면 필수)

이 설정이 없으면 Google 로그인 팝업에서 `origin_mismatch` 또는 `403` 오류 발생.

---

*기반 프로토콜: CLAUDE-CODEX-PROTOCOL v1.0*
