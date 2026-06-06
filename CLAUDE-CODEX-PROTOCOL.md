# CLAUDE-CODEX-PROTOCOL v1.0
> AI 협업 표준 프로토콜 — Claude Code (주관) + OpenAI Codex (구현)
> 모든 프로젝트에 공통 적용되는 범용 원칙

---

## 1. 핵심 원칙 (Governing Principles)

### 1.1 역할 정의

| 구분 | 에이전트 | 핵심 책임 |
|------|---------|---------|
| **Tech Lead** | Claude Code | 아키텍처 설계, 인터페이스 정의, 코드 리뷰, 통합, 배포, 상태 관리 |
| **Implementer** | OpenAI Codex | 모듈 구현, API 패턴 코드, 반복 로직, 단위 테스트 생성 |
| **Approver** | 인간 (방시원) | 초기 계획 승인 1회 → 이후 자동 진행 |

### 1.2 불변 규칙

```
RULE-01: Claude Code가 승인 없이 main 브랜치에 직접 push하지 않는다.
RULE-02: Codex는 인터페이스 계약(interface contract)이 확정된 모듈만 구현한다.
RULE-03: 동일 파일을 두 에이전트가 동시에 수정하지 않는다. (lock 시스템 준수)
RULE-04: 모든 모듈은 시뮬레이션 통과 후에만 통합 브랜치에 병합된다.
RULE-05: 작업 단위당 비용을 최소화하기 위해 단순 반복 코드는 Codex에 위임한다.
RULE-06: 사람의 최초 승인 이후 전 과정은 자동 진행. 단, 충돌·오류 발생 시 Claude Code가 판단 후 보고한다.
```

---

## 2. GitHub 저장소 구조

모든 협업 프로젝트 저장소에 아래 구조를 공통 적용한다.

```
[project-root]/
├── .ai-status/
│   ├── WORK_STATUS.md       # 현재 진행 상태 (인간 가독용)
│   ├── locks.json           # 파일 잠금 레지스트리
│   ├── activity.log         # 타임스탬프 기반 작업 로그
│   └── next-actions.md      # 다음 실행 예정 작업 목록
├── .ai-interfaces/
│   └── [module].interface.md  # 모듈별 인터페이스 계약서
├── CLAUDE-CODEX-PROTOCOL.md  # 이 파일 (공통 원칙)
├── [project-name].md         # 프로젝트별 작업지시서
└── CLAUDE.md                 # Claude Code 프로젝트 컨텍스트
```

---

## 3. 작업 상태 추적 시스템

### 3.1 locks.json 형식

```json
{
  "locks": [
    {
      "file": "src/auth.js",
      "owner": "claude-code",
      "branch": "feat/auth-calendar",
      "started": "2026-06-06T07:00:00+09:00",
      "status": "in_progress"
    }
  ],
  "last_updated": "2026-06-06T07:00:00+09:00"
}
```

**규칙:**
- 작업 시작 시 반드시 locks.json에 등록
- 작업 완료·취소 시 즉시 해제
- 같은 파일에 이미 lock이 있으면 해제될 때까지 대기
- lock 최대 유지 시간: 4시간 (초과 시 자동 해제 처리)

### 3.2 activity.log 형식

```
[2026-06-06T07:00:00+09:00] [CLAUDE-CODE] [PLAN] 아키텍처 설계 완료 → 승인 대기
[2026-06-06T08:00:00+09:00] [HUMAN] [APPROVE] 계획 승인. 자동 진행 시작.
[2026-06-06T08:05:00+09:00] [CLAUDE-CODE] [LOCK] auth.js, app.js, index.html 잠금
[2026-06-06T08:05:00+09:00] [CODEX] [LOCK] calendar.js, drive.js, gmail.js 잠금
[2026-06-06T09:30:00+09:00] [CODEX] [COMPLETE] calendar.js 구현 완료. 시뮬레이션 통과.
[2026-06-06T09:30:00+09:00] [CODEX] [UNLOCK] calendar.js 잠금 해제
[2026-06-06T09:45:00+09:00] [CLAUDE-CODE] [REVIEW] calendar.js 코드 리뷰 완료. 승인.
[2026-06-06T10:00:00+09:00] [CLAUDE-CODE] [MERGE] feat/drive-gmail → integration 병합
```

### 3.3 WORK_STATUS.md 형식

