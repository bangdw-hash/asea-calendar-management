-- 교내 설문 스키마 4/4: 테스트 모드 (수집 결과 초기화 후 정식 시작)
-- 1~3 적용 후 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--  * 테스트 모드 ON: 설문 상태와 무관하게 응답을 받고, 같은 기기에서도 반복 제출 가능, 응답은 is_test=true 로 표시
--  * 정식 시작 전 svy_a_reset 으로 테스트 데이터를 삭제하고, 테스트 모드를 OFF 합니다.
--  * 테스트 데이터가 남은 채 OFF 하면 TEST_DATA_EXISTS 오류로 막습니다.

alter table svy.surveys add column if not exists test_mode boolean not null default false;
alter table svy.responses add column if not exists is_test boolean not null default false;

create or replace function svy.phase(s svy.surveys)
returns text language sql stable security definer set search_path = svy, public as $$
  select case
    when s.result_from is not null and now() >= s.result_from
         and exists (select 1 from svy.draws d where d.survey_id = s.id and d.published) then 'result'
    when s.test_mode then 'open'
    when s.status = 'closed' or (s.close_at is not null and now() > s.close_at) then 'closed'
    when s.status = 'open' and (s.open_at is null or now() >= s.open_at) then 'open'
    else 'draft'
  end;
$$;

create or replace function public.svy_public(p_code text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare s svy.surveys; ph text; cs jsonb := '[]'::jsonb;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  ph := svy.phase(s);
  if ph = 'open' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'track', track, 'grade', grade, 'klass', klass, 'name', name, 'kind', kind)
                              order by track, grade, klass, sort, name), '[]'::jsonb)
      into cs from svy.courses where survey_id = s.id and active;
  end if;
  return jsonb_build_object('ok', true, 'code', s.code, 'title', s.title, 'phase', ph, 'version', s.version, 'test', s.test_mode,
    'theme', s.theme, 'draw_msg', case when ph = 'result' then s.draw_msg else '' end,
    'def', case when ph = 'open' then s.def else jsonb_build_object('intro', s.def->'intro') end,
    'courses', cs);
end $$;

create or replace function public.svy_submit(p_code text, p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = svy, extensions, public as $$
declare
  s svy.surveys; ex svy.responses; r svy.responses; cids text[]; chk jsonb; tk text;
  v_track text; v_grade text; v_klass text; v_dur int;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  if length(coalesce(p_token, '')) < 16 or length(p_token) > 80 then raise exception 'BAD_TOKEN'; end if;
  select * into ex from svy.responses where survey_id = s.id and client_token = p_token;
  if found then return jsonb_build_object('ok', true, 'duplicate', true, 'ticket', ex.ticket); end if;
  if svy.phase(s) <> 'open' then raise exception 'NOT_OPEN'; end if;
  if p_payload is null or pg_column_size(p_payload) > 200000 then raise exception 'TOO_LARGE'; end if;

  v_track := btrim(coalesce(p_payload->>'track', '')); v_grade := btrim(coalesce(p_payload->>'grade', '')); v_klass := btrim(coalesce(p_payload->>'klass', ''));
  select array_agg(id::text order by sort, name) into cids from svy.courses
   where survey_id = s.id and active and track = v_track and grade = v_grade and klass = v_klass;
  if cids is null then raise exception 'BAD_CLASS'; end if;

  chk := svy.check_answers(s.def, cids, p_payload->'answers');
  if chk->>'err' is not null then raise exception 'VALIDATION:%', chk->>'err'; end if;

  v_dur := least(greatest(coalesce((p_payload->>'duration')::int, 0), 0), 86400);
  tk := svy.gen_ticket(s.id);
  insert into svy.responses(survey_id, client_token, track, grade, klass, answers, ticket, attn_total, attn_fail, straight, text_len, duration_sec, version, is_test)
  values (s.id, p_token, v_track, v_grade, v_klass, p_payload->'answers', tk,
          (chk->>'attn_total')::int, (chk->>'attn_fail')::int, (chk->>'straight')::boolean, (chk->>'text_len')::int, v_dur, s.version, s.test_mode)
  on conflict (survey_id, client_token) do nothing returning * into r;
  if not found then
    select * into ex from svy.responses where survey_id = s.id and client_token = p_token;
    return jsonb_build_object('ok', true, 'duplicate', true, 'ticket', ex.ticket);
  end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'ticket', r.ticket);
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

-- 결과 초기화: scope 'test' = 테스트 응답만 삭제(+해당 번호의 추첨·수령 정리), 'all' = 모든 응답·추첨·수령 삭제
create or replace function public.svy_a_reset(p_token text, p_id uuid, p_scope text default 'test')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare n_resp int; n_draw int := 0; n_claim int := 0;
begin
  perform svy.sess(p_token);
  if not exists (select 1 from svy.surveys where id = p_id) then raise exception 'NOT_FOUND'; end if;
  if p_scope = 'all' then
    delete from svy.responses where survey_id = p_id; get diagnostics n_resp = row_count;
    delete from svy.draws where survey_id = p_id; get diagnostics n_draw = row_count;
    delete from svy.claims where survey_id = p_id; get diagnostics n_claim = row_count;
  elsif p_scope = 'test' then
    delete from svy.responses where survey_id = p_id and is_test; get diagnostics n_resp = row_count;
    update svy.draws d set tickets = array(select t from unnest(d.tickets) t where exists (select 1 from svy.responses r where r.survey_id = p_id and r.ticket = t)) where d.survey_id = p_id;
    delete from svy.claims c where c.survey_id = p_id and not exists (select 1 from svy.responses r where r.survey_id = p_id and r.ticket = c.ticket);
    get diagnostics n_claim = row_count;
  else
    raise exception 'BAD_SCOPE';
  end if;
  perform svy.log_add('reset', p_id::text, jsonb_build_object('scope', p_scope, 'responses', n_resp, 'draws', n_draw, 'claims', n_claim));
  return jsonb_build_object('ok', true, 'responses', n_resp, 'draws', n_draw, 'claims', n_claim);
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
        'text_len', text_len, 'duration_sec', duration_sec, 'excluded', excluded, 'is_test', is_test, 'version', version, 'created_at', created_at) order by seq), '[]'::jsonb)
      from (select * from svy.responses where survey_id = p_id and seq > coalesce(p_after, 0) order by seq limit 2000) x));
end $$;

create or replace function public.svy_a_list(p_token text)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'semester', s.semester, 'status', s.status, 'test_mode', s.test_mode,
      'phase', svy.phase(s), 'version', s.version, 'open_at', s.open_at, 'close_at', s.close_at, 'result_from', s.result_from,
      'created_at', s.created_at, 'updated_at', s.updated_at,
      'responses', (select count(*) from svy.responses r where r.survey_id = s.id),
      'test_responses', (select count(*) from svy.responses r where r.survey_id = s.id and r.is_test),
      'headcount', (select coalesce(sum(headcount), 0) from svy.targets t where t.survey_id = s.id),
      'courses', (select count(*) from svy.courses c where c.survey_id = s.id and c.active)) as x
    from svy.surveys s) q);
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
