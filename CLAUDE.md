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
| `award.html` | 상장 메일머지 출력기 — 배경(JPG/PNG/PDF) 위 WYSIWYG 편집(글상자·`{{항목}}`·정렬·실행취소), 엑셀 양식 생성/업로드, 3분할(양식/데이터/미리보기) 접기·폭 조절, 인쇄·PDF, 발급 이력·양식 버전. Supabase `awd` 스키마 + `public.award_*` RPC(`db/award_schema.sql`, 설치 `db/README_award.md`), 관리자 비밀번호 로그인, 한글·영문·한영 병기(글상자별 `en`, 데이터 `항목@en`), 회전·반전·그룹·레이어·눈금자·안내선, 발급번호 규칙(`page.num`), 위조 방지 인증번호·QR·발급 대장(`db/award_schema_2.sql`, 공개 확인 `award-verify.html`), QR 확인 문구(`page.verify` 문구·항목별 공개/가림/숨김, 조회 횟수·불일치 신고·의심 표시, `db/award_schema_7.sql`, `AW.Output.verifyDialog`), QR 건별 조회 기록(시각·IP 해시·기기, 접속지 수 의심 표시, `db/award_schema_8.sql`)·의심 이미지 대조(`award-forensic.js` `AW.Forensic`: 원본 재현 겹쳐 보기·차이 보기, EXIF·PNG 편집 프로그램 흔적·ELA — 자동 판정 없음), AI 영문 번역·연결 점검(`award-ai.js`, config.js AI 설정 재사용). 내 글꼴 서버 저장(`db/award_schema_3.sql`, `AW.customFonts`). 오른쪽 사이드바(레이어·속성·색상·작업 기록, `award-side.js`), 작업 단계 표시줄(`app.js`), 되돌리기(요소·용지·배경 포함), 배경 양식 라이브러리·학교 색(`db/award_schema_5.sql`), 모아찍기 출력(1/2·1/4), 전체/그룹/선택 잠금, 작업(월별·건별 데이터 `AW.Job`, `db/award_schema_6.sql`)·이력 출력 화면 다시 보기, 직인 포함 배경 합성 등록(`E.flattenBg`), 엑셀 양식 받기 전 항목 형식(숫자 자릿수) 판독·확정 팝업(`D.downloadTemplate`, `field.fmt`)과 업로드 시 자릿수 보정, 현재 양식 복제, 스마트 가이드(용지 가운데 자석·「가운데」 표시, 개체 간 같은 간격 막대·mm 표시·자석, 크기 조절 자석, 안내선 사이 간격 표시), 몰기·간격 지정 배치, P 키 개체 속성 창(`E.propDialog`), 표(`award-table.js` `AW.Table`: 가로×세로 칸·줄 입력, 선 두께·종류·색을 방향별(바깥·안쪽·위·아래·좌·우)로 지정, 셀 합치기·나누기, 줄·칸 넣기·지우기, 칸 경계 끌어서 너비·높이 조절, 셀 안 `{{항목}}` 메일머지·조사 보정, **F5 = 셀 선택 → 한 번 더 = 표 전체 → 한 번 더 = 해제**, 화살표·Tab·Enter·Del·Esc, 선택 후 **P = 표 속성**, 글이 길면 줄 높이 자동 늘림(`e.auto`), 표 서식 저장·불러오기, 엑셀·메모장 복사·붙여넣기(칸·줄 자동 확장); 모든 개체의 P = 위치·크기·투명도 속성), 한 글자 단축키(T 글상자·R 사각형·L 선·B 표)·스페이스+끌기 화면 이동·마우스 올림 크기 표시, 저장 실패 시 임시 보관 복구(`award_draft`), 상단 문서 탭(여러 양식 동시 열기·전환·끌어서 순서 변경·우클릭 메뉴·다른 탭 양식 합치기·탭 간 개체 복사 붙여넣기, `award-app.js`), 스캔본(JPG·PNG·PDF) → 양식 자동 생성(`award-scan.js`: 기울기·여백 보정·용지 맞춤, 이미지 분석(Otsu·연결 성분·XY-cut)으로 글자 줄·직인을 원본 위치 그대로 검출, AI는 번호 상자의 글자 읽기·분류만 담당, 영역 편집 화면(선택·범위선택·이동·크기·추가·묶기·레이어 순서), 글자만 지운 배경, 직인·로고 이미지 개체 분리, 글상자·메일머지 자동 배치, 여러 장·여러 쪽 PDF 일괄 처리). 파일: `award-core/editor/side/data/job/output/ai/scan/app.js`·`award.css`·`award-qr.min.js` |
| `budget.html` · `budget-qr.html` | 부서 예산안(세입·세출) 작성/검토 — Supabase `bgt` 스키마 + RPC(`db/budget_schema_1~4.sql`), 부서 비밀번호 로그인(Google 계정 불필요), 스카이 블루 토큰. **부서 입력판**(`budget-entry.html`·`budget-entry*.js`, `db/budget_schema_9.sql`, Edge Function `budget-ai`): 부서 선택→비밀번호(예산안 작성과 공용)→입력 화면 주소·바탕화면 바로가기·엑셀 양식 안내, 「올해 집행/내년 계획」×「세출/세입」 건별 입력(코드 입력 불필요) → 「AI로 코드 매칭하기」(기존 코드표 목만 선택, 미배정 없음, 낮은 신뢰도는 「확인 필요」) → 항목·지출에 자동 반영, 코드 Q&A, 같은 부서 동시 입력(줄 단위 버전·입력 중 표시·4초 변경 가져오기), 5분 자동 저장·저장 버튼, 변경 이력, 입학처 등 부서별 입력 기간은 관리자 「입력판」 탭(`bgt_ea_*`), 최종 확정 후 부서 잠금. 입력판 보강: 코드별 합계(같은 코드는 한 항목으로 합산 반영), 시험 주소 `?d=부서&test=1`(시험용 연도 1999, `bgt_e_test_reset`), 양식은 세출/세입·올해/내년 4시트, **조직 개편**(`db/budget_schema_10~11.sql`, `budget-org.js`, `db/budget_depts_2027.sql`): 부서 이름 변경(전 테이블 연동)·통합(흡수)·하위 편입·예약 적용(`bgt.reorg`, 적용일 이후 첫 접속에서 자동)·항목 이동·상위 조직/하위 팀 표시. **조직 개편 보강**(`db/budget_schema_12.sql`): 통합 시 이전 예산 「가져가기(carry)/남겨 두기(leave)」 선택, 적용 때 옮긴 행 id를 `result.moved`에 기록해 이름 변경·하위 편입·통합 모두 「되돌리기」(`bgt_a_reorg_undo`, 스키마 12 이전 통합은 불가), 부서 노출/비노출·▲▼ 순서 저장(`bgt_a_dept_order`). 입력판 화면은 탭 1줄 + 하단 고정 작업 바(C안). **금액 입력칸 천 단위 쉼표**(`budget-app.js` 전역 `input` 캡처 처리기 `AMT_SEL` — 새 금액 입력칸은 이 선택자에 맞추거나 클래스 `money` 사용)·엑셀 양식/출력 금액 열 `#,##0` 서식(`BW.xlsxMoney`), **AI 접속 상태등**(`budget-aistatus.js` `BudgetAiStatus`: 화면 열 때 자동 점검·「다시 접속 테스트」·실패 시 예산 관리자 연락처 안내, Edge Function `budget-ai` `mode:"ping"`, 소스 `supabase/functions/budget-ai/index.ts`), 관리자 화면 상단에 예산 관리자 연락처(`BW.ADMIN_CONTACT`) 상시 표시. **시험 링크 2종**(`db/budget_schema_13.sql`): ① 작성용 `budget-entry.html?d=부서&test=1`(시험 연도 1999) / ② 편성 완료 후 사용 `budget.html?test=1&d=부서`(시험 연도 1998, 최종 확정 상태 — 결재 QR·집행 반영 연습, `bgt_e_test_reset2`로 처음 상태 복귀). **지출 요청 복수 선택**(세출 줄의 코드·명칭 칸 클릭으로 복수 선택 → 하단 바 「지출 요청(QR)」 → 항목별 연간·기존 집행·잔여 실시간 계산, 복사 버튼 누르면 QR 발급(지출 대기) + 기안문(NNEditor)용 HTML 복사 `budget-clip.js` `BudgetClip`: QR 3cm·인라인 스타일 표, 시험 `budget-clip-demo.html`)·**결재 QR 집행 연동**(`db/budget_schema_5.sql`, `budget-ticket.js`·`budget-qr.js`): 기안 전 집행 예정 내역으로 QR 발급 → 결재 후 비로그인 스캔으로 결재번호(필수·중복 차단)와 금액 확인 후 1회만 `bgt.spend`에 반영, 재스캔은 「이미 반영된 내역」, 수정반영은 해당 부서·관리자 로그인+사유 필수, 귀속 미정은 미배정→관리자 배정(이관·미편성 신규·예비비 7.2.1), 모든 변경은 `bgt.ticket_events`에 영구 이력(수정·삭제 불가). **확정안(금액 3단)**(`db/budget_schema_6.sql`, `budget-final.js`): 전년 예산 → 부서 요구액(덮어쓰지 않음) → 확정안(`final_amount`, 사유 필수, `bgt.final_hist` 영구 이력), 자동 초안·세입세출 균형·임원 보고서 1쪽·엑셀, 부서 화면에는 최종 확정 전 비노출. **부서별 엑셀 양식**(`db/budget_schema_7.sql`·`budget_schema_8.sql`, `budget-xlsx.js`): 모든 부서(공통 포함) 동일 틀 — 세출·세입 각각 ① 올해 집행(수납) 구간(건별 집행 내역 시트 + 연말 추정) · ② 내년도 소요 구간(요구액·산출 근거·증감 사유), 입학처는 학년도(3월~익년 2월) 표기(환산 미구현). 부서별 xlsx/전체 ZIP → 부서 작성 → 관리자 일괄 업로드·미리 보기·원자적 반영(`bgt_a_lines_import`·`bgt_a_spend_import`) |
| `korean.html` | 한글 학습(34개월~) — 자모 ㄱ~ㅎ·ㅏ~ㅣ, 소리 찾기/첫소리/모양 맞추기(드래그)/낱말 조립/펜 쓰기, 보호자 메뉴(PIN), Supabase `kor` 스키마 + RPC(`db/korean_schema.sql`, 미적용 시 기기 로컬 저장), 남성 신경망 음성 mp3(`audio/korean`, `tools/korean_audio_gen.py`) |
| `aseasurvey.html` · `aseasurvey-admin.html` | 교내 **범용** 설문(교과목 평가·행사 만족도·교직원 설문 등 — 문항 형식 34종, 분기·퀴즈·정원·첨부·서명·주소·QR) — 학생 응답(`aseasurvey.html?c=<코드>`, 완전 익명·과목별 아코디언·추첨번호)과 관리자(설문 설계·과목/교수 엑셀 등록·실시간 결과·교수별 현황판·엑셀 출력·성실도 가중 추첨·AI 설계·테스트 모드). Supabase `svy` 스키마 + `public.svy_*` RPC(`db/survey_schema_1~12.sql`, 설치 안내 `db/README_survey.md`, 사용 안내 `db/GUIDE_survey_general.md`), 관리자 비밀번호 로그인, 공용 `aseasurvey-common.js`·`aseasurvey-types.js`(형식 카탈로그·검증)·`aseasurvey-form.js`(문항 렌더러, 학생·관리자·AI 미리보기 공용)/`aseasurvey.css`, 관리자 `aseasurvey-admin-q.js`(문항 편집기)·`-gresults.js`(일반 설문 결과)·`-ai.js`(AI 설계: 제안→확인·수정→만들기)·`-preview.js`(전 화면 실시간 학생 화면 미리보기 도크)·`-courseai.js`(과목·교수 AI 불러오기·반×과목 표)·`-courseview.js`(교수별/반별 보기)·`-guide.js`(진행 단계·다음 할 일·도움말), 기본 양식 `aseasurvey-template.js`, 새 설문 카드 갤러리용 분야별 양식 카탈로그(10분야 55종) `aseasurvey-catalog.js`, 양식 라이브러리(버전 관리·비교·편집→새 버전, `svy.tpl`/`tpl_ver` + `svy_tpl_*` RPC) `aseasurvey-admin-library.js`, 연동 목록 설문(일괄 xlsx 업로드·열 이름 `def.link`, 설계 화면·AI 설계·AI 추천) `aseasurvey-admin-link.js`, 문항 탭 AI 구간 설계·자문 `aseasurvey-admin-slot.js`, 배포 전 점검(규칙 점검 + AI 감사) `aseasurvey-admin-audit.js`, 양식별 진행 순서·탭 팁박스 `aseasurvey-admin-howto.js`, **비교 분석실**(결과 「분석」 메뉴의 `lab`: 하위/상위 응답 집단 비교·대상별 비교·요인 분해·순위 안정성 등 9개 도구, 슬라이더로 기준값 조절·추천값과 이유 팁박스, 계산은 브라우저 안에서만 — `aseasurvey-admin-lab.js`, 안내 `db/GUIDE_survey_general.md` 4-27), **영역별 무작위 성실 응답 확인**(`def.integrity`: 영역 끝에 확인 문항 `_I<영역ID>` 자동 삽입·학생마다 다른 요구값·과목 순환 배치·허용 실패 횟수, 계산은 `aseasurvey-common.js` `SVY.integ`, 학생 화면 `aseasurvey.js` `IP()`, 서버 검증 `db/survey_schema_12.sql`의 `svy.check_answers2` — 응답 `chk`와 `_I*` 키는 문항 정의에 없는 정상 키이므로 지우지 말 것) (과목별 반복 설문의 학생 화면 방식은 `def.view`: 없음=A 과목별 칸, `matrix`=B 질문별 표, 렌더러는 `SVY.Form.matrixHtml`; `def.link.hideProf`=true면 학생 화면·`svy_public`에서 교수명 제외, 결과 「비교」 탭은 `aseasurvey-admin-results.js`의 `viewCmp`, 「조건 검출」·「같은 과목」·「참여 현황」은 `aseasurvey-admin-insight.js`, 「계열별·반별·교수별·과목별 분석」(목록·정렬·리포트 PDF·ZIP·출력)은 `aseasurvey-admin-report.js`, 「종합 보고서」·「회차 비교」(`def.round.kind`)·「주제 연결」·「우선순위」는 `aseasurvey-admin-round.js`, 「개선 과제」(`svy.actions`, `db/survey_schema_11.sql`)는 `aseasurvey-admin-actions.js`, 여러 설문을 크롬 탭처럼 여는 작업 탭 바와 사용자 설정(`svya_tabs`·`svya_prefs`)은 `aseasurvey-admin-tabs.js`, 훅은 `aseasurvey-admin.js`의 `A.tabsHook`) (`A.link`는 설문 링크 함수이므로 모듈 객체명은 `A.linkdesign`) |

