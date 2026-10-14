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
