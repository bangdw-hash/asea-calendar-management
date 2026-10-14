# 교내 설문(aseasurvey) DB 설치 안내 — 6단계(범용 설문 엔진) 마무리

> 방시원님이 직접 하실 일은 **아래 1~4번(약 3분)** 입니다. SQL은 한 덩어리로 붙여넣기만 하면 됩니다.
> 여러 번 실행해도 안전합니다(이미 설치된 부분은 덮어쓰기됩니다).

## 현재 상태 (2026-10-12)

| 구분 | 상태 |
|---|---|
| 1~5단계 (기본 설문, 관리자, 테스트 모드, 성실도 가중 추첨) | 설치 완료 |
| 6단계 앞부분: 모든 문항 형식 검증, 조건 표시, 채점, 정원 계산, 파일 테이블 | 설치 완료 |
| **6단계 마무리: 공개·제출·파일 업로드·관리자 함수 갱신** | **미설치 → 아래 SQL 실행** |

---

## 1. SQL Editor 열기

1. 브라우저에서 아래 주소로 이동합니다(Supabase 로그인 필요).
   `https://supabase.com/dashboard/project/zbpeyklwpotjyveipzxd/sql/new`
2. 또는 Supabase 대시보드 → 프로젝트 `zbpeyklwpotjyveipzxd` → 왼쪽 메뉴 **SQL Editor** → **+ New query**

## 2. 아래 SQL 전체를 복사해서 붙여넣고 Run

- 아래 코드 블록의 **처음부터 끝까지 전부** 복사합니다. (약 14KB)
- 편집기에 붙여넣고 오른쪽 아래 **Run**(또는 Ctrl+Enter)을 누릅니다.
- 「destructive operations」 확인창이 뜨면 **Run this query**를 누릅니다. (권한 정리 구문 때문이며 데이터 삭제는 없습니다.)

**기대 결과**: 결과 영역에 `Success. No rows returned` 가 표시됩니다.

