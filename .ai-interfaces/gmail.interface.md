# gmail.js 인터페이스 계약서
> 작성: Claude Code | 날짜: 2026-06-06 | 상태: 확정 (Codex 구현용)

## 모듈 개요
Gmail API v1을 사용하여 이메일을 발송하고, 파일명 기반으로 이메일 초안(제목 + 본문)을 자동 생성한다.

## 의존성
- `auth.js` — `Auth.getToken()` 필수
- `config.js` — `CONFIG.senderEmail`

## API Base URL
```
https://gmail.googleapis.com/gmail/v1
```

## 전역 노출
```javascript
window.GmailModule = { sendEmail, generateDraft }
```

---

## 함수 명세

### `GmailModule.sendEmail(params)` → `Promise<SendResult>`
```javascript
// params 구조
{
  to: [{ name: string, email: string }],  // 수신자 배열 (1개 이상 필수)
  subject: string,                         // 이메일 제목
  body: string,                            // 본문 (plain text 또는 HTML)
  driveLink: string,                       // Drive 파일 링크 (본문 하단에 자동 삽입)
}

// 반환 구조
{ success: boolean, messageId: string }
```

**구현 규칙**:
1. `to` 배열이 비어있으면 `throw new Error('수신자가 없습니다')`
2. 이메일 본문 구조:
   ```
   {body}
   
   ---
   📎 보고서 링크: {driveLink}
   ```
3. Gmail API RFC 2822 형식으로 인코딩:
   - `From: CONFIG.senderEmail`
   - `To: "name" <email>, ...` (여러 수신자 콤마 구분)
   - `Subject: =?UTF-8?B?{base64}?=` (한글 제목 인코딩)
   - `Content-Type: text/plain; charset=UTF-8`
4. Base64 URL-safe 인코딩 후 `POST /users/me/messages/send` 호출

**API**: `POST /users/me/messages/send` with `{ raw: base64UrlEncodedMessage }`

### `GmailModule.generateDraft(fileName)` → `DraftResult`
```javascript
// 반환 구조 (Promise 아님 — 동기 함수)
{
  subject: string,     // "[주간업무보고] 2026년 25주차 업무보고서"
  body: string,        // 기본 본문 텍스트
  weekNumber: number,  // 25
  year: number,        // 2026
}
```

**파일명 파싱 규칙**:
- 패턴: `주간업무보고서 2026-25주차.pdf`
- 정규식: `/(\d{4})-(\d+)주차/`
- 파싱 실패 시 기본값: `{ subject: '[주간업무보고] 업무보고서', body: '안녕하세요...', weekNumber: 0, year: 0 }`

**본문 기본 템플릿**:
```
안녕하세요.

{year}년 {weekNumber}주차 주간업무보고서를 공유드립니다.
보고서 내용 확인 부탁드립니다.

감사합니다.
```

---

## 오류 처리 규칙
1. `Auth.getToken() === null` → `throw new Error('인증이 필요합니다')`
2. 수신자 배열 빈 경우 → `throw new Error('수신자가 없습니다')`
3. API 4xx/5xx → `throw new Error(errorMessage)`
4. `generateDraft` 파싱 실패 → throw 금지, 기본값 반환

## 변경 금지 항목
- `window.GmailModule` 네임스페이스
- 모든 함수명, 파라미터, 반환 구조
- `generateDraft`는 동기 함수여야 함 (Promise 반환 금지)
