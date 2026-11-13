# ASEA 교직원 공동 개발 저장소 운영 계획
2026-11-13 개정: 기존 '10개 독립 저장소' 계획은 폐기하고 단일 저장소 방식으로 변경.

## 대상
학교 소유 GitHub 계정의 별도 저장소 `asea-develop` 하나에 교직원 10명을 공동 작업자로 초대한다.
기존 `asea-calendar-management`는 운영용으로 유지하고 코드 변경을 하지 않는다.

## 저장소 권장 구조
- README.md: 이용 안내 및 작업 규칙
- common/DESIGN_SYSTEM.md: 공통 디자인 기준
- common/AGENTS.md: AI 개발 지침
- common/css/tokens.css: 공통 CSS 변수
- training/week-01/LEARNER_GUIDE.md: 1차 교육 자료
- projects/staff-01/ ~ projects/staff-10/: 개인별 실습 공간 (각 폴더 README.md로 초기화)

## 협업 규칙
1. 교직원 10명의 GitHub 사용자명을 확인하여 공동 작업자로 초대한다.
2. 각자 배정된 폴더만 수정한다. 일반 GitHub collaborator 권한은 폴더 단위로 제한되지 않는다.
3. 각자 개인 브랜치에서 작업하고 Pull Request로 main에 병합한다.
4. API 키, 비밀번호, 학생·교직원 개인정보는 저장소에 넣지 않는다.
5. 공개 여부는 관리자와 협의하여 정한다. GitHub Pages는 별도 배포 설정이 필요하다.

## 진행 상태
- 기존 운영 저장소의 공통 디자인 및 1차 교육자료 작성: 완료
- 단일 `asea-develop` 저장소 생성: 미완료 (현재 연결된 GitHub 도구에 생성 기능 없음)
- 공동 작업자 10명 초대: 미완료
- 교육자료를 신규 저장소에 복사: 미완료
- AI 활용 포럼 공지 게시: 미완료

## 포럼 공지 반영 문장
이번 교육의 공통 개발 공간은 학교 GitHub 계정의 `asea-develop` 저장소로 통일합니다. 공통 디자인 및 AI 개발 지침은 `common` 폴더, 주차별 교육자료는 `training` 폴더에서 확인할 수 있도록 준비할 예정입니다. 교직원별 실습은 `projects/staff-01`부터 `staff-10`까지 배정된 폴더에서 진행합니다. 저장소가 개설되고 초대가 완료되면 접속 주소를 안내하겠습니다.
