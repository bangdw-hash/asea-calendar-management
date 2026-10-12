-- ============================================================================
-- 교내 설문 스키마 6/6: 범용 설문 엔진
--  * 설문 유형(def.mode: 'course' 교과목별 / 'general' 행사·전체 공통)
--  * 문항 형식 확장: 텍스트 검증(숫자·이메일·전화·URL·패턴), 드롭다운, 선형배율, 별점, NPS, 슬라이더,
--    그리드(라디오·체크박스), 순위, 합계 배분, 날짜·시간, 파일·사진·서명, 주소, 위치, QR, 이미지 선택, 동의, 안내 블록
--  * 조건 표시(영역·문항 showIf: all/any + 연산자), 퀴즈 채점, 정원(전체·선택지별), 파일 저장(svy.files)
--  * 테이블은 컬럼 추가(score, max_score)와 files 테이블 1개만 추가합니다. 기존 데이터에는 영향이 없습니다.
--  * 여러 번 실행해도 안전합니다. 아래 [1]~[6] 순서대로 실행하십시오(한 번에 붙여넣어도 됩니다).
-- ============================================================================

-- [1] 테이블 · 보조 함수 ------------------------------------------------------
alter table svy.responses add column if not exists score numeric;
alter table svy.responses add column if not exists max_score numeric;

create table if not exists svy.files (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  client_token text not null,
  response_id uuid references svy.responses(id) on delete cascade,
  qid text not null,
  name text not null default '',
  mime text not null default '',
  size int not null default 0,
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists files_resp_idx on svy.files(response_id);
create index if not exists files_tok_idx on svy.files(survey_id, client_token);
alter table svy.files enable row level security;
revoke all on svy.files from public, anon, authenticated;

create or replace function svy.to_num(t text)
returns numeric language sql immutable set search_path = svy, public as $$
  select case when t ~ '^-?[0-9]+(\.[0-9]+)?$' then t::numeric else null end;
$$;

create or replace function svy.valid_date(t text)
returns boolean language plpgsql immutable set search_path = svy, public as $$
begin
  if t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  perform t::date; return true;
exception when others then return false;
end $$;

create or replace function svy.opt_ids(q jsonb)
returns jsonb language sql immutable set search_path = svy, public as $$
  select coalesce(jsonb_agg(o->>'id'), '[]'::jsonb) from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) o;
$$;

-- [2] 조건 평가 ---------------------------------------------------------------
-- cond: {"q":"Q1","op":"eq|ne|in|nin|has|nhas|answered|empty|gt|gte|lt|lte","v":값}
create or replace function svy.cond_one(p jsonb, a jsonb, c jsonb)
returns boolean language plpgsql immutable set search_path = svy, public as $$
declare v jsonb := coalesce(a->(p->>'q'), c->(p->>'q')); op text := p->>'op'; x jsonb := p->'v';
  vt text; vs text; xs text; nv numeric; nx numeric; ans boolean; r boolean;
begin
  ans := v is not null and jsonb_typeof(v) <> 'null'
         and not (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
         and not (jsonb_typeof(v) in ('array', 'object') and (v = '[]'::jsonb or v = '{}'::jsonb));
  if op = 'answered' then return ans; elsif op = 'empty' then return not ans; end if;
  if not ans then return op in ('ne', 'nin', 'nhas'); end if;
  vt := jsonb_typeof(v); xs := x #>> '{}';
  vs := case when vt in ('string', 'number', 'boolean') then v #>> '{}' else null end;
  if op in ('eq', 'ne') then
    nv := svy.to_num(vs); nx := svy.to_num(xs);
    r := coalesce(case when nv is not null and nx is not null then nv = nx else vs = xs end, false);
    return case when op = 'eq' then r else not r end;
  elsif op in ('in', 'nin') then
    r := coalesce(vs is not null and exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(x) = 'array' then x else '[]'::jsonb end) e where e = vs), false);
    return case when op = 'in' then r else not r end;
  elsif op in ('has', 'nhas') then
    r := coalesce(vt = 'array' and exists (select 1 from jsonb_array_elements_text(v) e where e = xs), false);
    return case when op = 'has' then r else not r end;
  elsif op in ('gt', 'gte', 'lt', 'lte') then
    nv := svy.to_num(vs); nx := svy.to_num(xs);
    if nv is null or nx is null then return false; end if;
    return case op when 'gt' then nv > nx when 'gte' then nv >= nx when 'lt' then nv < nx else nv <= nx end;
  end if;
  return true;
