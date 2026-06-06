# drive.js 인터페이스 계약서
> 작성: Claude Code | 날짜: 2026-06-06 | 상태: 확정 (Codex 구현용)

## 모듈 개요
Google Drive API v3를 사용하여 보고서 폴더의 PDF 파일 목록 조회 및 공유 링크 생성을 제공한다.

## 의존성
- `auth.js` — `Auth.getToken()` 필수
- `config.js` — `CONFIG.driveReportFolderId` 기본값

## API Base URL
```
https://www.googleapis.com/drive/v3
```

## 전역 노출
```javascript
window.DriveModule = { listReportFiles, getShareLink }
```

---

## 함수 명세

### `DriveModule.listReportFiles(folderId)` → `Promise<ReportFile[]>`
```javascript
// 반환 배열 요소 구조
{
  id: string,
  name: string,           // 예: "주간업무보고서 2026-25주차.pdf"
  createdTime: string,    // ISO 8601
  webViewLink: string,    // Drive 미리보기 URL
  weekNumber: number,     // 파일명에서 파싱한 주차 (예: 25)
  year: number,           // 파싱한 연도 (예: 2026)
}
```
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| folderId | string | Drive 폴더 ID (없으면 `CONFIG.driveReportFolderId` 사용) |

**API**: `GET /files?q='${folderId}' in parents and mimeType='application/pdf'&fields=files(id,name,createdTime,webViewLink)&orderBy=createdTime desc`

**파일명 파싱 규칙**:
- 패턴: `주간업무보고서 {year}-{week}주차.pdf`
- 정규식: `/(\d{4})-(\d+)주차/`
- 파싱 실패 시 `weekNumber: 0, year: 0` 반환 (throw 금지)
- 반환 시 `createdTime` 내림차순 정렬 (최신순)

### `DriveModule.getShareLink(fileId)` → `Promise<string>`
```javascript
// 반환: "https://drive.google.com/file/d/{fileId}/view?usp=sharing"
// 또는 webViewLink 직접 반환
```
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| fileId | string | Drive 파일 ID |

**구현 전략**: 권한 변경 없이 `webViewLink` 기반 URL을 반환한다.
실제 공유 권한이 필요한 경우 `https://drive.google.com/file/d/{fileId}/view` 형태로 반환.

---

## 오류 처리 규칙
1. `Auth.getToken() === null` → `throw new Error('인증이 필요합니다')`
2. 빈 폴더 → `[]` 반환 (throw 금지)
3. API 4xx/5xx → `throw new Error(errorMessage)`
4. 파일명 파싱 실패 → 해당 파일 포함하되 `weekNumber: 0, year: 0` 처리

## 공통 fetch 패턴
```javascript
async function apiFetch(path) {
  const token = Auth.getToken();
  if (!token) throw new Error('인증이 필요합니다');
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Drive API 오류: ${res.status}`);
  }
  return res.json();
}
```

## 변경 금지 항목
- `window.DriveModule` 네임스페이스
- 모든 함수명, 파라미터, 반환 구조