### Design System (schedule.html → applied to forum.html)

Use these CSS tokens for any new UI work:

```css
--primary:#1A73E8; --primary-dk:#1557B0; --primary-lt:#E8F0FE;
--green:#16a34a;   --green-lt:#dcfce7;
--orange:#ea580c;  --orange-lt:#ffedd5;
--red:#dc2626;     --red-lt:#fee2e2;
--r:6px;   /* border-radius for every box/button/card/modal/input — 6px repo-wide, no pill shapes */
--sh / --sh-md / --sh-lg  /* shadow scale */
```

Icons: inline SVG only — no emoji in UI. Theme picker (blue/green/orange swatches) is in the forum.html header and applies via `applyTheme()`. This `--r:6px` rounding + no-emoji rule applies to every HTML page in the repo (all boxes, buttons, inputs, cards, modals, result panels, report pages — including aseasurvey*, award*, forum, schedule, etc.), as set by the owner. Use `border-radius:var(--r)` (or 6px); never use larger values or pill shapes. Only true circles (avatars, status dots: `50%`) are exempt. New CSS must not introduce radii above 6px.

### forum.html key points

- Supabase anon key is public (RLS enforces access control)
- Admin session: `sessionStorage.getItem('forum_admin') === '1'`
- Admin email constant: `ADMIN_EMAIL = 'bangdw@gmail.com'`
- Category list: `['전체','일반','AI활용사례','질문','제안','트러블슈팅','공지']`
- Password hashing: `sha256(pw + 'asea-forum-v1')` stored in Supabase
- File uploads: Supabase Storage bucket `forum-files`

