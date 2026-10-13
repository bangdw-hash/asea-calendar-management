# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ASEA Calendar Management is a **static web app** (zero build step, zero test runner) deployed via GitHub Pages at `https://bangdw-hash.github.io/asea-calendar-management/`. All files are served as-is — edit, commit, push, and GitHub Pages picks it up automatically.

Owner: `bangdw@gmail.com` (ADMIN_EMAIL in forum.html, senderEmail in config.js)
Supabase project: `zbpeyklwpotjyveipzxd` (used by forum.html only)

## Deployment

```bash
# No build step. Deploy = push to main.
git add <files>
git commit -m "..."
git push origin main
```

**PR workflow**: The owner prefers that Claude Code creates a PR for any feature branch, then auto-merges it once CI (GitHub Pages build) passes. Do this proactively — create PR → ready for review → merge — without waiting for confirmation.

## Architecture

The project is a collection of independent SPAs sharing one Google OAuth flow (`auth.js`, `config.js`).

### Core Google-API app (`index.html` + JS modules)

Script load order matters — each module exposes itself via `window.*`:

```
config.js → auth.js → calendar.js, drive.js → gmail.js, report.js → app.js
```

Module pattern (IIFE + window exposure):
```javascript
'use strict';
(function () {
  window.ExampleModule = {
    method: async function(param) {
      var token = Auth.getToken();
      if (!token) throw new Error('인증이 필요합니다');
      // ...
    }
  };
})();
```

Rules: never throw on empty array/null responses (return `[]`); throw `Error` objects on API errors (no `console.error`); always null-check `Auth.getToken()`.

### Standalone SPAs

Each HTML file is self-contained (CSS + JS inline or in same-name `.js`/`.css` files):

| File | Purpose |
|------|---------|
| `forum.html` | AI 활용 포럼 — Supabase JS v2, Quill rich text editor, RLS |
| `schedule.html` | 일정 관리 — design reference for color system and icons |
| `checkin.html` | 체크인 — GAS proxy backend |
| `dormitory/` | 기숙사 관리 — resident, complaint, contract-sign pages |
| `facility-request.html` | 시설 요청 |
| `wayfind.html` | 교내 길찾기 |
| `assessment.html` | 역량 평가 |
| `budget.html` | 부서 예산안(세입·세출) 작성/검토 — Supabase `bgt` 스키마 + RPC(`db/budget_schema_1~4.sql`), 부서 비밀번호 로그인(Google 계정 불필요), 스카이 블루 토큰 |
| `korean.html` | 한글 학습(34개월~) — 자모 ㄱ~ㅎ·ㅏ~ㅣ, 소리 찾기/첫소리/모양 맞추기(드래그)/낱말 조립/펜 쓰기, 보호자 메뉴(PIN), Supabase `kor` 스키마 + RPC(`db/korean_schema.sql`, 미적용 시 기기 로컬 저장), 남성 신경망 음성 mp3(`audio/korean`, `tools/korean_audio_gen.py`) |
| `aseasurvey.html` · `aseasurvey-admin.html` | 교내 **범용** 설문(교과목 평가·행사 만족도·교직원 설문 등 — 문항 형식 34종, 분기·퀴즈·정원·첨부·서명·주소·QR) — 학생 응답(`aseasurvey.html?c=<코드>`, 완전 익명·과목별 아코디언·추첨번호)과 관리자(설문 설계·과목/교수 엑셀 등록·실시간 결과·교수별 현황판·엑셀 출력·성실도 가중 추첨·AI 설계·테스트 모드). Supabase `svy` 스키마 + `public.svy_*` RPC(`db/survey_schema_1~8.sql`, 설치 안내 `db/README_survey.md`, 사용 안내 `db/GUIDE_survey_general.md`), 관리자 비밀번호 로그인, 공용 `aseasurvey-common.js`·`aseasurvey-types.js`(형식 카탈로그·검증)·`aseasurvey-form.js`(문항 렌더러, 학생·관리자·AI 미리보기 공용)/`aseasurvey.css`, 관리자 `aseasurvey-admin-q.js`(문항 편집기)·`-gresults.js`(일반 설문 결과)·`-ai.js`(AI 설계: 제안→확인·수정→만들기)·`-preview.js`(전 화면 실시간 학생 화면 미리보기 도크)·`-courseai.js`(과목·교수 AI 불러오기·반×과목 표)·`-courseview.js`(교수별/반별 보기)·`-guide.js`(진행 단계·다음 할 일·도움말), 기본 양식 `aseasurvey-template.js`, 새 설문 카드 갤러리용 분야별 양식 카탈로그(10분야 54종) `aseasurvey-catalog.js`, 양식 라이브러리(버전 관리·비교·편집→새 버전, `svy.tpl`/`tpl_ver` + `svy_tpl_*` RPC) `aseasurvey-admin-library.js`, 연동 목록 설문(일괄 xlsx 업로드·열 이름 `def.link`, 설계 화면·AI 설계·AI 추천) `aseasurvey-admin-link.js`, 문항 탭 AI 구간 설계·자문 `aseasurvey-admin-slot.js`, 배포 전 점검(규칙 점검 + AI 감사) `aseasurvey-admin-audit.js`, 양식별 진행 순서·탭 팁박스 `aseasurvey-admin-howto.js` (`A.link`는 설문 링크 함수이므로 모듈 객체명은 `A.linkdesign`) |

### Design System (schedule.html → applied to forum.html)

Use these CSS tokens for any new UI work:

```css
--primary:#1A73E8; --primary-dk:#1557B0; --primary-lt:#E8F0FE;
--green:#16a34a;   --green-lt:#dcfce7;
--orange:#ea580c;  --orange-lt:#ffedd5;
--red:#dc2626;     --red-lt:#fee2e2;
--r:12px;  /* border-radius — no pill shapes */
--sh / --sh-md / --sh-lg  /* shadow scale */
```

Icons: inline SVG only — no emoji in UI. Theme picker (blue/green/orange swatches) is in the forum.html header and applies via `applyTheme()`. This `--r:12px` rounding + no-emoji rule applies to every HTML page in the repo, not just forum.html/schedule.html — enforced repo-wide as of the reservation.html/index.html design pass.

### forum.html key points

- Supabase anon key is public (RLS enforces access control)
- Admin session: `sessionStorage.getItem('forum_admin') === '1'`
- Admin email constant: `ADMIN_EMAIL = 'bangdw@gmail.com'`
- Category list: `['전체','일반','AI활용사례','질문','제안','트러블슈팅','공지']`
- Password hashing: `sha256(pw + 'asea-forum-v1')` stored in Supabase
- File uploads: Supabase Storage bucket `forum-files`

## AI Collaboration Protocol

This project uses `CLAUDE-CODEX-PROTOCOL.md` for multi-agent workflows. Key files:
- `.ai-status/WORK_STATUS.md` — current task progress
- `.ai-status/locks.json` — file lock registry (prevent parallel edits)
- `.ai-interfaces/*.interface.md` — module interface contracts (function signatures must not change)

Claude Code is Tech Lead; Codex is Implementer. For solo Claude Code sessions, follow the same module interface contracts but skip the lock/log ceremony.

## Google Cloud Console (manual setup required)

OAuth Authorized JavaScript Origins must include `https://bangdw-hash.github.io` — this cannot be done in code. If `origin_mismatch` or `403` errors appear during Google login, that is the fix.
