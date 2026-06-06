# asea-calendar-management — 프로젝트 작업지시서
> 기반 프로토콜: CLAUDE-CODEX-PROTOCOL v1.0
> 주관 에이전트: Claude Code | 구현 에이전트: OpenAI Codex

---

## 프로젝트 기본 정보

| 항목 | 내용 |
|------|------|
| 프로젝트명 | ASEA Calendar Management |
| GitHub 저장소 | `bangdw-hash/asea-calendar-management` |
| 배포 URL | `https://bangdw-hash.github.io/asea-calendar-management/` |
| 발신 이메일 | bangdw@gmail.com |
| 기술 스택 | Vanilla JS, HTML5, CSS3, Google APIs |
| 빌드 방식 | 정적 웹앱 (서버 없음, GitHub Pages 배포) |

---

## PHASE 1: 계획 (Claude Code 작성 — 인간 승인 대기)

### 파일 구조 및 에이전트 배정

```
asea-calendar-management/
├── index.html              [Claude Code] 전체 SPA 구조
├── style.css               [Claude Code] 디자인 시스템 + 반응형
├── config.js               [Claude Code] 설정값 + 수신자 목록
├── auth.js                 [Claude Code] Google OAuth 2.0
├── app.js                  [Claude Code] 라우터 + 초기화 + 통합
├── calendar.js             [Codex] 캘린더 CRUD + 중복 감지
├── drive.js                [Codex] Google Drive PDF 조회
├── gmail.js                [Codex] Gmail 발송 + 문구 자동 생성
├── report.js               [Codex] 주간보고 분석 + 카카오 초안
├── .ai-status/
│   ├── WORK_STATUS.md      [Claude Code 관리]
│   ├── locks.json          [양 에이전트 공용]
│   ├── activity.log        [양 에이전트 기록]
│   └── next-actions.md     [Claude Code 관리]
├── .ai-interfaces/
│   ├── auth.interface.md   [Claude Code 작성]
│   ├── calendar.interface.md
│   ├── drive.interface.md
│   ├── gmail.interface.md
│   └── report.interface.md
├── CLAUDE-CODEX-PROTOCOL.md
├── asea-calendar-management.md  (이 파일)
└── README.md               [Claude Code]
```

### 의존성 맵 및 빌드 순서

```
순서 1 (동시 시작 가능):
  [CC] config.js      ← 독립 모듈
  [CC] index.html     ← 독립 모듈 (구조만)
  [CC] style.css      ← 독립 모듈

순서 2 (config.js 완료 후):
  [CC] auth.js        ← config.js 의존

순서 3 (auth.js 완료 후 — 동시 시작 가능):
  [CX] calendar.js    ← auth.js 의존
  [CX] drive.js       ← auth.js 의존

순서 4 (drive.js + calendar.js 완료 후):
  [CX] gmail.js       ← drive.js 의존
  [CX] report.js      ← drive.js + calendar.js 의존

순서 5 (전체 모듈 완료 후):
  [CC] app.js         ← 모든 모듈 의존 (통합)
```

---

## 인터페이스 계약 (Interface Contracts)

> Codex는 아래 계약을 반드시 준수해야 한다. 함수명·파라미터·반환값 변경 금지.

### auth.js (Claude Code 구현 → Codex 참조)

```javascript
// auth.js가 전역으로 노출하는 것
window.Auth = {
  login: async () => void,           // Google OAuth 로그인 팝업
  logout: () => void,                // 로그아웃
  getToken: () => string | null,     // 현재 access token 반환
  isLoggedIn: () => boolean,         // 로그인 여부
  onAuthChange: (callback) => void,  // 인증 상태 변경 콜백 등록
};
```

### calendar.js (Codex 구현)

