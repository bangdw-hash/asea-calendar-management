# 교내 설문(aseasurvey) DB 설치 안내 — 한 번에 끝내기

> 방시원님이 직접 하실 일은 **아래 1~4번(약 3분)** 입니다. SQL은 한 덩어리로 붙여넣기만 하면 됩니다.
> 여러 번 실행해도 안전합니다(이미 설치된 부분은 덮어쓰기됩니다).

## 현재 상태 (2026-10-12)

| 구분 | 상태 |
|---|---|
| 테이블·학생용 기능(1·2단계) | 설치 완료 |
| 관리자 비밀번호 | 설정 완료 |
| 관리자 기능, 테스트 모드(3·4단계) | 설치 완료(2026-10-12 확인) |
| 성실도 가중 추첨(5단계) | **미설치 → 아래 SQL 전체를 실행** |

---

## 1. SQL Editor 열기

1. 브라우저에서 아래 주소로 이동합니다(Supabase 로그인 필요).
   `https://supabase.com/dashboard/project/zbpeyklwpotjyveipzxd/sql/new`
2. 또는 Supabase 대시보드 → 프로젝트 `zbpeyklwpotjyveipzxd` → 왼쪽 메뉴 **SQL Editor** → **+ New query**

## 2. 아래 SQL 전체를 복사해서 붙여넣고 Run

- 아래 코드 블록의 **처음부터 끝까지 전부** 복사합니다. (3·4단계는 이미 설치되어 5단계 SQL만 실행하면 됩니다.) (약 12KB)
- 편집기에 붙여넣고 오른쪽 아래 **Run**(또는 Ctrl+Enter)을 누릅니다.
- 「destructive operations」 확인창이 뜨면 **Run this query**를 누릅니다. (권한 정리 구문 때문이며 데이터 삭제는 없습니다.)

**기대 결과**: 결과 영역에 `Success. No rows returned` 가 표시됩니다.

