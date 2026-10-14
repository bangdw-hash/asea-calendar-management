-- ============================================================================
-- 상장 출력기 5차: 배경 양식 라이브러리(서버 저장·이름 부여·개수 제한 없음) + 공통 설정(학교 색 등)
--  * award_schema.sql 실행 후 실행하십시오. 여러 번 실행해도 안전합니다.
--  * 이전에 4차(이전 배경 3개 보관)를 실행했다면 아래 정리문이 해당 테이블·함수를 제거합니다(5차로 대체).
-- ============================================================================
drop trigger if exists tpl_bg_keep on awd.tpl;
drop function if exists awd.tpl_bg_keep();
drop function if exists public.award_bg_hist_list(text, uuid);
drop function if exists public.award_bg_hist_get(text, uuid);
drop table if exists awd.bg_hist;

create table if not exists awd.bg_lib (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bg text not null,
  thumb text,
  w numeric not null default 0,
  h numeric not null default 0,
  paper text not null default '',
  orient text not null default '',
  size_bytes int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bg_lib_idx on awd.bg_lib(created_at desc);
alter table awd.bg_lib enable row level security;
revoke all on awd.bg_lib from public, anon, authenticated;

create table if not exists awd.pref (
  key text primary key,
  val jsonb,
  updated_at timestamptz not null default now()
);
alter table awd.pref enable row level security;
revoke all on awd.pref from public, anon, authenticated;

create or replace function public.award_bglib_list(p_token text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'thumb', b.thumb, 'w', b.w, 'h', b.h, 'size', b.size_bytes, 'created_at', b.created_at) order by b.created_at desc), '[]'::jsonb) from awd.bg_lib b);
end $$;

create or replace function public.award_bglib_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select jsonb_build_object('name', b.name, 'bg', b.bg, 'w', b.w, 'h', b.h, 'paper', b.paper, 'orient', b.orient) from awd.bg_lib b where b.id = p_id);
end $$;

create or replace function public.award_bglib_add(p_token text, p_name text, p_bg text, p_thumb text, p_w numeric, p_h numeric, p_paper text, p_orient text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare nid uuid;
begin
  perform awd.sess(p_token);
  if length(coalesce(p_bg, '')) > 11500000 then raise exception 'BG_TOO_LARGE'; end if;
  insert into awd.bg_lib(name, bg, thumb, w, h, paper, orient, size_bytes)
    values (left(coalesce(nullif(trim(p_name), ''), '이름 없음'), 60), p_bg, p_thumb, coalesce(p_w, 0), coalesce(p_h, 0), coalesce(p_paper, ''), coalesce(p_orient, ''), length(p_bg))
    returning id into nid;
  perform awd.log_add('bglib_add', nid::text, jsonb_build_object('name', p_name));
  return jsonb_build_object('id', nid);
end $$;

create or replace function public.award_bglib_rename(p_token text, p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  update awd.bg_lib set name = left(coalesce(nullif(trim(p_name), ''), name), 60) where id = p_id;
end $$;

create or replace function public.award_bglib_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  delete from awd.bg_lib where id = p_id;
  perform awd.log_add('bglib_delete', p_id::text);
end $$;

create or replace function public.award_pref_get(p_token text, p_key text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select val from awd.pref where key = p_key);
end $$;

create or replace function public.award_pref_set(p_token text, p_key text, p_val jsonb) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  insert into awd.pref(key, val) values (left(p_key, 60), p_val) on conflict (key) do update set val = excluded.val, updated_at = now();
end $$;

revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
