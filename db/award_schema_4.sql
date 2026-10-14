-- ============================================================================
-- 상장 출력기 4차: 이전 배경 자동 보관(최근 3개) — award_schema.sql 실행 후 실행하십시오. 여러 번 실행해도 안전합니다.
--  * 양식의 배경 이미지가 바뀌면(교체·삭제) 이전 배경을 awd.bg_hist 에 보관하고 양식당 최근 3개만 남깁니다.
--  * 화면의 「배경 → 이전 배경 불러오기」에서 복원합니다.
-- ============================================================================
create table if not exists awd.bg_hist (
  id uuid primary key default gen_random_uuid(),
  tpl_id uuid not null references awd.tpl(id) on delete cascade,
  bg text not null,
  bg_name text,
  created_at timestamptz not null default now()
);
create index if not exists bg_hist_idx on awd.bg_hist(tpl_id, created_at desc);
alter table awd.bg_hist enable row level security;
revoke all on awd.bg_hist from public, anon, authenticated;

create or replace function awd.tpl_bg_keep() returns trigger
language plpgsql security definer set search_path = awd, public as $$
begin
  if old.bg is not null and new.bg is distinct from old.bg then
    insert into awd.bg_hist(tpl_id, bg, bg_name) values (old.id, old.bg, old.bg_name);
    delete from awd.bg_hist where tpl_id = old.id and id not in
      (select id from awd.bg_hist where tpl_id = old.id order by created_at desc limit 3);
  end if;
  return new;
end $$;
drop trigger if exists tpl_bg_keep on awd.tpl;
create trigger tpl_bg_keep before update of bg on awd.tpl for each row execute function awd.tpl_bg_keep();

create or replace function public.award_bg_hist_list(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'bg_name', h.bg_name, 'created_at', h.created_at) order by h.created_at desc), '[]'::jsonb)
            from awd.bg_hist h where h.tpl_id = p_id);
end $$;

create or replace function public.award_bg_hist_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select jsonb_build_object('bg', h.bg, 'bg_name', h.bg_name) from awd.bg_hist h where h.id = p_id);
end $$;

revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