end $$;

-- 조건 그룹: {"all":[...]} | {"any":[...]} | 단일 cond | 옛 형식 {"q":"F1"}(복수선택에서 단독 선택 외 항목 선택)
create or replace function svy.vis(p_cond jsonb, p_def jsonb, a jsonb, c jsonb)
returns boolean language plpgsql immutable set search_path = svy, public as $$
declare e jsonb;
begin
  if p_cond is null or jsonb_typeof(p_cond) <> 'object' then return true; end if;
  if p_cond ? 'all' then
    if jsonb_typeof(p_cond->'all') = 'array' then
      for e in select * from jsonb_array_elements(p_cond->'all') loop if not svy.vis(e, p_def, a, c) then return false; end if; end loop;
    end if;
    return true;
  elsif p_cond ? 'any' then
    if jsonb_typeof(p_cond->'any') = 'array' then
      for e in select * from jsonb_array_elements(p_cond->'any') loop if svy.vis(e, p_def, a, c) then return true; end if; end loop;
    end if;
    return false;
  elsif p_cond ? 'op' then
    return svy.cond_one(p_cond, a, c);
  elsif p_cond ? 'q' then
    return svy.q_visible(jsonb_build_object('showIf', p_cond), p_def, coalesce(a, '{}'::jsonb));
  end if;
  return true;
end $$;

