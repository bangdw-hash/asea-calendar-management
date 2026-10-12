-- 교내 설문 스키마 2/3: 응답 검증 · 학생용(공개) RPC
-- 번호 순서대로 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)

-- ── 문항 1개 검증 ────────────────────────────────────────────────────────────
create or replace function svy.check_one(q jsonb, p_def jsonb, a jsonb)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare
  qid text := q->>'id'; typ text := q->>'type'; v jsonb := a->(q->>'id');
  has_chk boolean := (q->'check'->'valid') is not null;
  req boolean := coalesce((q->>'required')::boolean, false) or ((q->'check'->'valid') is not null);
  empty boolean; el jsonb; sc text; ids jsonb; ex_ids jsonb; n_ex int := 0; n int;
begin
  if not svy.q_visible(q, p_def, a) then return jsonb_build_object('hidden', true); end if;
  empty := v is null or jsonb_typeof(v) = 'null'
        or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
        or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0);
  if empty then
    if req then return jsonb_build_object('err', '필수 문항 누락: ' || qid); end if;
    return '{}'::jsonb;
  end if;

  if typ = 'scale' then
    sc := coalesce(q->>'scale', 'likert5');
    if jsonb_typeof(v) <> 'number' or not exists (
         select 1 from jsonb_array_elements(coalesce(p_def->'scales'->sc, '[]'::jsonb)) e
          where (e->>'v')::numeric = (v #>> '{}')::numeric) then
      return jsonb_build_object('err', '잘못된 척도 값: ' || qid);
    end if;
    return jsonb_build_object('num', (v #>> '{}')::numeric, 'has_check', has_chk,
      'pass', case when has_chk then (v #>> '{}')::numeric = (q->'check'->>'valid')::numeric else true end);

  elsif typ = 'single' then
    select coalesce(jsonb_agg(o->>'id'), '[]'::jsonb) into ids from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) o;
    if jsonb_typeof(v) <> 'string' or not (ids @> jsonb_build_array(v #>> '{}')) then
      return jsonb_build_object('err', '잘못된 선택 값: ' || qid);
    end if;
    return '{}'::jsonb;

  elsif typ = 'multi' then
    select coalesce(jsonb_agg(o->>'id'), '[]'::jsonb) into ids from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) o;
    select coalesce(jsonb_agg(o->>'id'), '[]'::jsonb) into ex_ids
      from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) o where coalesce((o->>'exclusive')::boolean, false);
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 30 then return jsonb_build_object('err', '잘못된 선택 값: ' || qid); end if;
    n := jsonb_array_length(v);
    for el in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(el) <> 'string' or not (ids @> jsonb_build_array(el #>> '{}')) then
        return jsonb_build_object('err', '잘못된 선택 값: ' || qid);
      end if;
      if ex_ids @> jsonb_build_array(el #>> '{}') then n_ex := n_ex + 1; end if;
    end loop;
    if n_ex > 0 and n > 1 then return jsonb_build_object('err', '배타 선택 충돌: ' || qid); end if;
    return '{}'::jsonb;

  elsif typ = 'text' then
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 2000 then return jsonb_build_object('err', '서술형 길이 초과: ' || qid); end if;
    return jsonb_build_object('tl', char_length(btrim(v #>> '{}')));
  end if;
  return '{}'::jsonb;
end $$;

-- ── 응답 전체 검증 + 성실응답 지표 계산 ─────────────────────────────────────
create or replace function svy.check_answers(p_def jsonb, p_course_ids text[], p_ans jsonb)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare
  q jsonb; cid text; r jsonb; a jsonb;
  attn_total int := 0; attn_fail int := 0; tl int := 0; nums numeric[] := '{}'; scope text; dist int;
begin
  if p_ans is null or jsonb_typeof(p_ans) <> 'object' then return jsonb_build_object('err', '응답 형식 오류'); end if;
  for q in
    select jsonb_set(x, '{scope}', '"common"') from jsonb_array_elements(coalesce(p_def->'basic', '[]'::jsonb)) x
    union all
    select x from jsonb_array_elements(coalesce(p_def->'sections', '[]'::jsonb)) s, jsonb_array_elements(coalesce(s->'questions', '[]'::jsonb)) x
  loop
    scope := coalesce(q->>'scope', 'course');
    if scope = 'common' then
      r := svy.check_one(q, p_def, coalesce(p_ans->'common', '{}'::jsonb));
      if r ? 'err' then return r; end if;
      if r ? 'tl' then tl := tl + (r->>'tl')::int; end if;
      if r ? 'has_check' then attn_total := attn_total + 1; if not (r->>'pass')::boolean then attn_fail := attn_fail + 1; end if; end if;
    else
      foreach cid in array p_course_ids loop
        a := coalesce(p_ans->'course'->cid, '{}'::jsonb);
        r := svy.check_one(q, p_def, a);
        if r ? 'err' then return r; end if;
        if r ? 'tl' then tl := tl + (r->>'tl')::int; end if;
        if r ? 'has_check' then
          attn_total := attn_total + 1;
          if not (r->>'pass')::boolean then attn_fail := attn_fail + 1; end if;
        elsif r ? 'num' then
          nums := nums || (r->>'num')::numeric;
        end if;
      end loop;
    end if;
  end loop;
  select count(distinct x) into dist from unnest(nums) x;
  return jsonb_build_object('err', null, 'attn_total', attn_total, 'attn_fail', attn_fail, 'text_len', tl,
                            'straight', coalesce(array_length(nums, 1), 0) >= 8 and dist = 1);
end $$;

-- ── 학생용 RPC ──────────────────────────────────────────────────────────────
create or replace function public.svy_ping()
returns jsonb language sql stable security definer set search_path = svy, public as $$
  select jsonb_build_object('ok', true, 'ts', now(), 'schema', to_regclass('svy.surveys') is not null);
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
  return jsonb_build_object('ok', true, 'code', s.code, 'title', s.title, 'phase', ph, 'version', s.version,
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
  insert into svy.responses(survey_id, client_token, track, grade, klass, answers, ticket, attn_total, attn_fail, straight, text_len, duration_sec, version)
  values (s.id, p_token, v_track, v_grade, v_klass, p_payload->'answers', tk,
          (chk->>'attn_total')::int, (chk->>'attn_fail')::int, (chk->>'straight')::boolean, (chk->>'text_len')::int, v_dur, s.version)
  on conflict (survey_id, client_token) do nothing returning * into r;
  if not found then
    select * into ex from svy.responses where survey_id = s.id and client_token = p_token;
    return jsonb_build_object('ok', true, 'duplicate', true, 'ticket', ex.ticket);
  end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'ticket', r.ticket);
end $$;

create or replace function public.svy_draw_check(p_code text, p_ticket text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare s svy.surveys; t text; d svy.draws; c svy.claims; found_r boolean;
begin
  select * into s from svy.surveys where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'NOT_FOUND'; end if;
  if svy.phase(s) <> 'result' then return jsonb_build_object('ok', true, 'state', 'unavailable'); end if;
  t := upper(regexp_replace(coalesce(p_ticket, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(t) <> 8 then return jsonb_build_object('ok', true, 'state', 'unknown'); end if;
  t := substr(t, 1, 4) || '-' || substr(t, 5);
  select exists (select 1 from svy.responses where survey_id = s.id and ticket = t) into found_r;
  if not found_r then return jsonb_build_object('ok', true, 'state', 'unknown'); end if;
  select * into d from svy.draws where survey_id = s.id and published order by id desc limit 1;
  if d.tickets @> array[t] then
    select * into c from svy.claims where survey_id = s.id and ticket = t;
    return jsonb_build_object('ok', true, 'state', 'won', 'ticket', t, 'claimed', c.ticket is not null,
                              'claimed_at', c.claimed_at, 'msg', s.draw_msg);
  end if;
  return jsonb_build_object('ok', true, 'state', 'lost', 'ticket', t);
end $$;