```javascript
window.CalendarModule = {
  // 이벤트 목록 조회
  listEvents: async (calendarId, timeMin, timeMax) => [{
    id: string,
    summary: string,
    start: { dateTime: string, timeZone: string },
    end: { dateTime: string, timeZone: string },
    description: string,
    colorId: string,
  }],

  // 이벤트 생성
  createEvent: async (calendarId, eventData) => { id: string, ...event },

  // 이벤트 수정
  updateEvent: async (calendarId, eventId, eventData) => { id: string, ...event },

  // 이벤트 삭제
  deleteEvent: async (calendarId, eventId) => boolean,

  // 중복 감지 (동일 제목 + 시간대 겹침)
  checkDuplicate: async (calendarId, summary, startTime, endTime) => {
    isDuplicate: boolean,
    conflictingEvents: [{ id, summary, start, end }]
  },

  // 캘린더 목록 조회
  listCalendars: async () => [{ id: string, summary: string, primary: boolean }],
};
```

### drive.js (Codex 구현)

```javascript
window.DriveModule = {
  // 지정 폴더의 PDF 파일 목록 (최신순)
  listReportFiles: async (folderId) => [{
    id: string,
    name: string,           // 예: "주간업무보고서 2026-25주차.pdf"
    createdTime: string,
    webViewLink: string,
    weekNumber: number,     // 파일명에서 파싱한 주차 (예: 25)
    year: number,           // 파싱한 연도 (예: 2026)
  }],

  // 파일 공유 링크 생성
  getShareLink: async (fileId) => string,  // 공유 URL 반환
};
```

### gmail.js (Codex 구현)

```javascript
window.GmailModule = {
  // 이메일 발송
  sendEmail: async ({
    to: [{ name: string, email: string }],
    subject: string,
    body: string,           // HTML 또는 plain text
    driveLink: string,      // 첨부 Drive 링크 (본문 하단 자동 삽입)
  }) => { success: boolean, messageId: string },

  // 파일명 기반 자동 문구 생성
  generateDraft: (fileName) => {
    subject: string,        // "[주간업무보고] 2026년 25주차 업무보고서"
    body: string,           // 기본 본문 텍스트
    weekNumber: number,
    year: number,
  },
};
```

### report.js (Codex 구현)

```javascript
window.ReportModule = {
  // 카카오톡 발송용 문구 생성
  generateKakaoText: (fileName, driveLink) => string,

  // 클립보드 복사
  copyToClipboard: async (text) => boolean,

  // 주간보고 허브용 더미 분석 데이터 구조 생성
  // (실제 PDF 파싱은 서버 없이 불가 → Drive 링크 표시로 대체)
  buildReportSummary: (fileInfo) => {
    weekLabel: string,      // "2026년 25주차"
    driveLink: string,
    calendarCandidates: [{
      title: string,
      startDateTime: string,
      endDateTime: string,
      department: string,
    }],
  },
};
```

---

## UI/UX 명세

### 탭 구성 (상단 고정 네비)

```
[📅 캘린더] [📋 주간허브] [✉️ 이메일] [⚙️ 설정]
```

### 캘린더 탭
- 월간 뷰 (기본) / 주간 뷰 전환 버튼
- 날짜 클릭 → 일정 추가 모달
- 일정 클릭 → 상세/수정/삭제 팝업
- 부서별 색상 코딩 (좌측 색상 바)
- 중복 감지 시 주황색 경고 배너
- 모바일: 스와이프로 월 이동

### 주간허브 탭
- Drive 폴더에서 PDF 파일 목록 자동 로드
- 파일 선택 → 주차 정보 파싱 표시
- 신규 일정 후보 카드 (초록 테두리) — 체크박스 선택
- 중복 일정 카드 (빨간 테두리) — [유지/대체/무시] 버튼
- "전체 승인 → 캘린더 등록" 버튼
- 카카오톡 문구 박스 + "클립보드 복사" 버튼

### 이메일 탭
- 파일 선택 → 제목·본문 자동 생성
- 수신자 체크박스 목록 (전체선택 포함)
- 본문 직접 수정 가능 (textarea)
- "미리보기 → 발송" 2단계 버튼
- 발송 완료 토스트

### 설정 탭
- Google 로그인/로그아웃 버튼 + 현재 계정 표시
- Drive 폴더 ID 입력
- 수신자 목록 (추가/삭제)
- 부서 색상 매핑

