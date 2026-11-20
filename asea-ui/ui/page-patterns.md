# 05. 페이지 패턴 (64개 페이지 실측 분류 + 설문 관리자 하위 화면)

64개 페이지를 모두 렌더링해 비교한 결과입니다. 페이지별 실측은 `docs/page-inventory.md`.

## A. 페이지 뼈대 — 상단 영역 실측 분류 (2026-11-20, 1100px 화면에서 첫 화면 상단 막대 측정)

| # | 패턴 | 실측 값 | 해당 페이지 |
|---|---|---|---|
| 1 | **흰 헤더 48~66px** (survey형, 가장 많음) | 배경 `#FFF`, 높이 48/50/52/56/57/59/66 | survey 56 · schedule 50 · blog 48 · helpdesk 56 · korean 56 · map 67 · parking 56 · parking-history 56 · reservation 56 · share 57 · report_weekly 52 · aseasurvey·admin 59 · budget-entry·qr 66 · dormitory/beta 56 |
| 2 | **주색 단색 헤더** | `#1A73E8`, 높이 58~89 | forum 65 · park 58 · calendar-share 89 |
| 3 | **파랑 그라데이션 머리말** | `linear-gradient(135deg, #1557B0→#1A73E8)` 등, 높이 43~141 | amulbo 141 · promo-public 126(`#003087→#1A73E8`) · tasks-window 43 · changong-judge 55(`#1E3A5F→#1A73E8`) · drawing 75(`#1A73E8→#7C3AED`) |
| 4 | **네이비 단색 막대(서식·계약)** | `#1A3A5C`(rgb 26,58,92) 높이 76~83, 계약 서명 `#1E3A5F` 64 | hr-form 83 · retire-form 83 · form 77 · contract-verify 76 · contract-sign 64 · privacy `#1E3A8A` 145 |
| 5 | **짙은 남색 그라데이션(평가·보고)** | `linear-gradient(100deg,#16324F,#1F4A75)` 높이 48 | assessment · report |
| 6 | **다크 스테이지(투명 막대)** | 배경 `#050B1A`/`#000`, 머리말은 위→투명 그라데이션 | changong-stage · changong-vote · changong-result |
| 7 | **상단 막대 없음(앱형·로그인 진입)** | 첫 화면이 로그인 카드/본문 | award · budget · task · room · room-admin · docgate · docgate-admin · whiteboard · checkin · deadline · facility-request · wayfind · kiosk · index · staff-calendar · dormitory/(resident·complaint·staff·contract-sign) 등 |

본문 바탕색은 `#F8F9FB`(회색, 가장 흔함) · `#F0F9FF`(스카이 계열: 설문·예산·상장·달력) · `#F4F6FA`(task·room) · `#050B1A`(스테이지)로 갈립니다.

패턴 1이 `ui-kit`의 기본형입니다. 나머지는 헤더만 교체해 키트 위에 얹습니다.

## B. 패턴별 키트 적용법

1. **흰 헤더**: gallery.html 구조 그대로.
2. **주색 단색 헤더**: `.ux-header`에 `background:var(--ux-accent); color:#fff; border:0` 추가, 아이콘·로고 흰색.
3. **그라데이션 머리말**: `<header>`에 `background:linear-gradient(135deg,var(--ux-accent-dk),var(--ux-accent))`, 높이는 내용에 맞게. 카드는 `.ux-card.hover`.
4. **네이비 막대**: 막대 배경만 `#1A3A5C`로 교체, 본문 폼은 `.ux-card` + 단계 `.ux-steps`(서식·계약처럼 단계형 입력).
5. **짙은 남색 그라데이션**: 평가·보고용. `linear-gradient(100deg,#16324F,#1F4A75)`.
6. **다크 스테이지**: `<html data-theme="dark">` + 글자 배율 1.2~1.6(`UX.uiscale`), 머리말은 위→투명 그라데이션.
7. **앱형**: 로그인 카드(`.ux-card.soft` + `.ux-field` + `.ux-btn.primary.block.touch`, 높이 100vh 가운데 정렬) → 로그인 후 본 화면. 모바일 앱형은 `.ux-bottombar`를 `position:fixed`로 바꿔 하단 내비로 쓰고 `padding-bottom: env(safe-area-inset-bottom)`을 줍니다.
8. **표 중심(budget·finance)**: `.ux-kpis` → `.ux-table-wrap` → `.ux-bottombar`(합계·저장).
9. **목록+칩(helpdesk·reservation·달력)**: 필터는 `.ux-seg`/`.ux-chip`, 상세는 `UX.drawer`.

