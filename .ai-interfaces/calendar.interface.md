# calendar.js 인터페이스 계약서
> 작성: Claude Code | 날짜: 2026-06-06 | 상태: 확정 (Codex 구현용)

## 모듈 개요
Google Calendar API v3를 사용하여 일정 CRUD와 중복 감지를 제공한다.
서버 없이 클라이언트에서 직접 API를 호출하는 정적 웹앱 모델.

## 의존성
- `auth.js` — `Auth.getToken()` 필수
- `config.js` — `CONFIG.calendarId` 기본값

## API Base URL
```
https://www.googleapis.com/calendar/v3
```

## 전역 노출
```javascript
window.CalendarModule = {
  listEvents, createEvent, updateEvent, deleteEvent, checkDuplicate, listCalendars
}
```

---

## 함수 명세

### `CalendarModule.listEvents(calendarId, timeMin, timeMax)` → `Promise<Event[]>`
```javascript
// 반환 배열 요소 구조
{
  id: string,
  summary: string,
  start: { dateTime: string, timeZone: string },
  end:   { dateTime: string, timeZone: string },
  description: string,
  colorId: string,
}
```
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| calendarId | string | 캘린더 ID (없으면 `CONFIG.calendarId` 사용) |
| timeMin | string | ISO 8601 시작 시간 (예: `"2026-06-01T00:00:00+09:00"`) |
| timeMax | string | ISO 8601 종료 시간 |

API: `GET /calendars/{calendarId}/events?timeMin=&timeMax=&singleEvents=true&orderBy=startTime`

### `CalendarModule.createEvent(calendarId, eventData)` → `Promise<Event>`
```javascript
// eventData 구조
{
  summary: string,                             // 제목 (필수)
  start: { dateTime: string, timeZone: string },
  end:   { dateTime: string, timeZone: string },
  description?: string,
  colorId?: string,                            // 부서별 색상 ID
}
// 반환: { id: string, ...event }
```
API: `POST /calendars/{calendarId}/events`

### `CalendarModule.updateEvent(calendarId, eventId, eventData)` → `Promise<Event>`
```javascript
// eventData: createEvent와 동일 구조 (부분 업데이트 가능)
// 반환: { id: string, ...event }
```
API: `PUT /calendars/{calendarId}/events/{eventId}`

### `CalendarModule.deleteEvent(calendarId, eventId)` → `Promise<boolean>`
```javascript
// 반환: true (성공) | false (실패)
```
API: `DELETE /calendars/{calendarId}/events/{eventId}` — 204 응답 시 true

### `CalendarModule.checkDuplicate(calendarId, summary, startTime, endTime)` → `Promise<DuplicateResult>`
```javascript
// 반환 구조
{
  isDuplicate: boolean,
  conflictingEvents: [
    { id: string, summary: string, start: object, end: object }
  ]
}
```
중복 기준: **동일한 제목(`summary`)** OR **시간대 겹침** (start < otherEnd && end > otherStart)

### `CalendarModule.listCalendars()` → `Promise<Calendar[]>`
```javascript
// 반환 배열 요소 구조
{ id: string, summary: string, primary: boolean }
```
API: `GET /users/me/calendarList`

---

## 오류 처리 규칙
1. `Auth.getToken() === null` → `throw new Error('인증이 필요합니다')`
2. API 응답 4xx/5xx → `throw new Error(errorMessage)`
3. 네트워크 오류 → `throw new Error('네트워크 오류')`
4. 빈 배열 응답 → `[]` 반환 (throw 금지)

## 공통 fetch 패턴
```javascript
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  if (!token) throw new Error('인증이 필요합니다');
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API 오류: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
```

## 변경 금지 항목
- `window.CalendarModule` 네임스페이스
- 모든 함수명, 파라미터 순서, 반환 구조