### 색상 팔레트

```css
--color-bg: #F8F9FB;
--color-accent: #1A73E8;
--color-text: #202124;
--color-card: #FFFFFF;
--color-border: #E8EAED;
--color-success: #34A853;
--color-warning: #FBBC05;
--color-error: #EA4335;
--color-dept-1: #4285F4;   /* 기획처 */
--color-dept-2: #34A853;   /* 교학처 */
--color-dept-3: #FBBC05;   /* 행정처 */
--color-dept-4: #EA4335;   /* 기타 */
```

---

## config.js 기본값

```javascript
const CONFIG = {
  googleClientId: '89094526186-ngj72p8cbqrvai06e2uhdiq0n5brrc2b.apps.googleusercontent.com',
  driveReportFolderId: '1CF1nlAWL2GZwLJ5jgHOxS4QKz5u1cBP0',
  senderEmail: 'bangdw@gmail.com',
  calendarId: 'primary',
  baseUrl: 'https://bangdw-hash.github.io/asea-calendar-management/',
  recipients: [
    { name: '수신자1', email: 'recipient1@example.com' },
    { name: '수신자2', email: 'recipient2@example.com' },
  ],
  departmentColors: {
    '기획처': '#4285F4',
    '교학처': '#34A853',
    '행정처': '#FBBC05',
    '기타': '#EA4335',
  },
};
```

---

## 시뮬레이션 체크리스트 (모듈별)

모든 모듈은 아래를 통과해야 통합 가능하다.

```
공통 체크:
□ 브라우저 콘솔 오류 없음
□ window.[ModuleName] 정상 노출됨
□ 인터페이스 계약의 모든 함수 구현됨
□ Auth.getToken() === null 상태에서 호출 시 적절한 오류 처리
□ 빈 배열/null 응답 처리됨

calendar.js 추가:
□ 이벤트 생성 후 목록에서 확인됨
□ 중복 이벤트 감지 로직 동작 확인

drive.js 추가:
□ 파일명에서 연도·주차 파싱 정확도 확인
□ 빈 폴더 처리됨

gmail.js 추가:
□ 파일명 → 제목·본문 자동 생성 패턴 확인
□ 수신자 없는 경우 발송 차단됨

report.js 추가:
□ 카카오 문구 생성 패턴 확인
□ 클립보드 복사 완료 후 토스트 표시됨

통합 체크 (app.js):
□ 탭 전환 시 각 모듈 정상 초기화
□ 로그인 → 로그아웃 → 재로그인 사이클 정상
□ 모바일 375px 뷰포트에서 레이아웃 깨짐 없음
```

---

## 인간 승인란

```
## 승인
[ ] 승인 — 자동 진행 허용
날짜:
승인자:
특이사항:
```

---

## 초기 Claude Code 실행 명령

Claude Code에서 이 프로젝트를 시작할 때 아래를 붙여넣으세요.

```
CLAUDE-CODEX-PROTOCOL.md와 asea-calendar-management.md를 모두 읽어라.
PHASE 1 계획이 이미 이 문서에 정의되어 있다.
다음을 순서대로 실행하라:

1. .ai-status/ 디렉토리와 locks.json, activity.log 초기화
2. .ai-interfaces/ 디렉토리에 각 모듈 인터페이스 계약서 파일 생성
3. 의존성 순서 1에 해당하는 config.js, index.html, style.css 작성 시작
4. auth.js 작성
5. WORK_STATUS.md 현황 업데이트
6. Codex에 위임할 모듈(calendar.js, drive.js, gmail.js, report.js)의
   작업 지시를 CODEX.md 파일로 생성
7. 모든 Claude Code 담당 파일 완료 후 보고

Codex 작업은 Claude Code 담당 파일이 완료된 후 별도 지시한다.
```

---

*Project Doc Version: 1.0 | 작성: 2026-06-06 | 기반 프로토콜: CLAUDE-CODEX-PROTOCOL v1.0*