```sql
-- 학생에게 내려가는 설문 정의에서 정답(퀴즈 answer·points, 성실응답 점검 check)을 제거합니다. (점검 문항은 attn 표시만 남김)
create or replace function svy.strip_answers(p_def jsonb)
returns jsonb language sql immutable set search_path = svy, public as $$
  select jsonb_set(
    jsonb_set(p_def, '{basic}', coalesce((
      select jsonb_agg((x - 'answer' - 'points' - 'check') || case when (x->'check'->'valid') is not null then jsonb_build_object('attn', true, 'required', true) else '{}'::jsonb end order by ord)
        from jsonb_array_elements(coalesce(p_def->'basic', '[]'::jsonb)) with ordinality as t(x, ord)), '[]'::jsonb)),
    '{sections}', coalesce((
      select jsonb_agg(jsonb_set(sx, '{questions}', coalesce((
        select jsonb_agg((x - 'answer' - 'points' - 'check') || case when (x->'check'->'valid') is not null then jsonb_build_object('attn', true, 'required', true) else '{}'::jsonb end order by ord)
          from jsonb_array_elements(coalesce(sx->'questions', '[]'::jsonb)) with ordinality as t(x, ord)), '[]'::jsonb)) order by sord)
        from jsonb_array_elements(coalesce(p_def->'sections', '[]'::jsonb)) with ordinality as u(sx, sord)), '[]'::jsonb));
$$;

create or replace function public.svy_public(p_code text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare s svy.surveys; ph text; cs jsonb := '[]'::jsonb; cnt jsonb := '{}'::jsonb;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  ph := svy.phase(s);
  if ph = 'open' then
    if coalesce(s.def->>'mode', 'course') = 'course' then
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'track', track, 'grade', grade, 'klass', klass, 'name', name, 'kind', kind)
                                order by track, grade, klass, sort, name), '[]'::jsonb)
        into cs from svy.courses where survey_id = s.id and active;
    end if;
    cnt := svy.quota_counts(s);
  end if;
  return jsonb_build_object('ok', true, 'code', s.code, 'title', s.title, 'phase', ph, 'version', s.version, 'test', s.test_mode,
    'theme', s.theme, 'draw_msg', case when ph = 'result' then s.draw_msg else '' end, 'mode', coalesce(s.def->>'mode', 'course'),
    'def', case when ph = 'open' then svy.strip_answers(s.def) else jsonb_build_object('intro', s.def->'intro') end,
    'courses', cs, 'counts', cnt);
end $$;

create or replace function public.svy_submit(p_code text, p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = svy, extensions, public as $$
declare
  s svy.surveys; ex svy.responses; r svy.responses; cids text[]; chk jsonb; tk text; gen boolean;
  v_track text; v_grade text; v_klass text; v_dur int; v_lim int; sec jsonb; q jsonb; o jsonb; sel jsonb; n int; fl uuid[];
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  if length(coalesce(p_token, '')) < 16 or length(p_token) > 80 then raise exception 'BAD_TOKEN'; end if;
  select * into ex from svy.responses where survey_id = s.id and client_token = p_token;
  if found then return jsonb_build_object('ok', true, 'duplicate', true, 'ticket', ex.ticket, 'score', ex.score, 'max_score', ex.max_score, 'quiz', s.def->'quiz'); end if;
  if svy.phase(s) <> 'open' then raise exception 'NOT_OPEN'; end if;
  if p_payload is null or pg_column_size(p_payload) > 200000 then raise exception 'TOO_LARGE'; end if;
  gen := coalesce(s.def->>'mode', 'course') = 'general';
  if gen then
    v_track := '-'; v_grade := '-'; v_klass := '-'; cids := '{}'::text[];
  else
    v_track := btrim(coalesce(p_payload->>'track', '')); v_grade := btrim(coalesce(p_payload->>'grade', '')); v_klass := btrim(coalesce(p_payload->>'klass', ''));
    select array_agg(id::text order by sort, name) into cids from svy.courses
     where survey_id = s.id and active and track = v_track and grade = v_grade and klass = v_klass;
    if cids is null then raise exception 'BAD_CLASS'; end if;
  end if;
  chk := svy.check_answers2(s.def, cids, p_payload->'answers', s.id, p_token);
  if chk->>'err' is not null then raise exception 'VALIDATION:%', chk->>'err'; end if;

  perform pg_advisory_xact_lock(hashtext('svy:' || s.id::text));
  v_lim := svy.to_num(s.def->'limit'->>'max')::int;
  if v_lim is not null and (select count(*) from svy.responses where survey_id = s.id and is_test = s.test_mode) >= v_lim then raise exception 'FULL'; end if;
  for sec in
    select jsonb_build_object('questions', coalesce(s.def->'basic', '[]'::jsonb), 'basic', true)
    union all select z || jsonb_build_object('basic', false) from jsonb_array_elements(coalesce(s.def->'sections', '[]'::jsonb)) z
  loop
    for q in select x from jsonb_array_elements(coalesce(sec->'questions', '[]'::jsonb)) x loop
      if q->>'type' not in ('single', 'multi') or not (gen or (sec->>'basic')::boolean or q->>'scope' = 'common') then continue; end if;
      sel := p_payload->'answers'->'common'->(q->>'id');
      if sel is null then continue; end if;
      for o in select x from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) x loop
        if svy.to_num(o->>'max') is null or not (sel @> to_jsonb(o->>'id')) then continue; end if;
        select count(*) into n from svy.responses r2
         where r2.survey_id = s.id and r2.is_test = s.test_mode and (r2.answers->'common'->(q->>'id')) @> to_jsonb(o->>'id');
        if n >= svy.to_num(o->>'max') then raise exception 'OPTION_FULL:%', o->>'label'; end if;
      end loop;
    end loop;
  end loop;

  v_dur := least(greatest(coalesce((p_payload->>'duration')::int, 0), 0), 86400);
  tk := svy.gen_ticket(s.id);
  insert into svy.responses(survey_id, client_token, track, grade, klass, answers, ticket, attn_total, attn_fail, straight, text_len, duration_sec, version, is_test, score, max_score)
  values (s.id, p_token, v_track, v_grade, v_klass, p_payload->'answers', tk,
          (chk->>'attn_total')::int, (chk->>'attn_fail')::int, (chk->>'straight')::boolean, (chk->>'text_len')::int, v_dur, s.version, s.test_mode,
          case when (chk->>'max_score')::numeric > 0 then (chk->>'score')::numeric end, case when (chk->>'max_score')::numeric > 0 then (chk->>'max_score')::numeric end)
  on conflict (survey_id, client_token) do nothing returning * into r;
  if not found then
    select * into ex from svy.responses where survey_id = s.id and client_token = p_token;
    return jsonb_build_object('ok', true, 'duplicate', true, 'ticket', ex.ticket, 'score', ex.score, 'max_score', ex.max_score, 'quiz', s.def->'quiz');
  end if;
  fl := array(select jsonb_array_elements_text(chk->'fids')::uuid);
  if coalesce(array_length(fl, 1), 0) > 0 then update svy.files set response_id = r.id where survey_id = s.id and client_token = p_token and id = any(fl); end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'ticket', r.ticket, 'score', r.score, 'max_score', r.max_score, 'quiz', s.def->'quiz');
end $$;

create or replace function public.svy_upload(p_code text, p_token text, p_qid text, p_name text, p_mime text, p_data text)
returns jsonb language plpgsql security definer set search_path = svy, extensions, public as $$
declare s svy.surveys; b bytea; tot bigint; cnt int; v_id uuid;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  if length(coalesce(p_token, '')) < 16 or length(p_token) > 80 then raise exception 'BAD_TOKEN'; end if;
  if svy.phase(s) <> 'open' then raise exception 'NOT_OPEN'; end if;
  if coalesce(p_mime, '') !~ '^(image/(png|jpeg|webp|gif)|application/pdf|application/msword|application/vnd\.[a-z0-9.+-]+|text/plain|text/csv)$' then raise exception 'BAD_FILE_TYPE'; end if;
  b := decode(coalesce(p_data, ''), 'base64');
  if length(b) = 0 or length(b) > 3145728 then raise exception 'FILE_TOO_LARGE'; end if;
  delete from svy.files where response_id is null and created_at < now() - interval '1 day';
  select count(*), coalesce(sum(size), 0) into cnt, tot from svy.files where survey_id = s.id and client_token = p_token;
  if cnt >= 12 or tot + length(b) > 15728640 then raise exception 'FILE_LIMIT'; end if;
  insert into svy.files(survey_id, client_token, qid, name, mime, size, data)
  values (s.id, p_token, left(coalesce(p_qid, ''), 40), left(coalesce(p_name, ''), 120), p_mime, length(b), b) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'size', length(b));
end $$;

create or replace function public.svy_file_delete(p_code text, p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare s svy.surveys;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  delete from svy.files where id = p_id and survey_id = s.id and client_token = p_token and response_id is null;
  return jsonb_build_object('ok', true);
end $$;

-- [6] 관리자 함수 갱신 ----------------------------------------------------------
create or replace function public.svy_a_file_get(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, extensions, public as $$
declare f svy.files;
begin
  perform svy.sess(p_token);
  select * into f from svy.files where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size, 'data', replace(encode(f.data, 'base64'), E'\n', ''));
end $$;

create or replace function public.svy_a_results(p_token text, p_id uuid, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return jsonb_build_object('ok', true, 'ts', now(),
    'total', (select count(*) from svy.responses where survey_id = p_id),
    'max_seq', (select coalesce(max(seq), 0) from svy.responses where survey_id = p_id),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'id', id, 'track', track, 'grade', grade, 'klass', klass,
        'answers', answers, 'ticket', ticket, 'attn_total', attn_total, 'attn_fail', attn_fail, 'straight', straight,
        'text_len', text_len, 'duration_sec', duration_sec, 'excluded', excluded, 'is_test', is_test, 'version', version,
        'score', score, 'max_score', max_score, 'created_at', created_at) order by seq), '[]'::jsonb)
      from (select * from svy.responses where survey_id = p_id and seq > coalesce(p_after, 0) order by seq limit 2000) x));
end $$;

create or replace function public.svy_a_save(p_token text, p_id uuid, p_patch jsonb, p_note text default '')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare s svy.surveys; n svy.surveys; changed boolean; v_status text; v_test boolean; v_mode text;
begin
  perform svy.sess(p_token);
  select * into s from svy.surveys where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_status := case when p_patch ? 'status' then p_patch->>'status' else s.status end;
  v_test := case when p_patch ? 'test_mode' then coalesce((p_patch->>'test_mode')::boolean, false) else s.test_mode end;
  v_mode := coalesce((case when p_patch ? 'def' then p_patch->'def' else s.def end)->>'mode', 'course');
  if v_status not in ('draft', 'open', 'closed') then raise exception 'BAD_STATUS'; end if;
  if v_status = 'open' and s.status <> 'open' and v_mode = 'course' and not exists (select 1 from svy.courses where survey_id = s.id and active) then
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
    where n.nspname = 'svy' and p.proname in ('check_one2','check_answers2','vis','cond_one','quota_counts','strip_answers')) as svy_fn,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('svy_upload','svy_file_delete','svy_a_file_get')) as pub_new_fn,
  (select count(*) from information_schema.tables where table_schema = 'svy') as tables,
  (select count(*) from information_schema.columns
    where table_schema = 'svy' and table_name = 'responses' and column_name in ('score','max_score')) as score_cols;
```

