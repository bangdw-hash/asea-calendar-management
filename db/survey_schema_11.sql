-- 설문 DB 11단계: 개선 과제 추적 (결과 「분석」 → 「개선 과제」)
--   · 과제 기록(대상·제목·방안·담당·기한·상태·메모)만 저장합니다. 학생 응답·AI 분석 원문은 저장하지 않습니다.
--   · 관리자 로그인 토큰(svy.sess)이 있어야만 읽고 쓸 수 있으며, 테이블은 직접 접근이 막혀 있습니다.
--   · 여러 번 실행해도 안전합니다.
create table if not exists svy.actions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  unit text not null default 'school' check (unit in ('school', 'track', 'klass', 'prof', 'subject')),
  target text not null default '' check (length(target) <= 120),
  title text not null check (length(title) between 1 and 200),
  detail text not null default '' check (length(detail) <= 2000),
  owner text not null default '' check (length(owner) <= 100),
  due date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'hold')),
  memo text not null default '' check (length(memo) <= 2000),
  src text not null default 'manual' check (src in ('manual', 'report')),
  removed boolean not null default false,   -- 삭제는 실제 삭제가 아니라 삭제 표시(복구 가능)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists actions_survey_idx on svy.actions (survey_id, status);
alter table svy.actions enable row level security;
revoke all on svy.actions from public, anon, authenticated;

alter table svy.actions add column if not exists removed boolean not null default false;

-- 목록: p_id 가 null 이면 모든 설문의 과제(다음 학기 재점검용), 있으면 해당 설문만
create or replace function public.svy_a_actions(p_token text, p_id uuid default null)
 returns jsonb language plpgsql stable security definer set search_path to 'svy', 'public'
as $function$
begin
  perform svy.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'survey_id', a.survey_id, 'survey_title', s.title, 'semester', s.semester,
      'unit', a.unit, 'target', a.target, 'title', a.title, 'detail', a.detail, 'owner', a.owner, 'due', a.due, 'status', a.status,
      'memo', a.memo, 'src', a.src, 'created_at', a.created_at, 'updated_at', a.updated_at)
      order by (a.status in ('done')), a.due nulls last, a.created_at desc)
    from svy.actions a join svy.surveys s on s.id = a.survey_id where not a.removed and (p_id is null or a.survey_id = p_id)), '[]'::jsonb);
end $function$;

-- 저장: p_action 에 id 가 있으면 수정, 없으면 추가 (설문당 최대 2000건)
create or replace function public.svy_a_action_save(p_token text, p_id uuid, p_action jsonb)
 returns jsonb language plpgsql security definer set search_path to 'svy', 'public'
as $function$
declare r svy.actions; aid uuid := nullif(p_action->>'id', '')::uuid; ttl text := btrim(coalesce(p_action->>'title', ''));
begin
  perform svy.sess(p_token);
  if not exists (select 1 from svy.surveys where id = p_id) then raise exception 'NOT_FOUND'; end if;
  if ttl = '' then raise exception 'TITLE_REQUIRED'; end if;
  if aid is null then
    if (select count(*) from svy.actions where survey_id = p_id) >= 2000 then raise exception 'TOO_MANY'; end if;
    insert into svy.actions (survey_id, unit, target, title, detail, owner, due, status, memo, src)
    values (p_id, coalesce(nullif(p_action->>'unit', ''), 'school'), left(coalesce(p_action->>'target', ''), 120), left(ttl, 200),
            left(coalesce(p_action->>'detail', ''), 2000), left(coalesce(p_action->>'owner', ''), 100), nullif(p_action->>'due', '')::date,
            coalesce(nullif(p_action->>'status', ''), 'todo'), left(coalesce(p_action->>'memo', ''), 2000), coalesce(nullif(p_action->>'src', ''), 'manual'))
    returning * into r;
  else
    update svy.actions set unit = coalesce(nullif(p_action->>'unit', ''), unit), target = left(coalesce(p_action->>'target', target), 120),
           title = left(ttl, 200), detail = left(coalesce(p_action->>'detail', detail), 2000), owner = left(coalesce(p_action->>'owner', owner), 100),
           due = case when p_action ? 'due' then nullif(p_action->>'due', '')::date else due end,
           status = coalesce(nullif(p_action->>'status', ''), status), memo = left(coalesce(p_action->>'memo', memo), 2000), updated_at = now()
     where id = aid and survey_id = p_id returning * into r;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', r.id);
end $function$;

create or replace function public.svy_a_action_remove(p_token text, p_action_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'svy', 'public'
as $function$
begin
  perform svy.sess(p_token);
  update svy.actions set removed = true, updated_at = now() where id = p_action_id;
  return jsonb_build_object('ok', true);
end $function$;

grant execute on function public.svy_a_actions(text, uuid), public.svy_a_action_save(text, uuid, jsonb), public.svy_a_action_remove(text, uuid) to anon, authenticated;
