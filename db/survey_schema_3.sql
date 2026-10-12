-- 교내 설문 스키마 3/3: 관리자 RPC · 실행 권한
-- 번호 순서대로 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)

create or replace function svy.norm_ticket(p text)
returns text language sql immutable set search_path = svy, public as $$
  select case when length(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g')) = 8
    then substr(regexp_replace(upper(p), '[^A-Z0-9]', '', 'g'), 1, 4) || '-' || substr(regexp_replace(upper(p), '[^A-Z0-9]', '', 'g'), 5)
    else null end;
$$;

-- ── 로그인 ──────────────────────────────────────────────────────────────────
create or replace function public.svy_a_login(p_pw text)
returns jsonb language plpgsql security definer set search_path = svy, extensions, public as $$
declare v svy.secret;
begin
  select * into v from svy.secret where id = 1 for update;
  if v.admin_hash is null then return jsonb_build_object('ok', false, 'error', 'ADMIN_NOT_SET'); end if;
  if v.admin_locked_until is not null and v.admin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED_OUT', 'until', v.admin_locked_until);
  end if;
  if crypt(coalesce(p_pw, ''), v.admin_hash) <> v.admin_hash then
    update svy.secret set admin_fail = case when admin_fail + 1 >= 5 then 0 else admin_fail + 1 end,
           admin_locked_until = case when admin_fail + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = 1;
    return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD', 'left', greatest(5 - (v.admin_fail + 1), 0));
  end if;
  update svy.secret set admin_fail = 0, admin_locked_until = null where id = 1;
  perform svy.log_add('login', '');
  return jsonb_build_object('ok', true, 'token', svy.new_session());
end $$;

create or replace function public.svy_a_logout(p_token text)
returns void language sql security definer set search_path = svy, extensions, public as $$
  delete from svy.sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.svy_a_change_pw(p_token text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path = svy, extensions, public as $$
declare v svy.secret;
begin
  perform svy.sess(p_token);
  if p_new is null or char_length(p_new) < 8 then return jsonb_build_object('ok', false, 'error', 'PW_TOO_SHORT'); end if;
  select * into v from svy.secret where id = 1;
  if crypt(coalesce(p_old, ''), v.admin_hash) <> v.admin_hash then return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD'); end if;
  update svy.secret set admin_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  perform svy.log_add('pw_change', '');
  return jsonb_build_object('ok', true);
end $$;

-- ── DB 상태 점검(무료 플랜 활성화 테스트용) ─────────────────────────────────
create or replace function public.svy_a_health(p_token text)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return jsonb_build_object('ok', true, 'ts', now(),
    'db_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'surveys', (select count(*) from svy.surveys),
    'responses', (select count(*) from svy.responses),
    'courses', (select count(*) from svy.courses),
    'tables', (select count(*) from information_schema.tables where table_schema = 'svy'),
    'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'svy\_%'));
end $$;

-- ── 설문 목록 · 상세 ────────────────────────────────────────────────────────
create or replace function public.svy_a_list(p_token text)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title, 'semester', s.semester, 'status', s.status,
      'phase', svy.phase(s), 'version', s.version, 'open_at', s.open_at, 'close_at', s.close_at, 'result_from', s.result_from,
      'created_at', s.created_at, 'updated_at', s.updated_at,
      'responses', (select count(*) from svy.responses r where r.survey_id = s.id),
      'headcount', (select coalesce(sum(headcount), 0) from svy.targets t where t.survey_id = s.id),
      'courses', (select count(*) from svy.courses c where c.survey_id = s.id and c.active)) as x
    from svy.surveys s) q);
end $$;

create or replace function public.svy_a_get(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare s svy.surveys;
begin
  perform svy.sess(p_token);
  select * into s from svy.surveys where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'survey', to_jsonb(s), 'phase', svy.phase(s),
    'courses', (select coalesce(jsonb_agg(to_jsonb(c) order by c.track, c.grade, c.klass, c.sort, c.name), '[]'::jsonb) from svy.courses c where c.survey_id = s.id),
    'targets', (select coalesce(jsonb_agg(to_jsonb(t) order by t.track, t.grade), '[]'::jsonb) from svy.targets t where t.survey_id = s.id),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'note', v.note, 'saved_at', v.saved_at) order by v.version desc), '[]'::jsonb) from svy.survey_versions v where v.survey_id = s.id),
    'draws', (select coalesce(jsonb_agg(to_jsonb(d) order by d.id desc), '[]'::jsonb) from svy.draws d where d.survey_id = s.id),
    'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from svy.claims c where c.survey_id = s.id));
end $$;