**기대 결과 (정확히 이 값이어야 합니다)**

| svy_fn | pub_new_fn | tables | score_cols |
|---|---|---|---|
| 6 | 3 | 11 | 2 |

## 4. 동작 확인 — 새 쿼리로 아래를 붙여넣고 Run

```sql
select public.svy_public('r9yx785h')->>'mode' as mode,
       svy.check_one2('{"id":"Q1","type":"nps","required":true}'::jsonb, '{}'::jsonb, '{"Q1":9}'::jsonb, '{}'::jsonb, gen_random_uuid(), 'x') as nps_check;
```

**기대 결과**: `mode = course`, `nps_check = {"mx": 0, "pts": 0}` (오류 `err`가 없으면 정상)

여기까지 같으면 DB 준비는 끝입니다. 결과를 Claude에게 알려 주시면 이어서 화면 작업과 실제 DB 시험을 진행합니다.

---

## 문제가 생기면

| 증상 | 조치 |
|---|---|
| Run이 오래 걸리거나 시간 초과 | SQL을 `create or replace function` 단위로 나누어 위에서 아래 순서로 실행합니다. |
| `syntax error` | 복사가 잘렸는지 확인하고, 코드 블록 전체를 다시 복사해 새 쿼리에 붙여넣습니다. |
| 3번 결과가 기대값과 다름 | 2번을 다시 실행한 뒤 3번을 재확인합니다. |
| `permission denied` | 프로젝트 소유자 계정으로 로그인했는지 확인합니다. |