## C. 설문 관리자(aseasurvey-admin) 하위 화면 디자인

해시 경로: `#/new`(새 설문 카드 갤러리), `#/library`(양식 라이브러리), `#/link`(연동 목록), `#/s/<id>/<탭>`(설문별 탭).

| 화면 | 구성 요소 | 키트 대응 |
|---|---|---|
| 설문 목록 | 카드 목록 + 상태 칩 + 검색 | `.ux-card.hover`, `.ux-chip` |
| 새 설문 갤러리 | 10분야 55종 양식 카드 | `.ux-grid` + `.ux-card.hover` |
| 설계(문항 탭) | 편집 카드, 종류 34종 선택, 분기·퀴즈 설정, 드래그 정렬, 접기 | `.ux-ed-card`, `UX.dragSort`, `UX.collapse` |
| AI 설계 | 제안→확인·수정→만들기 3단 | `.ux-steps`, `.ux-alert` |
| 학생 화면 미리보기 도크 | 오른쪽 고정 실시간 미리보기 | `UX.drawer` 변형(고정) |
| 진행 단계·다음 할 일 | 상단 단계 표시줄 + 도움말 | `.ux-steps` |
| 결과 | KPI → 분석 메뉴 → 표·그래프 → 엑셀/PDF/인쇄 | 03 문서 |
| 비교 분석실 | 도구 9개, 슬라이더, 추천값 팁박스, 산점도·분포 | `.ux-tip`, SVG |
| 작업 탭 바 | 크롬형 탭(여러 설문 열기, 우클릭 메뉴) | `.ux-tabs` 변형 |
| 배포 전 점검 | 규칙 점검 + AI 감사 결과 목록 | `.ux-alert` 목록 |

## D. 하위 시스템 디자인 메모

| 영역 | 특징 |
|---|---|
| 상장 편집기(award) | 3분할(양식/데이터/미리보기) 접기·폭 조절, 오른쪽 사이드바(레이어·속성·색상·작업 기록), 눈금자·안내선·스마트 가이드, 문서 탭, 표 편집기 |
| 예산(budget) | 스카이블루 토큰(`#0EA5E9`), 부서 입력판, 표 중심, 금액 입력 쉼표, AI 상태등, 결재 QR |
| 업무진행(task) | 칸반(232px 열)·타임라인(이름 열 190px 고정)·표·서랍·모달·점수 버튼 |
| 업무방(room) | 링크형 접근, 4단계 칸반, 변경 피드, 자료실 미리보기 |
| 수업 노트(whiteboard) | 교수자 패널 접이식·폭 조절, 학생 도움 요청 대화(말풍선·읽음·입력 중), 전체화면 발표 |
| 서류(docgate) | 윈도우 탐색기형(트리·주소줄·다중 선택·우클릭·F2·Del·Ctrl+Z·드래그 이동) |
| 한글 학습(korean) | 큰 터치 영역, 음성 mp3, 보호자 PIN |
| 기숙사·계약 | 네이비 셸, 서명 패드, 단계형 폼 |

## E. 새 페이지 체크리스트

- [ ] 모서리 6px·이모지 없음·인라인 SVG
- [ ] `ui-kit.css` 연결, 본문 `class="ux"`
- [ ] 헤더 56px(sticky), 테마 스와치(필요 시)
- [ ] 입력 포커스 링, 필수·오류 표시
- [ ] 저장 상태 표시 + 자동 저장 또는 명시적 저장 버튼
- [ ] 삭제 → 되돌리기 토스트
- [ ] 표 숫자 오른쪽 정렬·tabular-nums, 머리 고정
- [ ] 결과 화면이면 엑셀·PDF·인쇄
- [ ] 모바일 640px 확인(버튼 44px)
- [ ] 다크·모션 줄이기·키보드 이동 확인