```markdown
# 작업 현황 — [프로젝트명]
최종 업데이트: 2026-06-06 10:00 KST | 업데이트 주체: Claude Code

## 현재 단계: BUILD (3/6)

| 모듈 | 담당 | 상태 | 브랜치 | 완료일 |
|------|------|------|--------|--------|
| index.html | Claude Code | ✅ 완료 | feat/auth-calendar | 06-06 |
| auth.js | Claude Code | 🔄 진행중 | feat/auth-calendar | - |
| calendar.js | Codex | ✅ 완료 | feat/drive-gmail | 06-06 |
| drive.js | Codex | 🔄 진행중 | feat/drive-gmail | - |
| gmail.js | Codex | ⏳ 대기 | - | - |
| report.js | Codex | ⏳ 대기 | - | - |
| app.js | Claude Code | ⏳ 대기 | - | - |

## 다음 예정 작업
- [ ] auth.js 완료 후 → app.js 시작 (Claude Code)
- [ ] drive.js 완료 → gmail.js 시작 (Codex)
```

---

## 4. 브랜치 전략

```
main
  └── integration          ← 통합 브랜치 (Claude Code 관리)
        ├── feat/[모듈명-claude]   ← Claude Code 작업 브랜치
        └── feat/[모듈명-codex]    ← Codex 작업 브랜치
```

**브랜치 규칙:**
- `main`: 검증 완료된 코드만 존재. Claude Code만 PR 병합 가능.
- `integration`: 각 에이전트 작업 브랜치가 병합되는 중간 브랜치.
- `feat/*`: 에이전트별 작업 단위. 작업 완료 후 PR을 통해 integration에 병합.
- 브랜치명 형식: `feat/[기능명]-[cc|cx]` (cc=claude-code, cx=codex)

**커밋 메시지 형식:**
```
[CC] feat: auth.js OAuth 2.0 구현 완료
[CX] feat: calendar.js CRUD 메서드 구현
[CC] review: calendar.js 리뷰 반영 수정
[CC] merge: feat/drive-gmail → integration
[CC] fix: gmail.js 인코딩 오류 수정
```

---

## 5. 6단계 워크플로우

```
PHASE 1: PLAN      → Claude Code 설계
PHASE 2: APPROVE   → 인간 승인 (1회)
PHASE 3: BUILD     → 양 AI 병렬 구현
PHASE 4: SIMULATE  → 모듈별 시뮬레이션
PHASE 5: INTEGRATE → Claude Code 통합
PHASE 6: DEPLOY    → GitHub Pages 배포
```

### PHASE 1: PLAN (Claude Code 단독)

Claude Code가 수행:
1. 전체 파일 구조 확정
2. 각 모듈의 인터페이스 계약서 작성 → `.ai-interfaces/` 저장
3. 파일별 에이전트 배정
4. 빌드 순서 및 의존성 맵 작성
5. `WORK_STATUS.md` 초기화
6. **→ 인간에게 계획 보고 후 승인 요청**

### PHASE 2: APPROVE (인간 1회)

인간이 확인하는 것:
- 기능 범위가 요구사항과 일치하는가
- 파일별 에이전트 배정이 적절한가
- 빌드 순서에 논리적 문제가 없는가

승인 방법: `WORK_STATUS.md`에 아래 한 줄 추가
```
## 승인
[날짜] 승인 — 자동 진행 허용
```

이후 전 과정은 자동 진행. 인간 개입 불필요.

### PHASE 3: BUILD (병렬 구현)

- Claude Code와 Codex가 각자 브랜치에서 동시 작업
- 작업 시작 전 locks.json 등록 필수
- 인터페이스 계약서 준수 필수 (함수 시그니처, 반환 형식 변경 금지)
- 의존 모듈 완료 전까지 하위 모듈 작업 시작 금지

**의존성 순서 예시:**
```
config.js (독립)
  └── auth.js (config 의존)
        └── calendar.js (auth 의존)
        └── drive.js (auth 의존)
              └── gmail.js (drive 의존)
              └── report.js (drive + calendar 의존)
                    └── app.js (모두 의존)
```

### PHASE 4: SIMULATE (모듈별 검증)

각 모듈 완료 시 Codex 또는 Claude Code가 수행:

```
시뮬레이션 체크리스트:
□ 모듈 단독 실행 시 오류 없음
□ 인터페이스 계약 함수 전체 구현됨
□ 엣지 케이스 (빈 값, 네트워크 오류, 인증 만료) 처리됨
□ console.error 없이 실행 완료
□ 의존 모듈과 연결 테스트 통과
```

