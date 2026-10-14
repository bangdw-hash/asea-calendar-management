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
| `award.html` | 상장 메일머지 출력기 — 배경(JPG/PNG/PDF) 위 WYSIWYG 편집(글상자·`{{항목}}`·정렬·실행취소), 엑셀 양식 생성/업로드, 3분할(양식/데이터/미리보기) 접기·폭 조절, 인쇄·PDF, 발급 이력·양식 버전. Supabase `awd` 스키마 + `public.award_*` RPC(`db/award_schema.sql`, 설치 `db/README_award.md`), 관리자 비밀번호 로그인, 한글·영문·한영 병기(글상자별 `en`, 데이터 `항목@en`), 회전·반전·그룹·레이어·눈금자·안내선, 발급번호 규칙(`page.num`), 위조 방지 인증번호·QR·발급 대장(`db/award_schema_2.sql`, 공개 확인 `award-verify.html`), AI 영문 번역·연결 점검(`award-ai.js`, config.js AI 설정 재사용). 내 글꼴 서버 저장(`db/award_schema_3.sql`, `AW.customFonts`). 오른쪽 사이드바(레이어·속성·색상·작업 기록, `award-side.js`), 작업 단계 표시줄(`app.js`), 되돌리기(요소·용지·배경 포함), 배경 양식 라이브러리·학교 색(`db/award_schema_5.sql`), 모아찍기 출력(1/2·1/4), 전체/그룹/선택 잠금, 작업(월별·건별 데이터 `AW.Job`, `db/award_schema_6.sql`)·이력 출력 화면 다시 보기, 직인 포함 배경 합성 등록(`E.flattenBg`), 엑셀 양식 받기 전 항목 형식(숫자 자릿수) 판독·확정 팝업(`D.downloadTemplate`, `field.fmt`)과 업로드 시 자릿수 보정, 현재 양식 복제, 스캔본(JPG·PNG·PDF) → AI 양식 자동 생성(`award-scan.js`: 기울기·여백 보정, 용지 맞춤, AI 비전 글자 판독, 글자 지운 배경, 글상자·메일머지 자동 배치). 파일: `award-core/editor/side/data/job/output/ai/scan/app.js`·`award.css`·`award-qr.min.js` |
| `budget.html` | 부서 예산안(세입·세출) 작성/검토 — Supabase `bgt` 스키마 + RPC(`db/budget_schema_1~4.sql`), 부서 비밀번호 로그인(Google 계정 불필요), 스카이 블루 토큰 |
| `korean.html` | 한글 학습(34개월~) — 자모 ㄱ~ㅎ·ㅏ~ㅣ, 소리 찾기/첫소리/모양 맞추기(드래그)/낱말 조립/펜 쓰기, 보호자 메뉴(PIN), Supabase `kor` 스키마 + RPC(`db/korean_schema.sql`, 미적용 시 기기 로컬 저장), 남성 신경망 음성 mp3(`audio/korean`, `tools/korean_audio_gen.py`) |
| `aseasurvey.html` · `aseasurvey-admin.html` | 교내 **범용** 설문(교과목 평가·행사 만족도·교직원 설문 등 — 문항 형식 34종, 분기·퀴즈·정원·첨부·서명·주소·QR) — 학생 응답(`aseasurvey.html?c=<코드>`, 완전 익명·과목별 아코디언·추첨번호)과 관리자(설문 설계·과목/교수 엑셀 등록·실시간 결과·교수별 현황판·엑셀 출력·성실도 가중 추첨·AI 설계·테스트 모드). Supabase `svy` 스키마 + `public.svy_*` RPC(`db/survey_schema_1~10.sql`, 설치 안내 `db/README_survey.md`, 사용 안내 `db/GUIDE_survey_general.md`), 관리자 비밀번호 로그인, 공용 `aseasurvey-common.js`·`aseasurvey-types.js`(형식 카탈로그·검증)·`aseasurvey-form.js`(문항 렌더러, 학생·관리자·AI 미리보기 공용)/`aseasurvey.css`, 관리자 `aseasurvey-admin-q.js`(문항 편집기)·`-gresults.js`(일반 설문 결과)·`-ai.js`(AI 설계: 제안→확인·수정→만들기)·`-preview.js`(전 화면 실시간 학생 화면 미리보기 도크)·`-courseai.js`(과목·교수 AI 불러오기·반×과목 표)·`-courseview.js`(교수별/반별 보기)·`-guide.js`(진행 단계·다음 할 일·도움말), 기본 양식 `aseasurvey-template.js`, 새 설문 카드 갤러리용 분야별 양식 카탈로그(10분야 55종) `aseasurvey-catalog.js`, 양식 라이브러리(버전 관리·비교·편집→새 버전, `svy.tpl`/`tpl_ver` + `svy_tpl_*` RPC) `aseasurvey-admin-library.js`, 연동 목록 설문(일괄 xlsx 업로드·열 이름 `def.link`, 설계 화면·AI 설계·AI 추천) `aseasurvey-admin-link.js`, 문항 탭 AI 구간 설계·자문 `aseasurvey-admin-slot.js`, 배포 전 점검(규칙 점검 + AI 감사) `aseasurvey-admin-audit.js`, 양식별 진행 순서·탭 팁박스 `aseasurvey-admin-howto.js` (과목별 반복 설문의 학생 화면 방식은 `def.view`: 없음=A 과목별 칸, `matrix`=B 질문별 표, 렌더러는 `SVY.Form.matrixHtml`; `def.link.hideProf`=true면 학생 화면·`svy_public`에서 교수명 제외, 결과 「비교」 탭은 `aseasurvey-admin-results.js`의 `viewCmp`) (`A.link`는 설문 링크 함수이므로 모듈 객체명은 `A.linkdesign`) |

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
