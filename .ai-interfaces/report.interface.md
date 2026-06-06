# report.js 인터페이스 계약서
> 작성: Claude Code | 날짜: 2026-06-06 | 상태: 확정 (Codex 구현용)

## 모듈 개요
주간보고 허브를 위한 유틸리티 모듈. 카카오톡 발송 문구 생성, 클립보드 복사,
보고서 요약 데이터 구조 생성을 제공한다.

**주의**: 서버 없이 PDF 파싱이 불가하므로 실제 일정 추출은 더미 구조로 대체하고
Drive 링크를 표시한다.

## 의존성
- `drive.js`의 `ReportFile` 타입 구조 참조 (직접 import 없음)

## 전역 노출
```javascript
window.ReportModule = { generateKakaoText, copyToClipboard, buildReportSummary }
```

---

## 함수 명세

### `ReportModule.generateKakaoText(fileName, driveLink)` → `string`
동기 함수. 카카오톡 발송용 문구를 반환한다.

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| fileName | string | 파일명 (예: `"주간업무보고서 2026-25주차.pdf"`) |
| driveLink | string | Drive 파일 공유 링크 |

**파일명 파싱**: `/(\d{4})-(\d+)주차/` 패턴으로 연도·주차 추출
**파싱 실패 시**: 연도·주차 없이 기본 문구 반환 (throw 금지)

**출력 형식**:
```
[주간업무보고] 2026년 25주차

안녕하세요. 이번 주 업무보고서를 공유드립니다.

📎 보고서: {driveLink}

확인 부탁드립니다. 감사합니다.
```

### `ReportModule.copyToClipboard(text)` → `Promise<boolean>`
```javascript
// 반환: true (복사 성공) | false (실패 — 브라우저 권한 없음 등)
```
`navigator.clipboard.writeText(text)` 사용. 실패 시 throw 금지, false 반환.

### `ReportModule.buildReportSummary(fileInfo)` → `ReportSummary`
동기 함수. 주간보고 허브 UI에 필요한 데이터 구조를 생성한다.

```javascript
// fileInfo 파라미터: DriveModule.listReportFiles()의 반환 요소
{
  id: string, name: string, createdTime: string,
  webViewLink: string, weekNumber: number, year: number
}

// 반환 구조
{
  weekLabel: string,            // "2026년 25주차"
  driveLink: string,            // webViewLink 그대로
  calendarCandidates: [         // 항상 빈 배열 반환 (PDF 파싱 불가)
    {
      title: string,
      startDateTime: string,
      endDateTime: string,
      department: string,
    }
  ],
}
```

**구현 규칙**:
- `weekLabel`: `year === 0` 또는 `weekNumber === 0`이면 `"업무보고서"`
- `calendarCandidates`: 항상 빈 배열 `[]` 반환 (서버 없이 PDF 파싱 불가)
- `driveLink`: `fileInfo.webViewLink` 그대로 사용

---

## 오류 처리 규칙
1. 모든 동기 함수: throw 금지, 파싱 실패 시 기본값 반환
2. `copyToClipboard`: Promise reject 금지, 실패 시 `false` 반환

## 변경 금지 항목
- `window.ReportModule` 네임스페이스
- 모든 함수명, 파라미터, 반환 구조
- `generateKakaoText`와 `buildReportSummary`는 동기 함수여야 함
