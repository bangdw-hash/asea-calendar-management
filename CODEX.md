# CODEX.md — OpenAI Codex 구현 지시서
> 발신: Claude Code | 날짜: 2026-06-06 | 프로젝트: ASEA Calendar Management

---

## 역할 및 규칙

당신(Codex)은 구현 에이전트입니다. 아래 4개 모듈을 구현하세요.

**불변 규칙:**
1. 각 모듈의 인터페이스 계약서(`.ai-interfaces/*.interface.md`)를 먼저 읽고 시작
2. 함수명·파라미터·반환 구조 **변경 금지**
3. 작업 시작 전 `locks.json`에 파일 등록 → 완료 후 해제
4. 완료 시 `activity.log`에 기록 + `WORK_STATUS.md` 갱신

---

## 구현 목록

### 순서 3 — 즉시 시작 가능 (병렬)

#### `calendar.js`
- **계약서**: `.ai-interfaces/calendar.interface.md`
- **의존성**: `auth.js` (완료됨), `config.js` (완료됨)
- **구현 내용**: Google Calendar API v3 래퍼
  - `CalendarModule.listEvents(calendarId, timeMin, timeMax)`
  - `CalendarModule.createEvent(calendarId, eventData)`
  - `CalendarModule.updateEvent(calendarId, eventId, eventData)`
  - `CalendarModule.deleteEvent(calendarId, eventId)`
  - `CalendarModule.checkDuplicate(calendarId, summary, startTime, endTime)`
  - `CalendarModule.listCalendars()`
- **노출**: `window.CalendarModule = { ... }`

#### `drive.js`
- **계약서**: `.ai-interfaces/drive.interface.md`
- **의존성**: `auth.js` (완료됨), `config.js` (완료됨)
- **구현 내용**: Google Drive API v3 래퍼
  - `DriveModule.listReportFiles(folderId)`
  - `DriveModule.getShareLink(fileId)`
- **노출**: `window.DriveModule = { ... }`

---

### 순서 4 — `drive.js` 완료 후 시작 (병렬)

#### `gmail.js`
- **계약서**: `.ai-interfaces/gmail.interface.md`
- **의존성**: `auth.js`, `config.js`, `drive.js`
- **구현 내용**: Gmail API v1 래퍼
  - `GmailModule.sendEmail({ to, subject, body, driveLink })`
  - `GmailModule.generateDraft(fileName)` ← 동기 함수
- **노출**: `window.GmailModule = { ... }`

#### `report.js`
- **계약서**: `.ai-interfaces/report.interface.md`
- **의존성**: `drive.js`, `calendar.js`
- **구현 내용**: 유틸리티 함수
  - `ReportModule.generateKakaoText(fileName, driveLink)` ← 동기
  - `ReportModule.copyToClipboard(text)` → `Promise<boolean>`
  - `ReportModule.buildReportSummary(fileInfo)` ← 동기
- **노출**: `window.ReportModule = { ... }`

---

## 코딩 표준

```javascript
'use strict';

(function () {
  // 1. 비공개 상태/헬퍼는 IIFE 내부에 선언
  // 2. 공개 인터페이스만 window.ModuleName에 노출
  // 3. 모든 API 호출 시 Auth.getToken() null 체크 필수
  // 4. 빈 배열/null 응답: throw 금지, 빈 배열 반환
  // 5. API 오류: Error 객체 throw (콘솔 출력 금지)

  window.ExampleModule = {
    exampleMethod: async function (param) {
      var token = Auth.getToken();
      if (!token) throw new Error('인증이 필요합니다');
      // ...구현...
    },
  };
})();
```

---

## API 참조

| 서비스 | Base URL |
|--------|----------|
| Calendar v3 | `https://www.googleapis.com/calendar/v3` |
| Drive v3 | `https://www.googleapis.com/drive/v3` |
| Gmail v1 | `https://gmail.googleapis.com/gmail/v1` |

**공통 인증 헤더:**
```javascript
headers: { 'Authorization': 'Bearer ' + Auth.getToken() }
```

---

## 시뮬레이션 체크리스트 (완료 전 확인)

각 모듈 완료 시 아래를 확인하세요:

```
공통:
□ 브라우저 콘솔 오류 없음
□ window.[ModuleName] 정상 노출됨
□ 계약서의 모든 함수 구현됨
□ Auth.getToken() === null 상태에서 적절한 오류 처리
□ 빈 배열/null 응답 처리됨

calendar.js 추가:
□ checkDuplicate: 시간 겹침 로직 동작 확인
□ 빈 캘린더 응답 처리

drive.js 추가:
□ 파일명 파싱 정확도 확인 (연도·주차)
□ 빈 폴더 처리

gmail.js 추가:
□ 수신자 없는 경우 발송 차단됨
□ 한글 이메일 제목 RFC 2822 인코딩 확인

report.js 추가:
□ generateKakaoText 파싱 실패 시 기본값 반환
□ copyToClipboard 실패 시 false 반환 (throw 금지)
```

---

## 완료 보고 방법

1. `locks.json`에서 해당 파일 항목 제거
2. `activity.log`에 아래 형식으로 기록:
   ```
   [타임스탬프] [CODEX] [COMPLETE] calendar.js 구현 완료. 시뮬레이션 통과.
   [타임스탬프] [CODEX] [UNLOCK] calendar.js 잠금 해제
   ```
3. `WORK_STATUS.md`에서 해당 모듈 상태를 `✅ 완료`로 변경

---

*이 지시서는 Claude Code가 작성했습니다. 계약서 변경이 필요하면 Claude Code에 에스컬레이션하세요.*
