-- ============================================================================
-- 상장 출력기 3차: 내 글꼴(서버 저장) — award_schema.sql 실행 후 실행하십시오. 여러 번 실행해도 안전합니다.
--  * 글꼴 파일(base64)은 awd.font 에 저장하고, 목록 조회는 용량이 큰 data 를 제외합니다.
--  * 브라우저는 양식에서 사용하는 글꼴만 내려받고(지연 로딩), 기기에 캐시하므로 반복 다운로드가 없습니다.
--  * 한도: 파일당 8MB(base64 약 11MB), 전체 150MB.
-- ============================================================================
create table if not exists awd.font (
  id uuid primary key default gen_random_uuid(),
  family text not null unique,
  label text not null,
  fmt text not null default 'truetype',
  size_bytes int not null default 0,
  data text not null,
  created_at timestamptz not null default now()
);
alter table awd.font enable row level security;
revoke all on awd.font from public, anon, authenticated;

create or replace function public.award_font_list(p_token text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'family', f.family, 'label', f.label, 'fmt', f.fmt, 'size', f.size_bytes, 'created_at', f.created_at) order by f.created_at), '[]'::jsonb) from awd.font f);
end $$;

create or replace function public.award_font_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select jsonb_build_object('family', f.family, 'fmt', f.fmt, 'data', f.data) from awd.font f where f.id = p_id);
end $$;

create or replace function public.award_font_add(p_token text, p_family text, p_label text, p_fmt text, p_data text, p_size int) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare nid uuid;
begin
  perform awd.sess(p_token);
  if coalesce(p_size, 0) > 8 * 1024 * 1024 or length(coalesce(p_data, '')) > 11500000 then raise exception 'FONT_TOO_LARGE'; end if;
  if (select coalesce(sum(size_bytes), 0) from awd.font) + coalesce(p_size, 0) > 150 * 1024 * 1024 then raise exception 'FONT_QUOTA'; end if;
  insert into awd.font(family, label, fmt, size_bytes, data) values (p_family, left(p_label, 40), p_fmt, coalesce(p_size, 0), p_data)
    on conflict (family) do update set label = excluded.label, fmt = excluded.fmt, size_bytes = excluded.size_bytes, data = excluded.data
    returning id into nid;
  perform awd.log_add('font_add', p_family, jsonb_build_object('label', p_label, 'size', p_size));
  return jsonb_build_object('id', nid);
end $$;

create or replace function public.award_font_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  delete from awd.font where id = p_id;
  perform awd.log_add('font_delete', p_id::text);
end $$;

revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