```sql
-- 교내 설문 스키마 5/5: 성실도 가중 추첨 (입력 시간 · 성실응답 · 서술형 작성량 반영)
-- 1~4 적용 후 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--  * 추첨 풀 계산은 svy.draw_pool 한 곳에서만 합니다(미리보기와 실제 추첨이 항상 같은 기준).
--  * 자격 제외: 관리자 제외 / 번호 제외 / 성실응답 점검 실패 / 전 문항 동일 응답 / 입력 시간 부족 / 서술형 부족
--  * 가중치 = 기본점수 + 시간점수 x 시간가중 + 서술점수 x 서술가중   (시간·서술점수는 0~1)
--      시간점수 = (과목당 입력 초 - 최소 초) / (충분 초 - 최소 초)   0~1
--      서술점수 = 서술형 글자 수 / 충분 글자 수                       0~1
--  * 추첨은 가중치 비례 무작위 추출(비복원, Efraimidis-Spirakis)입니다.

alter table svy.surveys add column if not exists draw_cfg jsonb not null default '{}'::jsonb;

create or replace function svy.draw_pool(p_survey uuid, p_cfg jsonb, p_exclude text[] default '{}')
returns table (o_ticket text, o_track text, o_grade text, o_klass text, o_courses int, o_duration int, o_spc numeric,
               o_attn_total int, o_attn_fail int, o_straight boolean, o_text_len int, o_excluded boolean, o_created timestamptz,
               o_eligible boolean, o_reason text, o_time_score numeric, o_text_score numeric, o_weight numeric)
language plpgsql stable security definer set search_path = svy, public as $$
declare
  v_max_fail int := coalesce((p_cfg->>'max_fail')::int, 0);
  v_no_straight boolean := coalesce((p_cfg->>'no_straight')::boolean, true);
  v_min_pc numeric := greatest(coalesce((p_cfg->>'min_sec_per_course')::numeric, 30), 0);
  v_good_pc numeric;
  v_text_min int := greatest(coalesce((p_cfg->>'min_text')::int, 0), 0);
  v_text_good numeric := greatest(coalesce((p_cfg->>'text_good')::numeric, 100), 1);
  w_base numeric := greatest(coalesce((p_cfg->>'w_base')::numeric, 1), 0.01);
  w_time numeric := greatest(coalesce((p_cfg->>'w_time')::numeric, 2), 0);
  w_text numeric := greatest(coalesce((p_cfg->>'w_text')::numeric, 3), 0);
  ex text[];
begin
  v_good_pc := greatest(coalesce((p_cfg->>'good_sec_per_course')::numeric, 120), v_min_pc + 1);
  select coalesce(array_agg(svy.norm_ticket(x)) filter (where svy.norm_ticket(x) is not null), '{}') into ex from unnest(coalesce(p_exclude, '{}')) x;
  return query
  with b as (
    select r.ticket as t, r.track as tr, r.grade as gr, r.klass as kl,
           greatest((select count(*) from jsonb_object_keys(coalesce(r.answers->'course', '{}'::jsonb))), 1)::int as nc,
           r.duration_sec as du, r.attn_total as at_, r.attn_fail as af, r.straight as st, r.text_len as tl, r.excluded as exc, r.created_at as ca
      from svy.responses r where r.survey_id = p_survey
  ), c as (
    select b.*, (b.du::numeric / b.nc) as spc,
           least(greatest(((b.du::numeric / b.nc) - v_min_pc) / (v_good_pc - v_min_pc), 0), 1) as ts,
           least(b.tl / v_text_good, 1) as xs
      from b
  )
  select c.t, c.tr, c.gr, c.kl, c.nc, c.du, round(c.spc, 1), c.at_, c.af, c.st, c.tl, c.exc, c.ca,
         (not c.exc and not (c.t = any(ex)) and c.af <= v_max_fail and (not v_no_straight or not c.st) and c.spc >= v_min_pc and c.tl >= v_text_min),
         case when c.exc then '관리자 제외'
              when c.t = any(ex) then '번호 제외'
              when c.af > v_max_fail then '성실응답 점검 실패'
              when v_no_straight and c.st then '전 문항 동일 응답'
              when c.spc < v_min_pc then '입력 시간 부족'
              when c.tl < v_text_min then '서술형 부족'
              else '' end,
         round(c.ts, 3), round(c.xs, 3), round(w_base + w_time * c.ts + w_text * c.xs, 3)
    from c;
end $$;

create or replace function public.svy_a_draw_preview(p_token text, p_id uuid, p_criteria jsonb, p_exclude text[] default '{}')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare tot numeric; res jsonb;
begin
  perform svy.sess(p_token);
  select coalesce(sum(o_weight) filter (where o_eligible), 0) into tot from svy.draw_pool(p_id, coalesce(p_criteria, '{}'::jsonb), p_exclude);
  select jsonb_build_object('ok', true,
    'total', count(*), 'eligible', count(*) filter (where o_eligible), 'weight_sum', tot,
    'reasons', coalesce(jsonb_object_agg(rs, cnt) filter (where rs <> ''), '{}'::jsonb)) into res
    from (select o_eligible, o_reason as rs, count(*) over (partition by o_reason) as cnt from svy.draw_pool(p_id, coalesce(p_criteria, '{}'::jsonb), p_exclude)) q;
  return res || jsonb_build_object('rows', (select coalesce(jsonb_agg(jsonb_build_object(
      'ticket', o_ticket, 'track', o_track, 'grade', o_grade, 'klass', o_klass, 'courses', o_courses, 'duration', o_duration, 'spc', o_spc,
      'attn_fail', o_attn_fail, 'straight', o_straight, 'text_len', o_text_len, 'eligible', o_eligible, 'reason', o_reason,
      'time_score', o_time_score, 'text_score', o_text_score, 'weight', o_weight,
      'prob', case when o_eligible and tot > 0 then round(o_weight / tot * 100, 2) else 0 end) order by o_eligible desc, o_weight desc, o_created), '[]'::jsonb)
    from (select * from svy.draw_pool(p_id, coalesce(p_criteria, '{}'::jsonb), p_exclude) limit 3000) z));
end $$;

create or replace function public.svy_a_draw(p_token text, p_id uuid, p_n int, p_criteria jsonb, p_exclude text[] default '{}', p_note text default '')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare cr jsonb := coalesce(p_criteria, '{}'::jsonb); pool int; picked text[]; v_id bigint;
begin
  perform svy.sess(p_token);
  if p_n is null or p_n < 1 or p_n > 500 then raise exception 'BAD_N'; end if;
  select count(*) into pool from svy.draw_pool(p_id, cr, p_exclude) where o_eligible;
  select coalesce(array_agg(t.o_ticket), '{}') into picked from (
    select o_ticket from svy.draw_pool(p_id, cr, p_exclude) where o_eligible
     order by (-ln(greatest(random(), 1e-12)) / o_weight) limit p_n) t;
  insert into svy.draws(survey_id, n, criteria, tickets, pool_size, note) values (p_id, p_n, cr, picked, pool, coalesce(p_note, '')) returning id into v_id;
  perform svy.log_add('draw', p_id::text, jsonb_build_object('draw', v_id, 'n', p_n, 'pool', pool, 'weighted', true));
  return jsonb_build_object('ok', true, 'id', v_id, 'tickets', to_jsonb(picked), 'pool_size', pool);
end $$;

create or replace function public.svy_a_save(p_token text, p_id uuid, p_patch jsonb, p_note text default '')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare s svy.surveys; n svy.surveys; changed boolean; v_status text; v_test boolean;
begin
  perform svy.sess(p_token);
  select * into s from svy.surveys where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_status := case when p_patch ? 'status' then p_patch->>'status' else s.status end;
  v_test := case when p_patch ? 'test_mode' then coalesce((p_patch->>'test_mode')::boolean, false) else s.test_mode end;
  if v_status not in ('draft', 'open', 'closed') then raise exception 'BAD_STATUS'; end if;
  if v_status = 'open' and s.status <> 'open' and not exists (select 1 from svy.courses where survey_id = s.id and active) then
    raise exception 'NO_COURSES';
  end if;
  if s.test_mode and not v_test and exists (select 1 from svy.responses where survey_id = s.id and is_test) then
    raise exception 'TEST_DATA_EXISTS';
  end if;
  if not s.test_mode and v_test and exists (select 1 from svy.responses where survey_id = s.id and not is_test) then
    raise exception 'HAS_REAL_RESPONSES';
  end if;
  changed := (p_patch ? 'def' and (p_patch->'def') is distinct from s.def) or (p_patch ? 'theme' and (p_patch->'theme') is distinct from s.theme);
  update svy.surveys set
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    semester = case when p_patch ? 'semester' then btrim(coalesce(p_patch->>'semester', '')) else semester end,
    status = v_status,
    test_mode = v_test,
    def = case when p_patch ? 'def' then p_patch->'def' else def end,
    theme = case when p_patch ? 'theme' then p_patch->'theme' else theme end,
    draw_cfg = case when p_patch ? 'draw_cfg' then coalesce(p_patch->'draw_cfg', '{}'::jsonb) else draw_cfg end,
    open_at = case when p_patch ? 'open_at' then nullif(p_patch->>'open_at', '')::timestamptz else open_at end,
    close_at = case when p_patch ? 'close_at' then nullif(p_patch->>'close_at', '')::timestamptz else close_at end,
    result_from = case when p_patch ? 'result_from' then nullif(p_patch->>'result_from', '')::timestamptz else result_from end,
    draw_msg = case when p_patch ? 'draw_msg' then coalesce(p_patch->>'draw_msg', '') else draw_msg end,
    version = version + (case when changed then 1 else 0 end),
    updated_at = now()
  where id = p_id returning * into n;
  if changed then
    insert into svy.survey_versions(survey_id, version, def, theme, note) values (n.id, n.version, n.def, n.theme, coalesce(p_note, ''));
  end if;
  perform svy.log_add('save', p_id::text, jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k), 'version', n.version));
  return jsonb_build_object('ok', true, 'version', n.version, 'phase', svy.phase(n), 'updated_at', n.updated_at);
end $$;

create or replace function public.svy_a_create(p_token text, p_title text, p_semester text, p_def jsonb, p_theme jsonb, p_clone_from uuid default null)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare v_id uuid; src svy.surveys; v_def jsonb := coalesce(p_def, '{}'::jsonb); v_theme jsonb := coalesce(p_theme, '{}'::jsonb); v_title text := btrim(coalesce(p_title, '')); v_cfg jsonb := '{}'::jsonb;
begin
  perform svy.sess(p_token);
  if p_clone_from is not null then
    select * into src from svy.surveys where id = p_clone_from;
    if not found then raise exception 'NOT_FOUND'; end if;
    v_def := src.def; v_theme := src.theme; v_cfg := src.draw_cfg;
    if v_title = '' then v_title := src.title || ' (복제)'; end if;
  end if;
  if v_title = '' then raise exception 'TITLE_REQUIRED'; end if;
  insert into svy.surveys(code, title, semester, def, theme, draw_cfg, cloned_from)
  values (svy.gen_code(), v_title, btrim(coalesce(p_semester, '')), v_def, v_theme, v_cfg, p_clone_from) returning id into v_id;
  insert into svy.survey_versions(survey_id, version, def, theme, note) values (v_id, 1, v_def, v_theme, case when p_clone_from is null then '최초 생성' else '복제' end);
  if p_clone_from is not null then
    insert into svy.courses(survey_id, track, grade, klass, name, prof, kind, sort, active)
      select v_id, track, grade, klass, name, prof, kind, sort, true from svy.courses where survey_id = p_clone_from and active;
    insert into svy.targets(survey_id, track, grade, headcount) select v_id, track, grade, headcount from svy.targets where survey_id = p_clone_from;
  end if;
  perform svy.log_add('create', v_id::text, jsonb_build_object('title', v_title, 'clone_from', p_clone_from));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'svy\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
```

