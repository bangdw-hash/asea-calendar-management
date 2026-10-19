-- ============================================================================
-- ASEA 설문 — 영역별 무작위 성실 응답 확인
--  · def.integrity = { on:true, sections:['S2',...], place:'rotate'|'first', scale:'likert5', maxFail:1 }
--  · 학생 화면이 영역 끝에 확인 문항(id '_I<영역ID>')을 넣고, 학생마다 다른 요구값(ask)을 chk 에 함께 보냅니다.
--  · svy.check_answers2 만 교체합니다. (svy_submit / svy_edit_save 는 그대로 이 함수를 호출)
--  · 기존 고정 정답(check.valid) 방식과 같은 attn_total / attn_fail 로 집계되어 결과·추첨 판정이 그대로 동작합니다.
--  · 실행: Supabase SQL Editor 에서 survey_schema_6.sql 이후 아무 때나 한 번 실행 (여러 번 실행해도 안전)
-- ============================================================================

create or replace function svy.check_answers2(p_def jsonb, p_course_ids text[], p_ans jsonb, p_survey uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare
  gen boolean := coalesce(p_def->>'mode', 'course') = 'general';
  c jsonb := coalesce(p_ans->'common', '{}'::jsonb);
  q jsonb; s jsonb; cid text; r jsonb; a jsonb; scope text;
  attn_total int := 0; attn_fail int := 0; tl int := 0; nums numeric[] := '{}'; dist int;
  pts numeric := 0; mxs numeric := 0; fids text[] := '{}';
  ig jsonb := p_def->'integrity'; vals numeric[]; sec jsonb; sid text; ck jsonb; ask numeric; v jsonb; ca jsonb;
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
  -- 영역별 무작위 성실 응답 확인 (def.integrity) ----------------------------------
  -- 응답의 chk[영역ID] = {cid: 과목ID|'common', ask: 요구값}, 답은 해당 범위의 '_I<영역ID>' 키에 저장됩니다.
  -- 요구값(ask)과 같게 응답하지 않으면 attn_fail 이 늘어납니다. (고정 정답 check 와 같은 집계 필드를 씁니다.)
  if ig is not null and coalesce((ig->>'on')::boolean, false) then
    select array_agg((z->>'v')::numeric) into vals
      from jsonb_array_elements(coalesce(p_def->'scales'->coalesce(nullif(ig->>'scale', ''), 'likert5'), '[]'::jsonb)) z;
    if vals is null then return jsonb_build_object('err', '성실 응답 확인 척도 오류'); end if;
    for sec in select z from jsonb_array_elements(coalesce(p_def->'sections', '[]'::jsonb)) z
                where (coalesce(ig->'sections', '[]'::jsonb)) @> to_jsonb(z->>'id') loop
      sid := sec->>'id';
      ck := p_ans->'chk'->sid;
      if ck is null or jsonb_typeof(ck) <> 'object' then
        if sec ? 'showIf' and jsonb_typeof(sec->'showIf') <> 'null' then continue; end if;   -- 조건부 영역은 숨겨질 수 있음
        return jsonb_build_object('err', '성실 응답 확인 누락: ' || sid);
      end if;
      ask := svy.to_num(ck->>'ask');
      if ask is null or not (ask = any(vals)) then return jsonb_build_object('err', '성실 응답 확인 값 오류: ' || sid); end if;
      cid := ck->>'cid';
      if cid = 'common' then ca := c;
      elsif not gen and cid = any(coalesce(p_course_ids, '{}'::text[])) then ca := coalesce(p_ans->'course'->cid, '{}'::jsonb);
      else return jsonb_build_object('err', '성실 응답 확인 위치 오류: ' || sid); end if;
      v := ca->('_I' || sid);
      if v is null or jsonb_typeof(v) <> 'number' or not ((v #>> '{}')::numeric = any(vals)) then return jsonb_build_object('err', '성실 응답 확인 문항 누락: ' || sid); end if;
      attn_total := attn_total + 1;
      if (v #>> '{}')::numeric <> ask then attn_fail := attn_fail + 1; end if;
    end loop;
  end if;
  select count(distinct x) into dist from unnest(nums) x;
  return jsonb_build_object('err', null, 'attn_total', attn_total, 'attn_fail', attn_fail, 'text_len', tl,
    'straight', coalesce(array_length(nums, 1), 0) >= 8 and dist = 1, 'score', pts, 'max_score', mxs, 'fids', to_jsonb(fids));
end $$;
