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
