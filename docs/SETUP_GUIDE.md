# ASEA 업무관리 — 전문가 수준 도달 작업: 사전 준비 가이드

> 이 문서는 **개발자(Claude)가 코드로 처리할 수 없는, 계정 소유자만 가능한 준비 작업**을 정리한 것입니다.
> 아래 A·B·C를 진행하시는 동안, 개발자는 **준비가 필요 없는 항목(공통 UX·프론트엔드)** 을 병렬로 개발합니다.

---

## ✅ 요약 — 당신이 해야 할 일 (난이도/소요)

| 순서 | 작업 | 필요 이유(해당 항목) | 난이도 | 예상 소요 |
|---|---|---|---|---|
| **A** | Supabase SQL 1회 실행 | 13·15·16·19·20·24·26·28 클라우드화 | ★☆☆ (붙여넣기) | 5분 |
| **B** | Supabase Storage 버킷 2개 | 27 자필서명·28 첨부 | ★☆☆ | 3분 |
| **C** | Supabase Edge Function 배포 + 키 등록 | 32 API 키 보안·14 OCR·22/29 알림 | ★★☆ | 15분 |
| **D** | Google Workspace OAuth 내부 게시 | 35 로그인 100명 한도 해제 | ★★☆ (관리자) | 10분 |
| **E** | (선택) 이메일/문자 발송 채널 | 22·29 자동알림 | ★★☆ | 선택 |
| — | Vercel | **불필요** (아래 설명) | — | — |

> **Vercel은 필요 없습니다.** 프런트는 GitHub Pages, 서버 기능은 Supabase Edge Function으로 충분합니다.
> (이미 GitHub Pages + Supabase 조합으로 운영 중이라 새 호스팅을 추가할 이유가 없습니다.)

---

## A. Supabase 테이블 생성 (5분)

1. https://supabase.com/dashboard → 프로젝트 **zbpeyklwpotjyveipzxd** 선택
2. 좌측 **SQL Editor** → **New query**
3. 이 저장소의 **`db/migrations.sql`** 전체 내용을 복사 → 붙여넣기 → **Run**
4. `Success. No rows returned` 이 보이면 완료
   - 생성되는 것: `account_settings`, `audit_log`, `snapshots`, `wayfind_points` + 기존 `app_submissions` 보강, RLS 정책

> 이 한 번으로 항목 13·15·16·19·20·24가 저장할 곳이 마련됩니다.

## B. Storage 버킷 (3분)

A의 SQL에 버킷 생성문이 포함되어 있어 자동 생성됩니다. 확인만 하세요:
- 좌측 **Storage** → 버킷 목록에 **`signatures`**, **`attachments`** (둘 다 Private)가 있는지 확인
- 없으면 **New bucket** 으로 같은 이름·Private 으로 직접 생성

## C. Edge Function 배포 — API 키 보안 (15분)

> 지금은 Claude/OCR/카카오 키가 빌드에 포함되어 브라우저에 노출될 수 있습니다.
> 아래로 키를 **서버(Edge)** 에 숨기고, 앱은 프록시만 호출하게 만듭니다.

PC 터미널에서(저장소 폴더 안):

```bash
# 1) Supabase CLI (Node 설치돼 있으면 npx로 바로 사용 가능)
npx supabase login                # 브라우저로 로그인
npx supabase link --project-ref zbpeyklwpotjyveipzxd

# 2) 비밀 키 등록 (가지고 계신 실제 키로 교체)
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
npx supabase secrets set CLOVA_OCR_SECRET=xxxxx
npx supabase secrets set CLOVA_OCR_URL=https://xxxx.apigw.ntruss.com/custom/v1/...
npx supabase secrets set KAKAO_API_KEY=xxxxx     # (카카오 알림 사용할 때만)

# 3) 배포
npx supabase functions deploy ai-proxy --no-verify-jwt
```

배포가 끝나면 알려주세요. 개발자가 앱의 Claude/OCR 호출을
`https://zbpeyklwpotjyveipzxd.supabase.co/functions/v1/ai-proxy` 로 전환합니다.

> 키가 아직 없다면: **Claude** = console.anthropic.com → API Keys,
> **Clova OCR** = Naver Cloud Platform, **카카오** = developers.kakao.com.

## D. Google OAuth 내부 게시 — 로그인 한도 해제 (10분, Workspace 관리자)

현재 "테스트" 상태면 100명 한도·재동의 경고가 생깁니다. 사내 전용으로 바꾸면 해결됩니다.

1. https://console.cloud.google.com → 해당 프로젝트
2. **API 및 서비스 → OAuth 동의 화면**
3. User type 이 **내부(Internal)** 인지 확인 (조직 계정이면 내부 권장)
   - 외부로 되어 있고 사내만 쓴다면 **내부**로 변경
4. 게시 상태가 **테스트** 면 **앱 게시(PUBLISH)** → 내부는 검수 없이 적용

> 내부 게시면 같은 Workspace(@asea.or.kr) 사용자는 한도·재동의 없이 바로 로그인됩니다.

## E. (선택) 이메일/문자 자동 발송 채널

항목 22(대관 승인 알림)·29(이메일/문자)에 실제 발송이 필요할 때만:
- **이메일**: Google Workspace 계정의 Gmail API(이미 일부 사용) 또는 Apps Script
- **문자/알림톡**: 카카오 알림톡(C에서 키 등록) 또는 외부 문자 API
- 어떤 채널을 쓸지 정해서 알려주시면 그에 맞춰 연동합니다.

---

## 🔧 개발자가 지금 병렬로 진행하는 것 (준비 불필요)

아래는 위 준비와 **무관하게** 바로 개발되는 공통·프런트 항목입니다.

- **공통 플랫폼 레이어**(platform.js/css) — 이미 추가됨
  - 외부링크 안전이동(1) · Undo 토스트(2) · 저장상태 표시(3) · 스켈레톤/빈상태(4)
  - 명령 팔레트 ⌘K(5) · 오프라인 큐(6) · 다크모드·글자크기(7) · 접근성(8) · 코치마크(9)
- 각 모듈에 위 공통기능을 연결(캘린더 Undo·저장상태, 폼 미저장 경고 등)
- 클라우드 항목(13·15·16·19·20·24·26·28·31·32)은 **A~C 완료 후** 코드에서 스위치를 켜 연결합니다.

---

## 진행 순서 제안

1. (지금) 개발자: 공통 레이어 + 무료 항목 개발/배포
2. (당신) A → B → C → D 진행, 완료 시마다 한 줄로 알려주기
3. 각 준비가 끝나는 대로 개발자가 해당 클라우드 항목을 순차 연결·배포
4. 마지막에 E(발송 채널) 결정 → 알림 자동화 마무리
