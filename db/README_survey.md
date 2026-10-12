# 교내 설문(aseasurvey) DB 설치 안내

대상 Supabase 프로젝트: `zbpeyklwpotjyveipzxd` (기존 테이블은 변경하지 않습니다. 새 `svy` 스키마와 `public.svy_*` 함수만 추가)

## 현재 적용 상태 (2026-10-12 기준, 자동 적용 중 시간 초과·취소로 일부 미적용)

| 파일 | 내용 | 상태 |
|---|---|---|
| `survey_schema_1.sql` | 테이블 · RLS · 내부 함수 | 적용 완료 |
| `survey_schema_2.sql` | 응답 검증 · 학생용 RPC (`svy_ping`, `svy_public`, `svy_submit`, `svy_draw_check`) | 적용 완료 |
| `survey_schema_3.sql` | 관리자 RPC | **일부만 적용** |
| `survey_schema_4.sql` | 테스트 모드 · 결과 초기화 | **미적용** |
| 관리자 비밀번호 | `svy.secret.admin_hash` | 적용 완료 (초기값은 별도 안내, 저장소에는 기록하지 않음) |

`survey_schema_3.sql` 중 적용된 함수: `svy_a_login`, `svy_a_logout`, `svy_a_change_pw`, `svy_a_health`, `svy_a_list`, `svy_a_get`, `svy_a_version_get`
미적용 함수: `svy_a_create`, `svy_a_save`, `svy_a_delete`, `svy_a_courses_save`, `svy_a_course_delete`, `svy_a_targets_save`, `svy_a_results`, `svy_a_response_flag`, `svy_a_draw`, `svy_a_draw_edit`, `svy_a_draw_publish`, `svy_a_draw_delete`, `svy_a_claim_check`, `svy_a_claim_set`, `svy_a_log`, 실행 권한 블록

## 수동 설치 순서 (Supabase 대시보드 → SQL Editor)

모든 SQL은 여러 번 실행해도 안전합니다. 파일마다 **새 쿼리**로 실행하십시오. 붙여넣기가 잘리면 함수 단위로 나누어 실행해도 됩니다.

1. `survey_schema_3.sql` 전체 실행 (이미 적용된 함수는 덮어쓰기됩니다)
2. `survey_schema_4.sql` 전체 실행
3. 설치 확인

```sql
select count(*) filter (where proname like 'svy\_a\_%') as admin_fn,
       count(*) filter (where proname in ('svy_ping','svy_public','svy_submit','svy_draw_check')) as public_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
-- 기대값: admin_fn = 23 (survey_schema_4 적용 후), public_fn = 4
select column_name from information_schema.columns
 where table_schema = 'svy' and ((table_name = 'surveys' and column_name = 'test_mode') or (table_name = 'responses' and column_name = 'is_test'));
-- 기대값: 2행
```

설치 후 관리자 화면(`aseasurvey-admin.html`)의 **「DB 연결 테스트」** 버튼으로 함수·테이블 수와 응답 속도를 한 번에 확인할 수 있습니다.

## 관리자 비밀번호 변경 / 재설정

화면의 「비밀번호 변경」을 사용하거나, 분실 시 SQL Editor에서 실행합니다.

```sql
update svy.secret
   set admin_hash = extensions.crypt('<새 비밀번호>', extensions.gen_salt('bf')), admin_fail = 0, admin_locked_until = null
 where id = 1;
```

## 보안 구조

- 모든 테이블은 `svy` 스키마(API 비노출) + RLS 활성 + `anon`/`authenticated` 권한 회수. 브라우저는 `public.svy_*` RPC(SECURITY DEFINER)만 호출합니다.
- 관리자 로그인 후 12시간 토큰(해시로 저장)을 서버가 검증하며, 5회 실패 시 15분 잠금됩니다.
- 응답에는 학번·이름·IP를 저장하지 않습니다(완전 익명). 중복 제출은 기기 토큰으로만 제한합니다.

## 무료 플랜 유의사항

- 7일간 활동이 없으면 프로젝트가 일시정지됩니다. 설문 배포 전 「DB 연결 테스트」로 활성 상태를 확인하십시오.
- 자동 백업이 없으므로 마감 후 엑셀로 원자료를 내려받아 보관하십시오.

## 초기화

개발 중 데이터를 비우려면 관리자 화면의 「테스트 모드 → 결과 초기화」를 사용하십시오. 전체 삭제가 필요하면 `drop schema svy cascade;` 후 `public.svy_*` 함수를 삭제하고 1~4를 다시 실행합니다(운영 중 실행 금지).