## 3. 설치 확인 — 새 쿼리를 열어 아래를 붙여넣고 Run

```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'svy\_a\_%') as admin_fn,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('svy_ping','svy_public','svy_submit','svy_draw_check')) as public_fn,
  (select count(*) from information_schema.columns
    where table_schema = 'svy' and ((table_name = 'surveys' and column_name = 'test_mode')
       or (table_name = 'responses' and column_name = 'is_test'))) as test_cols,
  (select count(*) from information_schema.tables where table_schema = 'svy') as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'svy' and p.proname = 'draw_pool') as draw_fn;
```

**기대 결과 (정확히 이 값이어야 합니다)**

| admin_fn | public_fn | test_cols | tables | draw_fn |
|---|---|---|---|---|
| 24 | 4 | 2 | 10 | 1 |

## 4. 동작 확인 — 새 쿼리로 아래를 붙여넣고 Run

```sql
select public.svy_ping();
```

**기대 결과**: `{"ok": true, "ts": "2026-…", "schema": true}`

여기까지 같으면 DB 준비는 끝입니다. 결과를 Claude에게 알려 주시면 다음 단계(관리자 화면의 「DB 연결 테스트」 버튼)로 이어서 확인합니다.

---

## 문제가 생기면

| 증상 | 조치 |
|---|---|
| Run이 오래 걸리거나 시간 초과 | 2번 SQL을 `create or replace function` 단위로 3~4번에 나누어 실행합니다. 순서는 위에서 아래로 유지하십시오. |
| `schema "svy" does not exist` | 1·2단계가 없는 경우입니다. Claude에게 알려 주십시오. |
| 3번 결과의 `admin_fn`이 24보다 작음 | 2번을 다시 실행한 뒤 3번을 재확인합니다. 그래도 같으면 `db/survey_schema_3.sql`, `db/survey_schema_4.sql` 순서로 먼저 실행합니다. |
| `permission denied` | 프로젝트 소유자 계정으로 로그인했는지 확인합니다. |

