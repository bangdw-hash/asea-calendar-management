# auth.js 인터페이스 계약서
> 작성: Claude Code | 날짜: 2026-06-06 | 상태: 확정 (Claude Code 구현)

## 모듈 개요
Google OAuth 2.0 인증 처리. Google Identity Services (GIS) Token Model 사용.
모든 다른 모듈(`calendar.js`, `drive.js`, `gmail.js`)이 이 모듈의 토큰에 의존한다.

## 전역 노출
```javascript
window.Auth = { login, logout, getToken, isLoggedIn, onAuthChange }
```

## 의존성
- `config.js` — `CONFIG.googleClientId`, `CONFIG.googleScopes` 사용
- GIS 스크립트 (index.html에서 로드): `https://accounts.google.com/gsi/client`

---

## 함수 명세

### `Auth.login()` → `Promise<void>`
| 항목 | 내용 |
|------|------|
| 설명 | Google OAuth 2.0 토큰 팝업을 열어 사용자 인증을 수행한다 |
| 파라미터 | 없음 |
| 반환 | `Promise<void>` — 인증 완료(성공 또는 실패) 후 resolve |
| 오류 | GIS 미로드 시 `Error` 발생 |
| 사이드이펙트 | 성공 시 내부 token 저장, `onAuthChange` 콜백 호출 |

### `Auth.logout()` → `void`
| 항목 | 내용 |
|------|------|
| 설명 | 현재 액세스 토큰을 폐기하고 로그아웃 처리한다 |
| 파라미터 | 없음 |
| 반환 | void |
| 사이드이펙트 | token 초기화, `onAuthChange` 콜백 호출 |

### `Auth.getToken()` → `string | null`
| 항목 | 내용 |
|------|------|
| 설명 | 현재 유효한 OAuth 액세스 토큰을 반환한다 |
| 파라미터 | 없음 |
| 반환 | token string (로그인 상태) \| null (미로그인 또는 만료) |
| 사용처 | 모든 API 호출 시 `Authorization: Bearer {token}` 헤더에 사용 |

### `Auth.isLoggedIn()` → `boolean`
| 항목 | 내용 |
|------|------|
| 설명 | 현재 로그인 여부를 반환한다 |
| 파라미터 | 없음 |
| 반환 | `true` (유효한 token 존재) \| `false` |

### `Auth.onAuthChange(callback)` → `void`
| 항목 | 내용 |
|------|------|
| 설명 | 인증 상태 변경 시 호출될 콜백을 등록한다 |
| 파라미터 | `callback(isLoggedIn: boolean) → void` |
| 반환 | void |
| 사용처 | `app.js`에서 UI 업데이트 트리거 |

---

## 다른 모듈에서의 사용 패턴
```javascript
const token = Auth.getToken();
if (!token) {
  throw new Error('인증이 필요합니다. Auth.login()을 먼저 호출하세요.');
}
const response = await fetch(apiUrl, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 변경 금지 항목
- 함수명, 파라미터, 반환 타입 변경 금지
- `window.Auth` 네임스페이스 변경 금지