-- ── 생성 · 복제 · 저장 · 삭제 ───────────────────────────────────────────────
create or replace function public.svy_a_create(p_token text, p_title text, p_semester text, p_def jsonb, p_theme jsonb, p_clone_from uuid default null)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare v_id uuid; src svy.surveys; v_def jsonb := coalesce(p_def, '{}'::jsonb); v_theme jsonb := coalesce(p_theme, '{}'::jsonb); v_title text := btrim(coalesce(p_title, ''));
begin
  perform svy.sess(p_token);
  if p_clone_from is not null then
    select * into src from svy.surveys where id = p_clone_from;
    if not found then raise exception 'NOT_FOUND'; end if;
    v_def := src.def; v_theme := src.theme;
    if v_title = '' then v_title := src.title || ' (복제)'; end if;
  end if;
  if v_title = '' then raise exception 'TITLE_REQUIRED'; end if;
  insert into svy.surveys(code, title, semester, def, theme, cloned_from)
  values (svy.gen_code(), v_title, btrim(coalesce(p_semester, '')), v_def, v_theme, p_clone_from) returning id into v_id;
  insert into svy.survey_versions(survey_id, version, def, theme, note) values (v_id, 1, v_def, v_theme, case when p_clone_from is null then '최초 생성' else '복제' end);
  if p_clone_from is not null then
    insert into svy.courses(survey_id, track, grade, klass, name, prof, kind, sort, active)
      select v_id, track, grade, klass, name, prof, kind, sort, true from svy.courses where survey_id = p_clone_from and active;
    insert into svy.targets(survey_id, track, grade, headcount) select v_id, track, grade, headcount from svy.targets where survey_id = p_clone_from;
  end if;
  perform svy.log_add('create', v_id::text, jsonb_build_object('title', v_title, 'clone_from', p_clone_from));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.svy_a_save(p_token text, p_id uuid, p_patch jsonb, p_note text default '')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare s svy.surveys; n svy.surveys; changed boolean; v_status text;
begin
  perform svy.sess(p_token);
  select * into s from svy.surveys where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_status := case when p_patch ? 'status' then p_patch->>'status' else s.status end;
  if v_status not in ('draft', 'open', 'closed') then raise exception 'BAD_STATUS'; end if;
  if v_status = 'open' and s.status <> 'open' and not exists (select 1 from svy.courses where survey_id = s.id and active) then
    raise exception 'NO_COURSES';
  end if;
  changed := (p_patch ? 'def' and (p_patch->'def') is distinct from s.def) or (p_patch ? 'theme' and (p_patch->'theme') is distinct from s.theme);
  update svy.surveys set
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    semester = case when p_patch ? 'semester' then btrim(coalesce(p_patch->>'semester', '')) else semester end,
    status = v_status,
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

create or replace function public.svy_a_version_get(p_token text, p_id uuid, p_version int)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare v svy.survey_versions;
begin
  perform svy.sess(p_token);
  select * into v from svy.survey_versions where survey_id = p_id and version = p_version;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'version', v.version, 'def', v.def, 'theme', v.theme, 'note', v.note, 'saved_at', v.saved_at);
end $$;

