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