시뮬레이션 실패 시: 해당 에이전트가 자체 수정 후 재시뮬레이션 (Claude Code에 보고).

### PHASE 5: INTEGRATE (Claude Code 단독)

1. Codex 브랜치 전체 리뷰
2. integration 브랜치에 순서대로 병합
3. 전체 앱 통합 시뮬레이션 (end-to-end)
4. 발견된 오류: Claude Code가 직접 수정 또는 Codex에 재작업 지시
5. 통합 완료 → main에 PR 생성

### PHASE 6: DEPLOY

1. GitHub Pages 빌드 확인
2. 실제 URL 접속 테스트
3. `WORK_STATUS.md` 최종 상태 업데이트
4. `activity.log` 완료 기록

---

## 6. 충돌 방지 규칙

### 파일 충돌 방지
- locks.json 확인 없이 절대 파일 수정 금지
- 같은 파일 수정이 필요한 경우: Claude Code가 중재하여 순서 결정
- PR merge 전 반드시 integration 브랜치 최신 상태로 rebase

### 로직 충돌 방지
- 인터페이스 계약서에 정의된 함수명·파라미터·반환값은 변경 금지
- 변경이 필요할 경우: Claude Code에 요청 → 계약서 수정 → 양측 에이전트에 공지 후 작업

### 판단 우선순위
```
충돌·오류 발생 시:
1. 해당 에이전트가 자체 해결 시도 (30분 이내)
2. 해결 불가 → Claude Code에 에스컬레이션
3. Claude Code 판단으로 해결 불가 → 인간에게 보고 후 지시 대기
```

---

## 7. 비용 최적화 가이드라인

```
비용 최소화 원칙:

[Codex에 위임]
- 반복적 CRUD 패턴 코드
- API 호출 패턴 (fetch, axios 등)
- 데이터 변환 로직
- 단위 테스트 생성
- CSS 반응형 미디어쿼리

[Claude Code가 담당]
- 아키텍처 결정 (1회)
- OAuth 인증 흐름 (복잡 로직)
- 통합 오류 디버깅
- 코드 리뷰 (모듈 완료 후 1회)
- 최종 배포 확인

[토큰 절약 방법]
- Codex 작업 지시는 인터페이스 계약서를 참조하게 하여 컨텍스트 반복 방지
- Claude Code 리뷰는 diff 기준으로만 수행
- activity.log는 요약 형태로 기록 (전체 코드 반복 금지)
```

---

## 8. 에스컬레이션 매트릭스

| 상황 | 1차 대응 | 2차 대응 | 최종 |
|------|---------|---------|------|
| 모듈 구현 오류 | 해당 에이전트 자체 수정 | Claude Code 수정 | 인간 보고 |
| 인터페이스 불일치 | Claude Code 중재 | 계약서 개정 후 재작업 | 인간 보고 |
| lock 충돌 | 선점 에이전트 우선 | Claude Code 순서 결정 | - |
| API 인증 실패 | 토큰 갱신 시도 | config.js 확인 | 인간 보고 |
| 배포 실패 | Claude Code 로그 분석 | 이전 커밋으로 롤백 | 인간 보고 |

---

## 9. 프로젝트 적용 방법

새 프로젝트 시작 시 이 프로토콜을 적용하는 절차:

```bash
# 1. 저장소에 프로토콜 추가
cp CLAUDE-CODEX-PROTOCOL.md [new-project]/

# 2. 상태 디렉토리 초기화
mkdir -p [new-project]/.ai-status
mkdir -p [new-project]/.ai-interfaces
echo '{"locks":[],"last_updated":""}' > [new-project]/.ai-status/locks.json
touch [new-project]/.ai-status/activity.log
touch [new-project]/.ai-status/next-actions.md

# 3. 프로젝트별 작업지시서 작성
# [project-name].md 생성 (이 프로토콜 참조)

# 4. PHASE 1 시작 — Claude Code에 지시
# "[project-name].md를 읽고 PHASE 1 PLAN을 시작하라"
```

---

*Protocol Version: 1.0 | 작성: 2026-06-06 | 주관: Claude Code*
*다음 버전 업데이트 기준: 3개 프로젝트 적용 후 회고를 통해 개정*
