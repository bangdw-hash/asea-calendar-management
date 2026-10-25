-- ============================================================================
-- ASEA 설문 — 반별 재적 인원 (응답률을 계열·학년이 아니라 반 단위로 계산)
--  · svy.class_targets : 설문별 (계열, 학년, 반) 재적 인원. 기존 svy.targets(계열·학년) 는 그대로 둡니다.
--  · svy_a_class_targets       : 관리자 조회
--  · svy_a_class_targets_save  : 관리자 저장 (해당 설문의 반별 인원을 통째로 교체)
--  · 기존 테이블·함수는 바꾸지 않는 추가 전용 스키마입니다. 여러 번 실행해도 안전합니다.
--  · 실행: Supabase SQL Editor (survey_schema_1 이후 아무 때나)
-- ============================================================================

create table if not exists svy.class_targets (
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  track     text not null,
  grade     text not null,
  klass     text not null,
  headcount int  not null check (headcount >= 0),
  note      text not null default '',
  primary key (survey_id, track, grade, klass)
);
alter table svy.class_targets enable row level security;   -- 정책 없음: 함수(security definer)로만 접근
revoke all on svy.class_targets from anon, authenticated;

create or replace function public.svy_a_class_targets(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('track', track, 'grade', grade, 'klass', klass, 'headcount', headcount, 'note', note) order by track, grade, klass)
                     from svy.class_targets where survey_id = p_id), '[]'::jsonb);
end $$;

create or replace function public.svy_a_class_targets_save(p_token text, p_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare r jsonb; n int := 0; v_track text; v_grade text; v_klass text;
begin
  perform svy.sess(p_token);
  if not exists (select 1 from svy.surveys where id = p_id) then raise exception 'NOT_FOUND'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'BAD_ROWS'; end if;
  delete from svy.class_targets where survey_id = p_id;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_track := btrim(coalesce(r->>'track', '')); v_grade := btrim(coalesce(r->>'grade', '')); v_klass := btrim(coalesce(r->>'klass', ''));
    if v_track = '' or v_grade = '' or v_klass = '' then continue; end if;
    insert into svy.class_targets(survey_id, track, grade, klass, headcount, note)
    values (p_id, v_track, v_grade, v_klass, greatest(coalesce((r->>'headcount')::int, 0), 0), left(coalesce(r->>'note', ''), 200))
    on conflict (survey_id, track, grade, klass) do update set headcount = excluded.headcount, note = excluded.note;
    n := n + 1;
  end loop;
  perform svy.log_add('class_targets_save', p_id::text, jsonb_build_object('rows', n));
  return jsonb_build_object('ok', true, 'saved', n);
end $$;
