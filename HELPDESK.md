# ASEA 스마트 안내데스크 — 시스템 아키텍처 설계서

> **용도:** 이 파일은 `asea-calendar-management` 레포지토리 내 `helpdesk.html` 및 관련 파일 작업 시에만 참조한다.  
> AI 에이전트(Claude Code)는 헬프데스크 관련 작업 착수 전 반드시 이 파일을 먼저 읽는다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | ASEA 스마트 안내데스크 |
| 파일 | `helpdesk.html`, `helpdesk.js`, `helpdesk.css` |
| URL | `https://bangdw-hash.github.io/asea-calendar-management/helpdesk.html` |
| 운영 주체 | 아세아항공직업전문학교 기획처 |
| 총괄 담당 | 방시원 (기획처 차장, `bangdw@gmail.com`) |
| 배포 방식 | GitHub Pages (빌드 없음, push = 즉시 배포) |
| 목표 | 학생·훈련생 AI 민원 상담 + 내부 담당자 민원 관리 포털 통합 시스템 |

---

## 2. 시스템 레이어 구조

```
┌─────────────────────────────────────────────────────┐
│  레이어 1: 학생·훈련생 접점                            │
│  helpdesk.html — AI 채팅 + 카테고리 선택 + 담당자 연결  │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS POST (질문 + 카테고리)
┌────────────────────────▼────────────────────────────┐
│  레이어 2: AI 프록시 (서버리스)                        │
│  Supabase Edge Function: /functions/v1/ai-helpdesk   │
│  - 카테고리별 시스템 프롬프트 선택                       │
│  - Claude API (claude-haiku-4-5) 호출                │
│  - SSE 스트리밍 응답 반환                              │
└────────────────────────┬────────────────────────────┘
                         │
        ┌────────────────┴─────────────────┐
        │                                  │
┌───────▼────────┐              ┌──────────▼──────────┐
│  Anthropic      │              │  Supabase DB         │
│  Claude API     │              │  - helpdesk_logs     │
│  (AI 응답 생성) │              │  - helpdesk_escalations│
└────────────────┘              └─────────────────────┘
                                          │
┌─────────────────────────────────────────▼───────────┐
│  레이어 3: 내부 민원 관리 포털                          │
│  complaint-portal.html (내부 전용, 비공개 URL)         │
│  - 전체 민원 접수·배정·처리 현황                        │
│  - 담당자 직통 연결                                     │
│  - 이메일 알림 자동 발송                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  레이어 4: 지식 베이스                                  │
│  Google Forms → Google Sheets → JSON → Edge Function │
│  admin/ASEA_안내데스크_지식취합_템플릿.docx (취합 원본)  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  레이어 5: 컴플라이언스·보안                            │
│  - 개인정보보호법 준수                                  │
│  - API 키 환경변수 격리                                │
│  - 로그 1년 자동 삭제 정책                              │
└─────────────────────────────────────────────────────┘
```

---

## 3. 파일 구조

```
/
├── helpdesk.html              ← 메인 채팅 UI (학생 접점)
├── helpdesk.js                ← 채팅 로직, API 연동, 카테고리 관리
├── helpdesk.css               ← 전용 스타일 (design system 토큰 적용)
├── complaint-portal.html      ← 내부 담당자 포털 (비공개)
├── complaint-portal.js        ← 민원 접수·배정·처리 로직
├── HELPDESK.md                ← 이 파일 (아키텍처 설계서)
├── admin/
│   └── ASEA_안내데스크_지식취합_템플릿.docx  ← 담당자 배포용 취합 템플릿
└── supabase/
    └── functions/
        └── ai-helpdesk/
            └── index.ts       ← Edge Function (AI 프록시)
```

---

## 4. 카테고리 분류 체계

민원은 4개 카테고리로 분류한다. 학생이 카테고리를 선택하면 해당 전문 시스템 프롬프트가 활성화된다.

| 코드 | 카테고리명 | 담당 부서 | 관련 기관 |
|------|-----------|---------|---------|
| `credit` | 학점은행제 | 교학처 | 국가평생교육진흥원 |
| `ncs` | 국비훈련 / NCS | 훈련사업팀 | 고용노동부 HRD-Net |
| `special` | 특강 과정 | 교학처·행정처 | — |
| `admin` | 일반 행정 | 행정처·학생지원팀 | — |

---

## 5. AI 응답 처리 분류 기준

Edge Function에서 각 질문 유형에 따라 AI의 응답 범위를 제한한다.

| 분류 | AI 역할 | 처리 예시 |
|------|--------|---------|
| **A** | 완전 자동 응답 | 수료 기준, 학사일정, 발급 방법 안내 |
| **B** | 절차 안내 + 서식 다운로드 링크 제공 → 담당자 최종 처리 | 환불 신청, 이의신청, 중도포기 |
| **C** | 절차 개요 + 담당 부서 안내 → 내방 안내 | 계좌 변경, 금전 처리, 법적 서류 |

**AI가 절대 하면 안 되는 것:**
- 환불 금액 직접 계산·제시
- 훈련장려금 계좌 정보 수집
- 중도포기 환수금 확정 금액 안내
- 개인 성적 열람·정정 처리
- 개인정보 직접 수집 (학번, 주민번호, 계좌번호)