## Survey service conventions (owner's standing rules)

- **Every survey result view must offer file output by default**: Excel (`gxlsx`), PDF of the current view (`gpdf`) and print (`gprint`) are part of the common results toolbar in `aseasurvey-admin-gresults.js` and apply to every survey type (course-linked and 1-person-1-response). Any new survey type or result tab must keep these working; do not ship a result screen without export/print.
- Report generation (`aseasurvey-admin-report.js`): per-professor / per-class / per-track A4 PDFs (numeric internal report + qualitative delivery report), ZIP and print. AI analysis results, edits and overview text stay in the admin's browser (IndexedDB) — never save them to Supabase; send no names to the AI.
- Academic grounding (`theory/aseasurvey-theory.json`, `aseasurvey-admin-theory.js`): only entries whose bibliography matched Crossref/ERIC **and** whose finding was checked against the public abstract (evidence sentence must appear verbatim) may be added (`tools/theory_verify.py`, `tools/theory_build.py`, `theory/VERIFICATION.md`). AI may cite only the `id`s sent with the request; strip any other author-year text; internal reports carry footnotes, delivery (qualitative) reports carry no citations.
- In results, **5 is the best score** (positive = 4·5, negative = 1·2); "valid responses" = passed attention checks and not straight-lining.

## AI Collaboration Protocol

This project uses `CLAUDE-CODEX-PROTOCOL.md` for multi-agent workflows. Key files:
- `.ai-status/WORK_STATUS.md` — current task progress
- `.ai-status/locks.json` — file lock registry (prevent parallel edits)
- `.ai-interfaces/*.interface.md` — module interface contracts (function signatures must not change)

Claude Code is Tech Lead; Codex is Implementer. For solo Claude Code sessions, follow the same module interface contracts but skip the lock/log ceremony.

## Google Cloud Console (manual setup required)

OAuth Authorized JavaScript Origins must include `https://bangdw-hash.github.io` — this cannot be done in code. If `origin_mismatch` or `403` errors appear during Google login, that is the fix.