## 관리자 비밀번호

- 현재 초기 비밀번호는 대화에서 안내드린 값입니다(보안상 저장소 파일에는 기록하지 않습니다).
- 관리자 화면의 「비밀번호 변경」으로 바꾸시거나, 분실 시 SQL Editor에서 아래를 실행합니다.

```sql
update svy.secret
   set admin_hash = extensions.crypt('<새 비밀번호 8자 이상>', extensions.gen_salt('bf')), admin_fail = 0, admin_locked_until = null
 where id = 1;
```

## 무료 플랜 유의사항

- 7일간 활동이 없으면 프로젝트가 일시정지됩니다. 설문 배포 전 관리자 화면의 「DB 연결 테스트」로 활성 상태를 확인하십시오.
- 자동 백업이 없으므로 마감 후 엑셀로 원자료를 내려받아 보관하십시오.

## 보안 구조 (참고)

- 모든 테이블은 `svy` 스키마(API 비노출) + RLS 활성 + 외부 권한 회수. 브라우저는 `public.svy_*` 함수만 호출합니다.
- 응답에는 학번·이름·IP를 저장하지 않습니다(완전 익명). 중복 제출은 기기 토큰으로만 제한합니다.
- 관리자 로그인은 12시간 토큰이며 5회 실패 시 15분 잠금됩니다.