---

## 6. Supabase 데이터베이스 스키마

```sql
-- 대화 로그 (분석·개선용)
CREATE TABLE helpdesk_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  category    TEXT CHECK (category IN ('credit','ncs','special','admin')),
  question    TEXT NOT NULL,
  answer      TEXT,
  session_id  TEXT,         -- 익명 세션 식별용 (IP 아님)
  escalated   BOOLEAN DEFAULT false
);

-- 담당자 연결 요청 (민원 접수)
CREATE TABLE helpdesk_escalations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  name        TEXT,
  contact     TEXT,         -- 전화번호 또는 이메일
  category    TEXT,
  summary     TEXT NOT NULL,
  attachment_url TEXT,      -- Supabase Storage 첨부파일
  assigned_to TEXT,         -- 담당자 이름 (배정 후 입력)
  status      TEXT DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','resolved')),
  resolved_at TIMESTAMPTZ,
  reply       TEXT          -- 담당자 답변 내용
);

-- RLS 정책 (Row Level Security)
-- helpdesk_logs: 서비스 롤만 읽기, 익명 삽입 허용 (rate limit 적용)
-- helpdesk_escalations: 익명 삽입 허용, 읽기는 인증 사용자만
```

---

## 7. Supabase Edge Function 명세

**엔드포인트:** `POST /functions/v1/ai-helpdesk`

**요청 형식:**
```json
{
  "category": "credit | ncs | special | admin",
  "messages": [
    { "role": "user", "content": "질문 텍스트" }
  ],
  "session_id": "익명 세션 UUID"
}
```

**응답 형식:** Server-Sent Events (SSE) 스트리밍

**환경변수 (Supabase Dashboard에서 설정):**
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://zbpeyklwpotjyveipzxd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

**Rate Limit:** 세션당 분당 10회, 1세션 최대 20회 메시지

---

## 8. 시스템 프롬프트 설계

### 공통 베이스 (모든 카테고리 공유)

```
당신은 아세아항공직업전문학교 스마트 안내데스크 AI입니다.
학생과 훈련생의 민원·문의에 정확하고 친절하게 안내합니다.

규칙:
1. 확인되지 않은 사항은 반드시 "담당자 확인이 필요합니다"로 안내한다.
2. 개인정보(학번, 주민번호, 계좌번호)를 요청하지 않는다.
3. 금액 계산, 최종 승인, 법적 효력 있는 처리는 직접 수행하지 않는다.
4. 답변은 단계별로 간결하게 제공한다.
5. 담당자 연결이 필요한 경우 "담당자에게 직접 문의" 버튼 사용을 안내한다.
```

### 카테고리별 추가 프롬프트 (Edge Function 내 하드코딩)

- `credit`: 학점은행제 운영 규정, 국가평생교육진흥원 절차 주입
- `ncs`: 고용노동부 훈련 기준, HRD-Net 출결 규정, 훈련장려금 지급 기준 주입
- `special`: 특강 운영 내규, 환불 규정 주입
- `admin`: 증명서 발급 절차, 학사일정, 기숙사 규정 주입

> **업데이트 주기:** 매 학기 초 교학처·훈련사업팀이 내용 검토 후 수정 요청 → 기획처 승인 → 코드 반영

---

## 9. UI 설계 원칙

### 학생 접점 (helpdesk.html)

```
[화면 1: 랜딩]
ASEA 스마트 안내데스크 (로고 + 타이틀)
"무엇이 궁금하신가요?" (부제목)
────────────────────────────────────
[학점은행제]  [국비훈련]  [특강]  [일반행정]  ← 카테고리 4개 버튼
────────────────────────────────────
자주 묻는 질문 퀵 버튼 5개 (카테고리 선택 후 노출)

[화면 2: 채팅]
상단 고정: 선택 카테고리 뱃지 + 담당 부서명
채팅 영역: AI 응답 (타이핑 스트리밍) + 사용자 입력
하단 고정: 텍스트 입력창 + 전송 버튼 + 담당자 연결 버튼

[화면 3: 담당자 연결]
이름(선택) + 연락처 + 문의 내용 요약 + 첨부파일(선택)
→ Supabase DB 저장 + 담당자 이메일 알림 자동 발송
```

### 디자인 토큰 (CLAUDE.md 기준 동일 적용)

```css
--primary: #1A73E8;
--primary-dk: #1557B0;
--primary-lt: #E8F0FE;
--r: 12px;           /* border-radius — pill 형태 금지 */
--sh: 0 1px 3px rgba(0,0,0,.1);
```

- 이모지 사용 금지 (인라인 SVG 아이콘만 사용)
- 모바일 퍼스트 (16px 사이드 거터, 가로 스크롤 없음)
- 로그인 불필요 (접근 장벽 최소화)

---

## 10. 내부 민원 포털 설계 (complaint-portal.html)

### 접근 제어

```javascript
// 관리자 세션 확인 (forum.html 동일 패턴)
if (sessionStorage.getItem('helpdesk_admin') !== '1') {
  window.location.href = '/index.html';
}
```

