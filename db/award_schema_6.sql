-- ============================================================================
-- 상장 출력기 6차: 작업(월별·건별 작업 파일) — award_schema.sql 실행 후 실행하십시오. 여러 번 실행해도 안전합니다.
--  * 같은 양식에서 작업(예: 2026년 10월 졸업, 개별 건)마다 별도 데이터(행)를 보관합니다.
--  * 발급(출력) 이력에 작업 이름이 함께 표시되고, 작업별로 모아 볼 수 있습니다(이력은 p_snap 의 job 항목 사용).
-- ============================================================================
create table if not exists awd.job (
  id uuid primary key default gen_random_uuid(),
  tpl_id uuid not null references awd.tpl(id) on delete cascade,
  name text not null,
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_tpl_idx on awd.job(tpl_id, updated_at desc);
alter table awd.job enable row level security;
revoke all on awd.job from public, anon, authenticated;

create or replace function public.award_job_list(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'rows', jsonb_array_length(j.rows), 'created_at', j.created_at, 'updated_at', j.updated_at) order by j.created_at), '[]'::jsonb)
            from awd.job j where j.tpl_id = p_id);
end $$;

create or replace function public.award_job_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select jsonb_build_object('id', j.id, 'name', j.name, 'rows', j.rows) from awd.job j where j.id = p_id);
end $$;

create or replace function public.award_job_add(p_token text, p_tpl uuid, p_name text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare nid uuid;
begin
  perform awd.sess(p_token);
  insert into awd.job(tpl_id, name, rows) values (p_tpl, left(coalesce(nullif(trim(p_name), ''), '새 작업'), 60), coalesce(p_rows, '[]'::jsonb)) returning id into nid;
  perform awd.log_add('job_add', nid::text, jsonb_build_object('name', p_name));
  return jsonb_build_object('id', nid);
end $$;

create or replace function public.award_job_save(p_token text, p_id uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  update awd.job set rows = coalesce(p_rows, rows), updated_at = now() where id = p_id;
end $$;

create or replace function public.award_job_rename(p_token text, p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  update awd.job set name = left(coalesce(nullif(trim(p_name), ''), name), 60), updated_at = now() where id = p_id;
end $$;

create or replace function public.award_job_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  delete from awd.job where id = p_id;
  perform awd.log_add('job_delete', p_id::text);
end $$;

-- 발급 이력 목록에 작업 정보(snap.job) 포함, 최근 300건
create or replace function public.award_batch_list(p_token text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'tpl_id', b.tpl_id, 'tpl_name', b.tpl_name,
            'kind', b.kind, 'cnt', b.cnt, 'label', b.label, 'created_at', b.created_at, 'first', b.rows->0,
            'job_id', b.snap->'job'->>'id', 'job_name', b.snap->'job'->>'name') order by b.created_at desc), '[]'::jsonb)
            from (select * from awd.batch order by created_at desc limit 300) b);
end $$;

revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