create or replace function public.svy_a_delete(p_token text, p_id uuid, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  if not p_force and exists (select 1 from svy.responses where survey_id = p_id) then raise exception 'HAS_RESPONSES'; end if;
  delete from svy.surveys where id = p_id;
  perform svy.log_add('delete', p_id::text, jsonb_build_object('force', p_force));
  return jsonb_build_object('ok', true);
end $$;

-- ── 과목 · 배포 인원 ────────────────────────────────────────────────────────
create or replace function public.svy_a_courses_save(p_token text, p_id uuid, p_rows jsonb, p_mode text default 'merge')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare r jsonb; i int := 0; keys text[] := '{}'; k text; has_resp boolean; n_up int := 0; n_rm int := 0;
  v_track text; v_grade text; v_klass text; v_name text;
begin
  perform svy.sess(p_token);
  if not exists (select 1 from svy.surveys where id = p_id) then raise exception 'NOT_FOUND'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then raise exception 'BAD_ROWS'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_track := btrim(coalesce(r->>'track', '')); v_grade := btrim(coalesce(r->>'grade', ''));
    v_klass := btrim(coalesce(r->>'klass', '')); v_name := btrim(coalesce(r->>'name', ''));
    if v_track = '' or v_grade = '' or v_klass = '' or v_name = '' then raise exception 'ROW_INVALID:%', i; end if;
    k := v_track || '|' || v_grade || '|' || v_klass || '|' || v_name;
    keys := keys || k;
    insert into svy.courses(survey_id, track, grade, klass, name, prof, kind, sort, active)
    values (p_id, v_track, v_grade, v_klass, v_name, btrim(coalesce(r->>'prof', '')), btrim(coalesce(r->>'kind', '')), i, true)
    on conflict (survey_id, track, grade, klass, name)
    do update set prof = excluded.prof, kind = excluded.kind, sort = excluded.sort, active = true;
    n_up := n_up + 1;
  end loop;
  if p_mode = 'replace' then
    select exists (select 1 from svy.responses where survey_id = p_id) into has_resp;
    if has_resp then
      update svy.courses set active = false where survey_id = p_id and active and not ((track || '|' || grade || '|' || klass || '|' || name) = any(keys));
    else
      delete from svy.courses where survey_id = p_id and not ((track || '|' || grade || '|' || klass || '|' || name) = any(keys));
    end if;
    get diagnostics n_rm = row_count;
  end if;
  update svy.surveys set updated_at = now() where id = p_id;
  perform svy.log_add('courses_save', p_id::text, jsonb_build_object('rows', n_up, 'mode', p_mode));
  return jsonb_build_object('ok', true, 'saved', n_up, 'removed', n_rm);
end $$;

create or replace function public.svy_a_course_delete(p_token text, p_course_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare c svy.courses;
begin
  perform svy.sess(p_token);
  select * into c from svy.courses where id = p_course_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from svy.responses where survey_id = c.survey_id) then
    update svy.courses set active = false where id = p_course_id;
    return jsonb_build_object('ok', true, 'soft', true);
  end if;
  delete from svy.courses where id = p_course_id;
  return jsonb_build_object('ok', true, 'soft', false);
end $$;

create or replace function public.svy_a_targets_save(p_token text, p_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare r jsonb; n int := 0; v_track text; v_grade text;
begin
  perform svy.sess(p_token);
  if not exists (select 1 from svy.surveys where id = p_id) then raise exception 'NOT_FOUND'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'BAD_ROWS'; end if;
  delete from svy.targets where survey_id = p_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_track := btrim(coalesce(r->>'track', '')); v_grade := btrim(coalesce(r->>'grade', ''));
    if v_track = '' or v_grade = '' then continue; end if;
    insert into svy.targets(survey_id, track, grade, headcount) values (p_id, v_track, v_grade, greatest(coalesce((r->>'headcount')::int, 0), 0))
    on conflict (survey_id, track, grade) do update set headcount = excluded.headcount;
    n := n + 1;
  end loop;
  perform svy.log_add('targets_save', p_id::text, jsonb_build_object('rows', n));
  return jsonb_build_object('ok', true, 'saved', n);
end $$;

-- ── 결과 조회(증분) ─────────────────────────────────────────────────────────
create or replace function public.svy_a_results(p_token text, p_id uuid, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return jsonb_build_object('ok', true, 'ts', now(),
    'total', (select count(*) from svy.responses where survey_id = p_id),
    'max_seq', (select coalesce(max(seq), 0) from svy.responses where survey_id = p_id),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'id', id, 'track', track, 'grade', grade, 'klass', klass,
        'answers', answers, 'ticket', ticket, 'attn_total', attn_total, 'attn_fail', attn_fail, 'straight', straight,
        'text_len', text_len, 'duration_sec', duration_sec, 'excluded', excluded, 'version', version, 'created_at', created_at) order by seq), '[]'::jsonb)
      from (select * from svy.responses where survey_id = p_id and seq > coalesce(p_after, 0) order by seq limit 2000) x));
end $$;

create or replace function public.svy_a_response_flag(p_token text, p_resp_id uuid, p_excluded boolean)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  update svy.responses set excluded = coalesce(p_excluded, false) where id = p_resp_id;
  perform svy.log_add('response_flag', p_resp_id::text, jsonb_build_object('excluded', p_excluded));
  return jsonb_build_object('ok', true);
end $$;

-- ── 추첨 ────────────────────────────────────────────────────────────────────
create or replace function public.svy_a_draw(p_token text, p_id uuid, p_n int, p_criteria jsonb, p_exclude text[] default '{}', p_note text default '')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare cr jsonb := coalesce(p_criteria, '{}'::jsonb); v_max_fail int; v_no_straight boolean; v_min_sec int; v_min_text int;
  ex text[]; pool int; picked text[]; v_id bigint;