## 관리자 비밀번호

- 관리자 화면의 「비밀번호 변경」으로 바꾸시거나, 분실 시 SQL Editor에서 아래를 실행합니다.

```sql
update svy.secret
   set admin_hash = extensions.crypt('<새 비밀번호 8자 이상>', extensions.gen_salt('bf')), admin_fail = 0, admin_locked_until = null
 where id = 1;
```

## 무료 플랜 유의사항

- 7일간 활동이 없으면 프로젝트가 일시정지됩니다. 설문 배포 전 관리자 화면의 「DB 연결 테스트」로 활성 상태를 확인하십시오.
- 첨부 파일·사진·서명은 DB에 저장되어 용량을 사용합니다(무료 500MB). 행사 후 필요 없는 설문은 삭제해 용량을 확보하십시오.
- 자동 백업이 없으므로 마감 후 엑셀로 원자료를 내려받아 보관하십시오.


---

## 7단계: 제출 후 수정 허용 (원터치)

> 이 단계는 2026-10-12 운영 DB에 이미 적용·검증했습니다(12개 항목 통과). **새 프로젝트로 옮기거나 DB를 다시 만들 때만** 실행하십시오. 여러 번 실행해도 안전합니다.

1. Supabase 대시보드 → 프로젝트 `zbpeyklwpotjyveipzxd` → **SQL Editor** → 새 쿼리
   (바로가기: https://supabase.com/dashboard/project/zbpeyklwpotjyveipzxd/sql/new)
2. 아래 SQL 블록 **전체**를 복사해 붙여넣고 **Run** 한 번만 누릅니다.
3. 마지막에 아래 확인 쿼리를 실행해 `3 | 2` 가 나오면 완료입니다.

```sql
select (select count(*) from pg_proc where proname in ('svy_edit_get','svy_edit_save','can_edit')) as fn,
       (select count(*) from information_schema.columns where table_schema='svy' and table_name='responses' and column_name in ('edited_at','edit_count')) as cols;
```

사용법: 관리자 화면 → 설문 → 문항 탭 → 「설문 설정」 → **제출 후 응답 수정**(허용 안 함 / 24시간 / 3일 / 설문 마감까지)을 고르고 저장합니다. 응답자는 제출 완료 화면의 「응답 수정하기」로 같은 기기에서 수정하며, 추첨번호는 유지됩니다.

```sql
-- ============================================================================
-- 교내 설문 스키마 7/7: 제출 후 수정 허용
--  * 설문별로 관리자가 허용(def.features.edit = {"hours": 24 | 72 | 0(설문 마감까지)})한 경우에만 동작합니다.
--  * 응답자는 제출한 같은 기기(기기 토큰)에서만 본인 응답을 불러와 수정할 수 있습니다. (추첨번호는 유지)
--  * 컬럼 2개(edited_at, edit_count)만 추가합니다. 기존 데이터에는 영향이 없습니다. 여러 번 실행해도 안전합니다.
-- ============================================================================

alter table svy.responses add column if not exists edited_at timestamptz;
alter table svy.responses add column if not exists edit_count int not null default 0;

-- 수정 가능 여부: 설문이 응답 중이고, 허용 설정이 있으며, 허용 시간 이내
create or replace function svy.can_edit(s svy.surveys, r svy.responses)
returns boolean language plpgsql stable security definer set search_path = svy, public as $$
declare ed jsonb := s.def->'features'->'edit'; hrs numeric;
begin
  if ed is null or jsonb_typeof(ed) <> 'object' then return false; end if;
  if svy.phase(s) <> 'open' then return false; end if;
  hrs := coalesce(svy.to_num(ed->>'hours'), 24);
  if hrs <= 0 then return true; end if;
  return now() < r.created_at + (hrs || ' hours')::interval;
end $$;

-- 본인 응답 조회 (수정 화면용)
create or replace function public.svy_edit_get(p_code text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare s svy.surveys; r svy.responses; ok boolean;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into r from svy.responses where survey_id = s.id and client_token = p_token;
  if not found then return jsonb_build_object('ok', true, 'can_edit', false); end if;
  ok := svy.can_edit(s, r);
  if not ok then return jsonb_build_object('ok', true, 'can_edit', false, 'ticket', r.ticket); end if;
  return jsonb_build_object('ok', true, 'can_edit', true, 'ticket', r.ticket, 'track', r.track, 'grade', r.grade, 'klass', r.klass,
    'answers', r.answers, 'edit_count', r.edit_count);
end $$;

-- 본인 응답 수정 저장 (제출과 같은 검증)
create or replace function public.svy_edit_save(p_code text, p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = svy, extensions, public as $$
declare
  s svy.surveys; r svy.responses; cids text[]; chk jsonb; gen boolean; fl uuid[]; sec jsonb; q jsonb; o jsonb; sel jsonb; n int;
  v_track text; v_grade text; v_klass text; v_dur int;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into r from svy.responses where survey_id = s.id and client_token = p_token for update;
  if not found then raise exception 'NO_RESPONSE'; end if;
  if not svy.can_edit(s, r) then raise exception 'EDIT_CLOSED'; end if;
  if p_payload is null or pg_column_size(p_payload) > 200000 then raise exception 'TOO_LARGE'; end if;
  gen := coalesce(s.def->>'mode', 'course') = 'general';
  if gen then
    v_track := '-'; v_grade := '-'; v_klass := '-'; cids := '{}'::text[];
  else
    v_track := btrim(coalesce(p_payload->>'track', '')); v_grade := btrim(coalesce(p_payload->>'grade', '')); v_klass := btrim(coalesce(p_payload->>'klass', ''));
    select array_agg(id::text order by sort, name) into cids from svy.courses
     where survey_id = s.id and active and track = v_track and grade = v_grade and klass = v_klass;
    if cids is null then raise exception 'BAD_CLASS'; end if;
  end if;
  chk := svy.check_answers2(s.def, cids, p_payload->'answers', s.id, p_token);
  if chk->>'err' is not null then raise exception 'VALIDATION:%', chk->>'err'; end if;

  perform pg_advisory_xact_lock(hashtext('svy:' || s.id::text));
  -- 선택지 정원: 본인 응답은 제외하고 계산
  for sec in
    select jsonb_build_object('questions', coalesce(s.def->'basic', '[]'::jsonb), 'basic', true)
    union all select z || jsonb_build_object('basic', false) from jsonb_array_elements(coalesce(s.def->'sections', '[]'::jsonb)) z
  loop
    for q in select x from jsonb_array_elements(coalesce(sec->'questions', '[]'::jsonb)) x loop
      if q->>'type' not in ('single', 'multi') or not (gen or (sec->>'basic')::boolean or q->>'scope' = 'common') then continue; end if;
      sel := p_payload->'answers'->'common'->(q->>'id');
      if sel is null then continue; end if;
      for o in select x from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) x loop
        if svy.to_num(o->>'max') is null or not (sel @> to_jsonb(o->>'id')) then continue; end if;
        select count(*) into n from svy.responses r2
         where r2.survey_id = s.id and r2.is_test = s.test_mode and r2.id <> r.id and (r2.answers->'common'->(q->>'id')) @> to_jsonb(o->>'id');
        if n >= svy.to_num(o->>'max') then raise exception 'OPTION_FULL:%', o->>'label'; end if;
      end loop;
    end loop;
  end loop;

  v_dur := least(greatest(coalesce((p_payload->>'duration')::int, 0), 0), 86400);
  update svy.responses set
    track = v_track, grade = v_grade, klass = v_klass, answers = p_payload->'answers',
    attn_total = (chk->>'attn_total')::int, attn_fail = (chk->>'attn_fail')::int, straight = (chk->>'straight')::boolean, text_len = (chk->>'text_len')::int,
    duration_sec = least(duration_sec + v_dur, 86400),
    score = case when (chk->>'max_score')::numeric > 0 then (chk->>'score')::numeric end,
    max_score = case when (chk->>'max_score')::numeric > 0 then (chk->>'max_score')::numeric end,
    edited_at = now(), edit_count = edit_count + 1
   where id = r.id returning * into r;
  fl := array(select jsonb_array_elements_text(chk->'fids')::uuid);
  -- 빠진 첨부는 연결만 끊습니다(미연결 파일은 업로드 시 1일 지나면 자동 정리됩니다)
  update svy.files set response_id = null where response_id = r.id and not (id = any(fl));
  if coalesce(array_length(fl, 1), 0) > 0 then update svy.files set response_id = r.id where survey_id = s.id and client_token = p_token and id = any(fl); end if;
  return jsonb_build_object('ok', true, 'ticket', r.ticket, 'score', r.score, 'max_score', r.max_score, 'quiz', s.def->'quiz', 'edit_count', r.edit_count);
end $$;

-- 관리자 결과 조회에 수정 이력 추가
create or replace function public.svy_a_results(p_token text, p_id uuid, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return jsonb_build_object('ok', true, 'ts', now(),
    'total', (select count(*) from svy.responses where survey_id = p_id),
    'max_seq', (select coalesce(max(seq), 0) from svy.responses where survey_id = p_id),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'id', id, 'track', track, 'grade', grade, 'klass', klass,
        'answers', answers, 'ticket', ticket, 'attn_total', attn_total, 'attn_fail', attn_fail, 'straight', straight,
        'text_len', text_len, 'duration_sec', duration_sec, 'excluded', excluded, 'is_test', is_test, 'version', version,
        'score', score, 'max_score', max_score, 'created_at', created_at, 'edited_at', edited_at, 'edit_count', edit_count) order by seq), '[]'::jsonb)
      from (select * from svy.responses where survey_id = p_id and seq > coalesce(p_after, 0) order by seq limit 2000) x));
end $$;

grant execute on function public.svy_edit_get(text, text), public.svy_edit_save(text, text, jsonb) to anon, authenticated;
```

## 8단계: 양식 라이브러리 (원터치)

> 이 단계는 2026-10-12 운영 DB에 이미 적용·검증했습니다(함수 7개, 실DB 시험 11개 항목 통과). **새 프로젝트로 옮기거나 DB를 다시 만들 때만** 실행하십시오. 여러 번 실행해도 안전합니다.

1. Supabase 대시보드 → 프로젝트 `zbpeyklwpotjyveipzxd` → **SQL Editor** → 새 쿼리
2. 아래 SQL 블록 **전체**를 붙여넣고 **Run** 한 번만 누릅니다. (SQL Editor가 한 번에 실행이 안 되면 `create or replace function` 단위로 나누어 실행해도 됩니다.)
3. 확인 쿼리: `select count(*) from pg_proc where proname like 'svy_tpl_%';` → `7` 이 나오면 완료입니다.

사용법: 설문 화면 상단 「양식으로 저장」 → 새 양식 또는 기존 양식의 새 버전으로 저장합니다. 목록 화면의 「양식 라이브러리」에서 버전 비교·★ 기본 버전·편집(→새 버전)·복사·삭제를 합니다.

```sql
-- ============================================================================
-- 교내 설문 스키마 8/8: 양식 라이브러리 (양식 + 버전)
--  * 설문 구조(문항·설정·안내문·디자인)만 저장합니다. 응답·과목·인원·추첨 데이터는 저장하지 않습니다.
--  * 양식 1개 = 이름 + 버전 여러 개. 설문을 만들 때 선택한 버전이 설문으로 복사됩니다(이후 서로 연결되지 않음).
--  * 테이블 2개와 함수 7개만 추가합니다. 기존 데이터에는 영향이 없으며, 여러 번 실행해도 안전합니다.
-- ============================================================================

create table if not exists svy.tpl (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'custom',
  descr text not null default '',
  default_ver int not null default 1,
  uses int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists svy.tpl_ver (
  tpl_id uuid not null references svy.tpl(id) on delete cascade,
  ver int not null,
  def jsonb not null,
  theme jsonb not null default '{}'::jsonb,
  note text not null default '',
  saved_at timestamptz not null default now(),
  primary key (tpl_id, ver)
);
alter table svy.tpl enable row level security;
alter table svy.tpl_ver enable row level security;
revoke all on svy.tpl, svy.tpl_ver from public, anon, authenticated;

create or replace function public.svy_tpl_list(p_token text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category, 'descr', t.descr,
      'default_ver', t.default_ver, 'uses', t.uses, 'updated_at', t.updated_at,
      'versions', (select coalesce(jsonb_agg(jsonb_build_object('ver', v.ver, 'note', v.note, 'saved_at', v.saved_at) order by v.ver desc), '[]'::jsonb) from svy.tpl_ver v where v.tpl_id = t.id))
      order by t.updated_at desc) from svy.tpl t), '[]'::jsonb);
end $$;

create or replace function public.svy_tpl_get(p_token text, p_id uuid, p_ver int default null)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare t svy.tpl; v svy.tpl_ver;
begin
  perform svy.sess(p_token);
  select * into t from svy.tpl where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v from svy.tpl_ver where tpl_id = p_id and ver = coalesce(p_ver, t.default_ver);
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'id', t.id, 'name', t.name, 'category', t.category, 'descr', t.descr, 'default_ver', t.default_ver,
    'ver', v.ver, 'note', v.note, 'def', v.def, 'theme', v.theme, 'saved_at', v.saved_at);
end $$;

-- 새 양식 만들기(p_id 없음) 또는 기존 양식의 새 버전 저장(p_id 있음)
create or replace function public.svy_tpl_save(p_token text, p_id uuid, p_name text, p_category text, p_descr text, p_def jsonb, p_theme jsonb, p_note text, p_set_default boolean default true)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare t svy.tpl; nv int; v_id uuid := p_id;
begin
  perform svy.sess(p_token);
  if p_def is null or jsonb_typeof(p_def) <> 'object' or pg_column_size(p_def) > 400000 then raise exception 'BAD_DEF'; end if;
  if v_id is null then
    if btrim(coalesce(p_name, '')) = '' then raise exception 'NAME_REQUIRED'; end if;
    insert into svy.tpl(name, category, descr) values (btrim(p_name), coalesce(nullif(btrim(p_category), ''), 'custom'), coalesce(p_descr, '')) returning id into v_id;
    nv := 1;
  else
    select * into t from svy.tpl where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    select coalesce(max(ver), 0) + 1 into nv from svy.tpl_ver where tpl_id = v_id;
    update svy.tpl set updated_at = now(),
      name = coalesce(nullif(btrim(p_name), ''), name), category = coalesce(nullif(btrim(p_category), ''), category), descr = coalesce(p_descr, descr)
     where id = v_id;
  end if;
  insert into svy.tpl_ver(tpl_id, ver, def, theme, note) values (v_id, nv, p_def, coalesce(p_theme, '{}'::jsonb), left(coalesce(p_note, ''), 200));
  if p_set_default or nv = 1 then update svy.tpl set default_ver = nv where id = v_id; end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'ver', nv);
end $$;

create or replace function public.svy_tpl_update(p_token text, p_id uuid, p_name text, p_category text, p_descr text, p_default_ver int)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  if p_default_ver is not null and not exists (select 1 from svy.tpl_ver where tpl_id = p_id and ver = p_default_ver) then raise exception 'NOT_FOUND'; end if;
  update svy.tpl set name = coalesce(nullif(btrim(p_name), ''), name), category = coalesce(nullif(btrim(p_category), ''), category), descr = coalesce(p_descr, descr),
    default_ver = coalesce(p_default_ver, default_ver), updated_at = now() where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_tpl_delete_ver(p_token text, p_id uuid, p_ver int)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare t svy.tpl; n int;
begin
  perform svy.sess(p_token);
  select * into t from svy.tpl where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select count(*) into n from svy.tpl_ver where tpl_id = p_id;
  if n <= 1 then raise exception 'LAST_VERSION'; end if;
  delete from svy.tpl_ver where tpl_id = p_id and ver = p_ver;
  if t.default_ver = p_ver then update svy.tpl set default_ver = (select max(ver) from svy.tpl_ver where tpl_id = p_id), updated_at = now() where id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_tpl_delete(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  delete from svy.tpl where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_tpl_use(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  update svy.tpl set uses = uses + 1 where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.svy_tpl_list(text), public.svy_tpl_get(text, uuid, int), public.svy_tpl_save(text, uuid, text, text, text, jsonb, jsonb, text, boolean),
  public.svy_tpl_update(text, uuid, text, text, text, int), public.svy_tpl_delete_ver(text, uuid, int), public.svy_tpl_delete(text, uuid), public.svy_tpl_use(text, uuid) to anon, authenticated;
```

## 9단계: 학생 화면에 담당자(교수) 이름 표시 (원터치)

> 2026-10-13 운영 DB에 이미 적용했습니다. **새 프로젝트로 옮기거나 DB를 다시 만들 때만** 실행하십시오. 함수 1개만 교체하므로 여러 번 실행해도 안전합니다.

1. Supabase 대시보드 → **SQL Editor** → 새 쿼리에 아래 SQL 전체를 붙여넣고 **Run** 합니다.
2. 확인: 설문 코드로 `select public.svy_public('설문코드')->'courses'->0;` 를 실행했을 때 `prof` 값이 보이면 완료입니다.

```sql
-- ============================================================================
-- 교내 설문 스키마 9/9: 학생용 과목 목록(svy_public)에 담당자(교수) 이름 포함
--  * 과목·교수 목록에 담당자가 등록되어 있으면 학생 화면에 과목과 함께 표시됩니다. (옵션 없음)
--  * 함수 1개만 교체합니다. 기존 데이터에는 영향이 없고 여러 번 실행해도 안전합니다.
-- ============================================================================

create or replace function public.svy_public(p_code text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare s svy.surveys; ph text; cs jsonb := '[]'::jsonb; cnt jsonb := '{}'::jsonb;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  ph := svy.phase(s);
  if ph = 'open' then
    if coalesce(s.def->>'mode', 'course') = 'course' then
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'track', track, 'grade', grade, 'klass', klass, 'name', name, 'kind', kind, 'prof', prof)
                                order by track, grade, klass, sort, name), '[]'::jsonb)
        into cs from svy.courses where survey_id = s.id and active;
    end if;
    cnt := svy.quota_counts(s);
  end if;
  return jsonb_build_object('ok', true, 'code', s.code, 'title', s.title, 'phase', ph, 'version', s.version, 'test', s.test_mode,
    'theme', s.theme, 'draw_msg', case when ph = 'result' then s.draw_msg else '' end, 'mode', coalesce(s.def->>'mode', 'course'),
    'def', case when ph = 'open' then svy.strip_answers(s.def) else jsonb_build_object('intro', s.def->'intro') end,
    'courses', cs, 'counts', cnt);
end $$;
```

## 10단계: 학생 화면의 담당 교수명 숨김 (원터치)
설문 설정의 「학생 화면의 담당 교수명 → 숨김」을 쓰려면 한 번만 실행합니다. 숨김 설문은 서버가 교수명을 학생 화면으로 보내지 않습니다. (Supabase → SQL Editor → New query → 아래 붙여넣고 Run, 여러 번 실행해도 안전)

```sql
-- 설문 DB 10단계: 학생 화면에 담당 교수명을 숨기는 설문(def.link.hideProf = true)은
--   svy_public 응답에서 prof 값을 서버에서 제외합니다. (화면 숨김이 아니라 전송 자체를 차단)
-- 관리자 결과·교수별 집계는 svy_a_* 함수를 쓰므로 영향이 없습니다. 여러 번 실행해도 안전합니다.
create or replace function public.svy_public(p_code text)
 returns jsonb language plpgsql stable security definer set search_path to 'svy', 'public'
as $function$
declare s svy.surveys; ph text; cs jsonb := '[]'::jsonb; cnt jsonb := '{}'::jsonb; hide boolean;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  ph := svy.phase(s);
  hide := coalesce((s.def->'link'->>'hideProf')::boolean, false);
  if ph = 'open' then
    if coalesce(s.def->>'mode', 'course') = 'course' then
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'track', track, 'grade', grade, 'klass', klass, 'name', name, 'kind', kind,
                                                   'prof', case when hide then null else prof end)
                                order by track, grade, klass, sort, name), '[]'::jsonb)
        into cs from svy.courses where survey_id = s.id and active;
    end if;
    cnt := svy.quota_counts(s);
  end if;
  return jsonb_build_object('ok', true, 'code', s.code, 'title', s.title, 'phase', ph, 'version', s.version, 'test', s.test_mode,
    'theme', s.theme, 'draw_msg', case when ph = 'result' then s.draw_msg else '' end, 'mode', coalesce(s.def->>'mode', 'course'),
    'def', case when ph = 'open' then svy.strip_answers(s.def) else jsonb_build_object('intro', s.def->'intro') end,
    'courses', cs, 'counts', cnt);
end $function$;
```