### 민원 카드 상태 흐름

```
pending (접수) → in_progress (처리중) → resolved (완료)
```

### 자동 배정 규칙

```javascript
const AUTO_ASSIGN = {
  credit:  { dept: '교학처',      email: 'edu@asea.ac.kr' },
  ncs:     { dept: '훈련사업팀',  email: 'train@asea.ac.kr' },
  special: { dept: '교학처',      email: 'edu@asea.ac.kr' },
  admin:   { dept: '행정처',      email: 'admin@asea.ac.kr' },
};
```

### 알림 이메일 트리거

| 이벤트 | 수신자 | 내용 |
|--------|--------|------|
| 민원 신규 접수 | 해당 부서 담당자 | 민원 내용 + 포털 링크 |
| 24시간 미처리 | 담당자 + 기획처 | 미처리 민원 재알림 |
| 처리 완료 | 민원인 (이메일 제공 시) | 처리 결과 안내 |

---

## 11. 개인정보보호 준수 사항

### 수집 항목 및 보유 기간

| 항목 | 수집 목적 | 보유 기간 | 비고 |
|------|---------|---------|------|
| 질문 텍스트 | AI 응답 품질 개선 | 1년 후 자동 삭제 | 개인 식별 불가 원칙 |
| 이름 (선택) | 민원 처리 | 처리 완료 후 6개월 | 입력 선택 사항 |
| 연락처 | 민원 처리 | 처리 완료 후 6개월 | 암호화 저장 |
| 세션 ID | rate limit | 24시간 | IP 주소 미저장 |

### 필수 고지 사항

- 페이지 하단 개인정보처리방침 링크 필수 (`/privacy.html` 연결)
- 담당자 연결 폼: "수집·이용 동의" 체크박스 필수
- 개인정보보호책임자: 기획처장 (bangdw@gmail.com)

### AI 입력 필터링 (Edge Function)

```typescript
// 개인정보 패턴 감지 시 경고 반환 (저장하지 않음)
const PII_PATTERNS = [
  /\d{6}-\d{7}/,       // 주민등록번호
  /\d{10,16}/,          // 계좌번호 패턴
];
```

---

## 12. 지식 베이스 관리

### 자료 수집 경로

```
담당자 (Google Forms 제출)
        ↓
Google Sheets (자동 취합)
        ↓
기획처 최종 확인 (탭 3)
        ↓
JSON 변환 → Edge Function 시스템 프롬프트 반영
```

### 취합 템플릿

`admin/ASEA_안내데스크_지식취합_템플릿.docx`

- 학점은행제 145항목, 국비훈련 80항목, 특강 38항목, 일반행정 50항목, 학사업무 35항목
- 분류(A/B/C) + AI 가능 내용 + 처리 불가 사유 + 서식 목록 + 담당 부서 포함
- 담당자 배포 시 Google Drive 공유 폴더 활용

### 업데이트 주기

| 주기 | 내용 | 담당 |
|------|------|------|
| 매 학기 초 | 학사일정·수강신청 기간 반영 | 교학처 |
| 분기별 | 로그 분석 → FAQ 추가·수정 | 기획처 |
| 수시 | 법령 변경 (훈련기준 등) 반영 | 훈련사업팀 |

---

## 13. 구축 단계 로드맵

| 단계 | 기간 | 주요 작업 | 산출물 |
|------|------|---------|--------|
| Phase 0 | D+0~7 | 내부 지식 취합 (Google Forms 배포) | 카테고리별 FAQ 30건+ |
| Phase 1 | D+8~21 | AI 챗봇 핵심 구현 | `helpdesk.html`, Edge Function |
| Phase 2 | D+22~42 | 민원 포털 구현 | `complaint-portal.html` |
| Phase 3 | D+43~56 | 연동 고도화 + 테스트 | 통합 시스템 배포 |

---

## 14. 개발 규칙 (이 레포 기준)

1. **모듈 패턴 준수:** `window.HelpdeskModule = { ... }` IIFE 방식
2. **토큰 null 체크 불필요:** 헬프데스크는 인증 없이 동작
3. **에러 처리:** `throw new Error(...)` 사용, `console.error` 금지
4. **빈 응답:** 빈 배열·null 반환 허용, throw 금지
5. **스타일:** CLAUDE.md 디자인 토큰 적용, 이모지 금지, `--r:12px` 라운드
6. **보안:** API 키는 반드시 Edge Function 환경변수에만 저장, 프론트엔드 노출 금지

---

## 15. 관련 파일 참조

| 파일 | 역할 |
|------|------|
| `CLAUDE.md` | 레포 전체 개발 지침 (상위 문서) |
| `config.js` | Google OAuth 설정 (헬프데스크는 미사용) |
| `forum.html` | Supabase 연동 패턴 참조 |
| `checkin.html` | GAS 프록시 패턴 참조 |
| `privacy.html` | 개인정보처리방침 페이지 |
| `supabase/` | Edge Function 배포 디렉토리 |

---

*최종 수정: 2026-09-18 | 기획처 방시원*