begin
  perform svy.sess(p_token);
  if p_n is null or p_n < 1 or p_n > 500 then raise exception 'BAD_N'; end if;
  v_max_fail := coalesce((cr->>'max_fail')::int, 0);
  v_no_straight := coalesce((cr->>'no_straight')::boolean, true);
  v_min_sec := coalesce((cr->>'min_seconds')::int, 0);
  v_min_text := coalesce((cr->>'min_text')::int, 0);
  select coalesce(array_agg(svy.norm_ticket(x)) filter (where svy.norm_ticket(x) is not null), '{}') into ex from unnest(coalesce(p_exclude, '{}')) x;
  select count(*) into pool from svy.responses
   where survey_id = p_id and not excluded and attn_fail <= v_max_fail and (not v_no_straight or not straight)
     and duration_sec >= v_min_sec and text_len >= v_min_text and not (ticket = any(ex));
  select coalesce(array_agg(ticket), '{}') into picked from (
    select ticket from svy.responses
     where survey_id = p_id and not excluded and attn_fail <= v_max_fail and (not v_no_straight or not straight)
       and duration_sec >= v_min_sec and text_len >= v_min_text and not (ticket = any(ex))
     order by random() limit p_n) q;
  insert into svy.draws(survey_id, n, criteria, tickets, pool_size, note) values (p_id, p_n, cr, picked, pool, coalesce(p_note, '')) returning id into v_id;
  perform svy.log_add('draw', p_id::text, jsonb_build_object('draw', v_id, 'n', p_n, 'pool', pool));
  return jsonb_build_object('ok', true, 'id', v_id, 'tickets', to_jsonb(picked), 'pool_size', pool);
end $$;

create or replace function public.svy_a_draw_edit(p_token text, p_draw_id bigint, p_tickets text[])
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare d svy.draws; t text; list text[] := '{}';
begin
  perform svy.sess(p_token);
  select * into d from svy.draws where id = p_draw_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  foreach t in array coalesce(p_tickets, '{}') loop
    t := svy.norm_ticket(t);
    if t is null or not exists (select 1 from svy.responses where survey_id = d.survey_id and ticket = t) then raise exception 'TICKET_INVALID'; end if;
    if not (t = any(list)) then list := list || t; end if;
  end loop;
  update svy.draws set tickets = list where id = p_draw_id;
  perform svy.log_add('draw_edit', d.survey_id::text, jsonb_build_object('draw', p_draw_id, 'count', coalesce(array_length(list, 1), 0)));
  return jsonb_build_object('ok', true, 'tickets', to_jsonb(list));
end $$;

create or replace function public.svy_a_draw_publish(p_token text, p_draw_id bigint, p_publish boolean)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare d svy.draws;
begin
  perform svy.sess(p_token);
  select * into d from svy.draws where id = p_draw_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_publish then update svy.draws set published = false where survey_id = d.survey_id and id <> p_draw_id; end if;
  update svy.draws set published = coalesce(p_publish, false) where id = p_draw_id;
  perform svy.log_add('draw_publish', d.survey_id::text, jsonb_build_object('draw', p_draw_id, 'publish', p_publish));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_a_draw_delete(p_token text, p_draw_id bigint)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  if exists (select 1 from svy.draws where id = p_draw_id and published) then raise exception 'PUBLISHED'; end if;
  delete from svy.draws where id = p_draw_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_a_claim_check(p_token text, p_id uuid, p_ticket text)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare t text := svy.norm_ticket(p_ticket); d svy.draws; c svy.claims;
begin
  perform svy.sess(p_token);
  if t is null then return jsonb_build_object('ok', true, 'state', 'invalid'); end if;
  if not exists (select 1 from svy.responses where survey_id = p_id and ticket = t) then return jsonb_build_object('ok', true, 'state', 'unknown', 'ticket', t); end if;
  select * into d from svy.draws where survey_id = p_id and published order by id desc limit 1;
  if not found then return jsonb_build_object('ok', true, 'state', 'no_published_draw', 'ticket', t); end if;
  if not (d.tickets @> array[t]) then return jsonb_build_object('ok', true, 'state', 'lost', 'ticket', t); end if;
  select * into c from svy.claims where survey_id = p_id and ticket = t;
  return jsonb_build_object('ok', true, 'state', 'won', 'ticket', t, 'claimed', c.ticket is not null, 'claimed_at', c.claimed_at, 'memo', c.memo);
end $$;

create or replace function public.svy_a_claim_set(p_token text, p_id uuid, p_ticket text, p_claimed boolean, p_memo text default '')
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare t text := svy.norm_ticket(p_ticket); d svy.draws;
begin
  perform svy.sess(p_token);
  select * into d from svy.draws where survey_id = p_id and published order by id desc limit 1;
  if not found or t is null or not (d.tickets @> array[t]) then raise exception 'NOT_WINNER'; end if;
  if p_claimed then
    insert into svy.claims(survey_id, ticket, memo) values (p_id, t, coalesce(p_memo, ''))
    on conflict (survey_id, ticket) do update set memo = excluded.memo;
  else
    delete from svy.claims where survey_id = p_id and ticket = t;
  end if;
  perform svy.log_add('claim', p_id::text, jsonb_build_object('ticket', t, 'claimed', p_claimed));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_a_log(p_token text, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
            from (select * from svy.log order by id desc limit least(coalesce(p_limit, 200), 1000)) x);
end $$;

-- ── 실행 권한: public.svy_* 만 anon/authenticated 에 부여 ───────────────────
revoke all on all functions in schema svy from public, anon, authenticated;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'svy\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