-- [3] 문항 1개 검증 (모든 형식) ------------------------------------------------
create or replace function svy.check_one2(q jsonb, p_def jsonb, a jsonb, c jsonb, p_survey uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare
  qid text := q->>'id'; typ text := q->>'type'; v jsonb := a->(q->>'id');
  has_chk boolean := (q->'check'->'valid') is not null;
  req boolean := coalesce((q->>'required')::boolean, false) or ((q->'check'->'valid') is not null);
  mx numeric := case when (q ? 'answer') and jsonb_typeof(q->'answer') <> 'null' then coalesce(svy.to_num(q->>'points'), 1) else 0 end;
  empty boolean; ids jsonb; ex_ids jsonb; rows_ids jsonb; cols_ids jsonb; el jsonb; s text; n numeric; cnt int; nn int;
  fmt text; mn numeric; mxv numeric; tl int := 0; pts numeric := 0; other text; fids text[] := '{}'; r record; tot numeric; e text;
  oth boolean := coalesce((q->>'other')::boolean, false);
begin
  if typ = 'block' then return '{}'::jsonb; end if;
  if not svy.vis(q->'showIf', p_def, a, c) then return jsonb_build_object('hidden', true); end if;
  empty := v is null or jsonb_typeof(v) = 'null'
        or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
        or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0)
        or (jsonb_typeof(v) = 'object' and v = '{}'::jsonb)
        or (typ = 'consent' and v = 'false'::jsonb);
  if empty then
    if req then return jsonb_build_object('err', '필수 문항 누락: ' || qid); end if;
    return jsonb_build_object('mx', mx);
  end if;

  if typ = 'text' then
    if jsonb_typeof(v) <> 'string' then return jsonb_build_object('err', '잘못된 입력: ' || qid); end if;
    s := v #>> '{}'; fmt := coalesce(q->>'format', 'text');
    if char_length(s) > least(coalesce(svy.to_num(q->>'maxLen'), 2000), 5000)::int then return jsonb_build_object('err', '입력 길이 초과: ' || qid); end if;
    if svy.to_num(q->>'minLen') is not null and char_length(btrim(s)) < svy.to_num(q->>'minLen') then return jsonb_build_object('err', '입력이 너무 짧습니다: ' || qid); end if;
    if fmt = 'number' then
      n := svy.to_num(btrim(s));
      if n is null then return jsonb_build_object('err', '숫자 형식이 아닙니다: ' || qid); end if;
      if svy.to_num(q->>'min') is not null and n < svy.to_num(q->>'min') then return jsonb_build_object('err', '최솟값 미만: ' || qid); end if;
      if svy.to_num(q->>'max') is not null and n > svy.to_num(q->>'max') then return jsonb_build_object('err', '최댓값 초과: ' || qid); end if;
      if (q->>'integer') = 'true' and btrim(s) !~ '^-?[0-9]+$' then return jsonb_build_object('err', '정수만 입력할 수 있습니다: ' || qid); end if;
    elsif fmt = 'email' then
      if s !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return jsonb_build_object('err', '이메일 형식이 아닙니다: ' || qid); end if;
    elsif fmt = 'phone' then
      if s !~ '^[0-9+() -]{7,20}$' then return jsonb_build_object('err', '전화번호 형식이 아닙니다: ' || qid); end if;
    elsif fmt = 'url' then
      if s !~* '^https?://[^[:space:]]+$' then return jsonb_build_object('err', 'URL 형식이 아닙니다: ' || qid); end if;
    elsif fmt = 'pattern' and coalesce(q->>'pattern', '') <> '' then
      begin
        if s !~ (q->>'pattern') then return jsonb_build_object('err', coalesce(nullif(q->>'patternMsg', ''), '입력 형식이 올바르지 않습니다') || ': ' || qid); end if;
      exception when invalid_regular_expression then null;
      end;
    end if;
    if fmt in ('text', 'pattern') then tl := char_length(btrim(s)); end if;
    if mx > 0 then
      if jsonb_typeof(q->'answer') = 'array' then
        pts := case when exists (select 1 from jsonb_array_elements_text(q->'answer') z where lower(btrim(z)) = lower(btrim(s))) then mx else 0 end;
      else pts := case when lower(btrim(q->>'answer')) = lower(btrim(s)) or (svy.to_num(q->>'answer') is not null and svy.to_num(btrim(s)) = svy.to_num(q->>'answer')) then mx else 0 end; end if;
    end if;
    return jsonb_build_object('tl', tl, 'pts', pts, 'mx', mx);

  elsif typ = 'single' then
    ids := svy.opt_ids(q);
    if jsonb_typeof(v) <> 'string' then return jsonb_build_object('err', '잘못된 선택 값: ' || qid); end if;
    s := v #>> '{}';
    if s = '__other' and oth then
      other := btrim(coalesce(a->>(qid || '_other'), ''));
      if other = '' or char_length(other) > 200 then return jsonb_build_object('err', '기타 내용 오류: ' || qid); end if;
      tl := char_length(other);
    elsif not (ids @> jsonb_build_array(s)) then return jsonb_build_object('err', '잘못된 선택 값: ' || qid); end if;
    if mx > 0 then pts := case when s = (q->>'answer') then mx else 0 end; end if;
    return jsonb_build_object('tl', tl, 'pts', pts, 'mx', mx);

  elsif typ = 'multi' then
    ids := svy.opt_ids(q);
    select coalesce(jsonb_agg(o->>'id'), '[]'::jsonb) into ex_ids from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) o where coalesce((o->>'exclusive')::boolean, false);
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 40 then return jsonb_build_object('err', '잘못된 선택 값: ' || qid); end if;
    cnt := jsonb_array_length(v); nn := 0;
    for el in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(el) <> 'string' then return jsonb_build_object('err', '잘못된 선택 값: ' || qid); end if;
      s := el #>> '{}';
      if s = '__other' and oth then
        other := btrim(coalesce(a->>(qid || '_other'), ''));
        if other = '' or char_length(other) > 200 then return jsonb_build_object('err', '기타 내용 오류: ' || qid); end if;
        tl := char_length(other);
      elsif not (ids @> jsonb_build_array(s)) then return jsonb_build_object('err', '잘못된 선택 값: ' || qid); end if;
      if ex_ids @> jsonb_build_array(s) then nn := nn + 1; end if;
    end loop;
    if nn > 0 and cnt > 1 then return jsonb_build_object('err', '배타 선택 충돌: ' || qid); end if;
    if svy.to_num(q->>'minSel') is not null and cnt < svy.to_num(q->>'minSel') then return jsonb_build_object('err', '선택 개수 부족: ' || qid); end if;
    if svy.to_num(q->>'maxSel') is not null and cnt > svy.to_num(q->>'maxSel') then return jsonb_build_object('err', '선택 개수 초과: ' || qid); end if;
    if mx > 0 then pts := case when jsonb_typeof(q->'answer') = 'array' and v @> (q->'answer') and (q->'answer') @> v then mx else 0 end; end if;
    return jsonb_build_object('tl', tl, 'pts', pts, 'mx', mx);

  elsif typ = 'scale' then
    fmt := coalesce(q->>'scale', 'likert5');
    if jsonb_typeof(v) <> 'number' or not exists (
         select 1 from jsonb_array_elements(coalesce(p_def->'scales'->fmt, '[]'::jsonb)) z
          where (z->>'v')::numeric = (v #>> '{}')::numeric) then
      return jsonb_build_object('err', '잘못된 척도 값: ' || qid);
    end if;
    if mx > 0 then pts := case when svy.to_num(q->>'answer') = (v #>> '{}')::numeric then mx else 0 end; end if;
    return jsonb_build_object('num', (v #>> '{}')::numeric, 'has_check', has_chk, 'pts', pts, 'mx', mx,
      'pass', case when has_chk then (v #>> '{}')::numeric = (q->'check'->>'valid')::numeric else true end);

  elsif typ in ('linear', 'rating', 'nps', 'slider') then
    if jsonb_typeof(v) <> 'number' then return jsonb_build_object('err', '잘못된 값: ' || qid); end if;
    n := (v #>> '{}')::numeric;
    if typ = 'linear' then mn := coalesce(svy.to_num(q->>'min'), 1); mxv := coalesce(svy.to_num(q->>'max'), 5);
    elsif typ = 'rating' then mn := 1; mxv := coalesce(svy.to_num(q->>'max'), 5);
    elsif typ = 'nps' then mn := 0; mxv := 10;
    else mn := coalesce(svy.to_num(q->>'min'), 0); mxv := coalesce(svy.to_num(q->>'max'), 100); end if;
    if n < mn or n > mxv or (typ <> 'slider' and n <> trunc(n)) then return jsonb_build_object('err', '범위를 벗어난 값: ' || qid); end if;
    if mx > 0 then pts := case when svy.to_num(q->>'answer') = n then mx else 0 end; end if;
    return jsonb_build_object('pts', pts, 'mx', mx);

  elsif typ = 'grid' then
    if jsonb_typeof(v) <> 'object' then return jsonb_build_object('err', '잘못된 그리드 응답: ' || qid); end if;
    select coalesce(jsonb_agg(z->>'id'), '[]'::jsonb) into rows_ids from jsonb_array_elements(coalesce(q->'rows', '[]'::jsonb)) z;
    select coalesce(jsonb_agg(z->>'id'), '[]'::jsonb) into cols_ids from jsonb_array_elements(coalesce(q->'cols', '[]'::jsonb)) z;
    for r in select key, value from jsonb_each(v) loop
      if not (rows_ids @> jsonb_build_array(r.key)) then return jsonb_build_object('err', '잘못된 행: ' || qid); end if;
      if coalesce((q->>'multi')::boolean, false) then
        if jsonb_typeof(r.value) <> 'array' then return jsonb_build_object('err', '잘못된 그리드 응답: ' || qid); end if;
        for e in select jsonb_array_elements_text(r.value) loop
          if not (cols_ids @> jsonb_build_array(e)) then return jsonb_build_object('err', '잘못된 열: ' || qid); end if;
        end loop;
      elsif jsonb_typeof(r.value) <> 'string' or not (cols_ids @> jsonb_build_array(r.value #>> '{}')) then
        return jsonb_build_object('err', '잘못된 열: ' || qid);
      end if;
    end loop;
    if req and coalesce((q->>'eachRow')::boolean, true) then
      if exists (select 1 from jsonb_array_elements_text(rows_ids) z
                  where not (v ? z) or v->z = '[]'::jsonb or v->z = '""'::jsonb) then
        return jsonb_build_object('err', '모든 행에 응답해야 합니다: ' || qid);
      end if;
    end if;
    return jsonb_build_object('mx', mx);

  elsif typ = 'ranking' then
    ids := svy.opt_ids(q);
    if jsonb_typeof(v) <> 'array' then return jsonb_build_object('err', '잘못된 순위 응답: ' || qid); end if;
    for e in select jsonb_array_elements_text(v) loop
      if not (ids @> jsonb_build_array(e)) then return jsonb_build_object('err', '잘못된 순위 항목: ' || qid); end if;
    end loop;
    if (select count(distinct z) from jsonb_array_elements_text(v) z) <> jsonb_array_length(v) then return jsonb_build_object('err', '순위가 중복되었습니다: ' || qid); end if;
    cnt := least(coalesce(svy.to_num(q->>'top'), jsonb_array_length(ids))::int, jsonb_array_length(ids));
    if jsonb_array_length(v) <> cnt then return jsonb_build_object('err', '순위 ' || cnt || '개를 모두 지정해야 합니다: ' || qid); end if;
    if mx > 0 then pts := case when v = (q->'answer') then mx else 0 end; end if;
    return jsonb_build_object('pts', pts, 'mx', mx);

  elsif typ = 'constsum' then
    ids := svy.opt_ids(q); tot := 0;
    if jsonb_typeof(v) <> 'object' then return jsonb_build_object('err', '잘못된 배분 응답: ' || qid); end if;
    for r in select key, value from jsonb_each(v) loop
      if not (ids @> jsonb_build_array(r.key)) or jsonb_typeof(r.value) <> 'number' or (r.value #>> '{}')::numeric < 0 then return jsonb_build_object('err', '잘못된 배분 값: ' || qid); end if;
      tot := tot + (r.value #>> '{}')::numeric;
    end loop;
    if tot <> coalesce(svy.to_num(q->>'total'), 100) then return jsonb_build_object('err', '배분 합계가 ' || coalesce(q->>'total', '100') || '이어야 합니다: ' || qid); end if;
    return jsonb_build_object('mx', mx);

  elsif typ = 'date' then
    if jsonb_typeof(v) <> 'string' then return jsonb_build_object('err', '잘못된 날짜: ' || qid); end if;
    s := v #>> '{}';
    if coalesce((q->>'includeTime')::boolean, false) then
      if s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$' or not svy.valid_date(left(s, 10)) then return jsonb_build_object('err', '잘못된 날짜·시간: ' || qid); end if;
    elsif not svy.valid_date(s) then return jsonb_build_object('err', '잘못된 날짜: ' || qid); end if;
    if coalesce(q->>'min', '') <> '' and left(s, 10) < q->>'min' then return jsonb_build_object('err', '허용 기간 이전 날짜: ' || qid); end if;
    if coalesce(q->>'max', '') <> '' and left(s, 10) > q->>'max' then return jsonb_build_object('err', '허용 기간 이후 날짜: ' || qid); end if;
    return jsonb_build_object('mx', mx);

  elsif typ = 'time' then
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return jsonb_build_object('err', '잘못된 시간: ' || qid); end if;
    s := v #>> '{}';
    if coalesce(q->>'min', '') <> '' and s < q->>'min' then return jsonb_build_object('err', '허용 시간 이전: ' || qid); end if;
    if coalesce(q->>'max', '') <> '' and s > q->>'max' then return jsonb_build_object('err', '허용 시간 이후: ' || qid); end if;
    return jsonb_build_object('mx', mx);

  elsif typ in ('file', 'signature') then
    cnt := case when typ = 'signature' then 1 else least(coalesce(svy.to_num(q->>'maxFiles'), 1), 10)::int end;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > cnt then
      return jsonb_build_object('err', '첨부 개수 오류: ' || qid);
    end if;
    for el in select * from jsonb_array_elements(v) loop
      s := el->>'id';
      if jsonb_typeof(el) <> 'object' or s is null or s !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('err', '잘못된 첨부: ' || qid); end if;
      if not exists (select 1 from svy.files f where f.id = s::uuid and f.survey_id = p_survey and f.client_token = p_token) then return jsonb_build_object('err', '첨부 파일을 찾을 수 없습니다: ' || qid); end if;
      fids := fids || s;
    end loop;
    return jsonb_build_object('fids', to_jsonb(fids));

  elsif typ = 'address' then
    if jsonb_typeof(v) <> 'object' then return jsonb_build_object('err', '잘못된 주소: ' || qid); end if;
    if btrim(coalesce(v->>'road', '')) = '' and btrim(coalesce(v->>'jibun', '')) = '' then return jsonb_build_object('err', '주소를 입력해야 합니다: ' || qid); end if;
    if char_length(coalesce(v->>'road', '')) > 200 or char_length(coalesce(v->>'jibun', '')) > 200 or char_length(coalesce(v->>'detail', '')) > 100 or char_length(coalesce(v->>'zip', '')) > 10 then return jsonb_build_object('err', '주소 길이 초과: ' || qid); end if;
    return jsonb_build_object('mx', mx);

  elsif typ = 'location' then
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(v->'lat') <> 'number' or jsonb_typeof(v->'lng') <> 'number'
       or (v->>'lat')::numeric not between -90 and 90 or (v->>'lng')::numeric not between -180 and 180 then return jsonb_build_object('err', '잘못된 위치: ' || qid); end if;
    return jsonb_build_object('mx', mx);

  elsif typ = 'qr' then
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 500 then return jsonb_build_object('err', '잘못된 QR 값: ' || qid); end if;
    return jsonb_build_object('mx', mx);

  elsif typ = 'consent' then
    if v <> 'true'::jsonb then return jsonb_build_object('err', '동의가 필요합니다: ' || qid); end if;
    return jsonb_build_object('mx', mx);
  end if;
  return jsonb_build_object('err', '지원하지 않는 문항 형식: ' || qid);
end $$;

-- [4] 응답 전체 검증 (영역 조건 · 점수 · 첨부) ----------------------------------
create or replace function svy.check_answers2(p_def jsonb, p_course_ids text[], p_ans jsonb, p_survey uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare
  gen boolean := coalesce(p_def->>'mode', 'course') = 'general';
  c jsonb := coalesce(p_ans->'common', '{}'::jsonb);
  q jsonb; s jsonb; cid text; r jsonb; a jsonb; scope text;
  attn_total int := 0; attn_fail int := 0; tl int := 0; nums numeric[] := '{}'; dist int;
  pts numeric := 0; mxs numeric := 0; fids text[] := '{}';
begin
  if p_ans is null or jsonb_typeof(p_ans) <> 'object' then return jsonb_build_object('err', '응답 형식 오류'); end if;
  for s in
    select jsonb_build_object('questions', coalesce(p_def->'basic', '[]'::jsonb), 'basic', true)
    union all
    select z || jsonb_build_object('basic', false) from jsonb_array_elements(coalesce(p_def->'sections', '[]'::jsonb)) z
  loop
    for q in select x from jsonb_array_elements(coalesce(s->'questions', '[]'::jsonb)) x loop
      scope := case when gen or (s->>'basic')::boolean then 'common' else coalesce(q->>'scope', 'course') end;
      if scope = 'common' then
        if not svy.vis(s->'showIf', p_def, c, c) then continue; end if;
        r := svy.check_one2(q, p_def, c, c, p_survey, p_token);
        if r ? 'err' then return r; end if;
        if r ? 'tl' then tl := tl + (r->>'tl')::int; end if;
        if r ? 'mx' then mxs := mxs + (r->>'mx')::numeric; end if;
        if r ? 'pts' then pts := pts + (r->>'pts')::numeric; end if;
        if coalesce((r->>'has_check')::boolean, false) then attn_total := attn_total + 1; if not (r->>'pass')::boolean then attn_fail := attn_fail + 1; end if;
        elsif r ? 'num' then nums := nums || (r->>'num')::numeric; end if;
        if r ? 'fids' then fids := fids || array(select jsonb_array_elements_text(r->'fids')); end if;
      else
        foreach cid in array coalesce(p_course_ids, '{}'::text[]) loop
          a := coalesce(p_ans->'course'->cid, '{}'::jsonb);
          if not svy.vis(s->'showIf', p_def, a, c) then continue; end if;
          r := svy.check_one2(q, p_def, a, c, p_survey, p_token);
          if r ? 'err' then return r; end if;
          if r ? 'tl' then tl := tl + (r->>'tl')::int; end if;
          if r ? 'mx' then mxs := mxs + (r->>'mx')::numeric; end if;
          if r ? 'pts' then pts := pts + (r->>'pts')::numeric; end if;
          if coalesce((r->>'has_check')::boolean, false) then attn_total := attn_total + 1; if not (r->>'pass')::boolean then attn_fail := attn_fail + 1; end if;
          elsif r ? 'num' then nums := nums || (r->>'num')::numeric; end if;
          if r ? 'fids' then fids := fids || array(select jsonb_array_elements_text(r->'fids')); end if;
        end loop;
      end if;
    end loop;
  end loop;
  select count(distinct x) into dist from unnest(nums) x;
  return jsonb_build_object('err', null, 'attn_total', attn_total, 'attn_fail', attn_fail, 'text_len', tl,
    'straight', coalesce(array_length(nums, 1), 0) >= 8 and dist = 1, 'score', pts, 'max_score', mxs, 'fids', to_jsonb(fids));
end $$;

-- [5] 정원 계산 · 공개 함수 · 제출 · 파일 업로드 -----------------------------------
-- 정원 현황: {"total":n, "<문항ID>":{"<선택지ID>":n}}  (def.limit.max 또는 선택지 max 가 있을 때만)
create or replace function svy.quota_counts(s svy.surveys)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare out jsonb := '{}'::jsonb; q jsonb; o jsonb; sec jsonb; gen boolean := coalesce(s.def->>'mode', 'course') = 'general'; inner_ jsonb; n int;
begin
  if svy.to_num(s.def->'limit'->>'max') is not null then
    out := out || jsonb_build_object('total', (select count(*) from svy.responses where survey_id = s.id and is_test = s.test_mode));
  end if;
  for sec in
    select jsonb_build_object('questions', coalesce(s.def->'basic', '[]'::jsonb), 'basic', true)
    union all select z || jsonb_build_object('basic', false) from jsonb_array_elements(coalesce(s.def->'sections', '[]'::jsonb)) z
  loop
    for q in select x from jsonb_array_elements(coalesce(sec->'questions', '[]'::jsonb)) x loop
      if q->>'type' not in ('single', 'multi') or not (gen or (sec->>'basic')::boolean or q->>'scope' = 'common') then continue; end if;
      inner_ := '{}'::jsonb;
      for o in select x from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) x loop
        if svy.to_num(o->>'max') is null then continue; end if;
        select count(*) into n from svy.responses r2
         where r2.survey_id = s.id and r2.is_test = s.test_mode and (r2.answers->'common'->(q->>'id')) @> to_jsonb(o->>'id');
        inner_ := inner_ || jsonb_build_object(o->>'id', n);
      end loop;
      if inner_ <> '{}'::jsonb then out := out || jsonb_build_object(q->>'id', inner_); end if;
    end loop;
  end loop;
  return out;
end $$;

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
