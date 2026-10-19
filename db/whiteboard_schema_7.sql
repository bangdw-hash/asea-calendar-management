-- ============================================================================
-- 실시간 수업 노트 스키마 7 — 과제 제출(비공개 저장 · 교수자만 받기 · 마감 전 재제출은 최신본만 유지)
--  * db/whiteboard_schema.sql ~ _6 실행 후 실행합니다. 여러 번 실행해도 안전합니다.
--  * 파일은 비공개 버킷 wb-hw(1개 20MB)에 저장되고, 올리기·받기 주소는 Edge Function wb-hw 가 DB 함수 판정 결과대로만 발급합니다.
--  * 「파일 지우기」는 Edge Function 이 저장소 파일을 실제로 지우고, 학생 이름·파일명은 비웁니다(행은 남김).
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit) values ('wb-hw', 'wb-hw', false, 20971520)
  on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = null;

create table if not exists wbd.hw (
  id text primary key default encode(extensions.gen_random_bytes(5), 'hex'),
  code text not null references wbd.room(code) on delete cascade,
  title text not null,
  note text not null default '',
  due timestamptz,
  open boolean not null default true,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hw_code_idx on wbd.hw(code, created_at);

create table if not exists wbd.hwsub (
  id text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  hw text not null references wbd.hw(id) on delete cascade,
  code text not null,
  cid text not null,
  name text not null default '',
  path text not null,
  fname text not null,
  size bigint not null default 0,
  n int not null default 1,                 -- 몇 번째 제출인지
  cur boolean not null default true,        -- 최신본 여부
  created_at timestamptz not null default now()
);
create index if not exists hwsub_hw_idx on wbd.hwsub(hw, cur);
alter table wbd.hw enable row level security;
alter table wbd.hwsub enable row level security;

create or replace function wbd.hw_ext(p_fname text) returns text language sql immutable as $$
  select lower(substring(coalesce(p_fname, '') from '\.([A-Za-z0-9]{2,5})$'));
$$;

create or replace function public.wb_hw_create(p_token text, p_code text, p_title text, p_note text, p_due timestamptz) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare t text := left(trim(coalesce(p_title, '')), 80); h text;
begin
  perform wbd.sess(p_token);
  if not exists (select 1 from wbd.room where code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if t = '' then raise exception 'BAD_INPUT'; end if;
  if (select count(*) from wbd.hw where code = p_code and not hidden) >= 30 then raise exception 'TOO_MANY'; end if;
  insert into wbd.hw(code, title, note, due) values (p_code, t, left(coalesce(p_note, ''), 1000), p_due) returning id into h;
  return jsonb_build_object('ok', true, 'id', h);
end $$;

create or replace function public.wb_hw_state(p_token text, p_code text, p_hw text, p_open boolean) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.hw set open = coalesce(p_open, false), due = case when p_open and due is not null and due < now() then null else due end where id = p_hw and code = p_code;
end $$;

create or replace function public.wb_hw_all(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'note', h.note, 'open', h.open and (h.due is null or h.due > now()), 'due', (extract(epoch from h.due) * 1000)::bigint,
      'created', (extract(epoch from h.created_at) * 1000)::bigint, 'n', (select count(*) from wbd.hwsub s where s.hw = h.id and s.cur)) order by h.created_at desc)
    from wbd.hw h where h.code = p_code and not h.hidden), '[]'::jsonb);
end $$;

create or replace function public.wb_hw_mine(p_code text, p_cid text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 then return jsonb_build_object('hws', '[]'::jsonb, 'mine', '[]'::jsonb); end if;
  return jsonb_build_object(
    'hws', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'note', h.note, 'open', h.open and (h.due is null or h.due > now()), 'due', (extract(epoch from h.due) * 1000)::bigint) order by h.created_at desc)
      from wbd.hw h where h.code = p_code and not h.hidden), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('hw', s.hw, 'fname', s.fname, 'size', s.size, 'n', s.n, 't', (extract(epoch from s.created_at) * 1000)::bigint))
      from wbd.hwsub s where s.code = p_code and s.cid = p_cid and s.cur), '[]'::jsonb));
end $$;

create or replace function public.wb_hw_prepare(p_code text, p_cid text, p_hw text, p_fname text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare e text := wbd.hw_ext(p_fname);
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 then raise exception 'BAD_INPUT'; end if;
  if not exists (select 1 from wbd.hw where id = p_hw and code = p_code and not hidden and open and (due is null or due > now())) then raise exception 'HW_CLOSED'; end if;
  if coalesce(p_size, 0) < 1 or p_size > 20971520 then raise exception 'TOO_BIG'; end if;
  if e is null or e not in ('pdf','doc','docx','hwp','hwpx','xls','xlsx','ppt','pptx','txt','csv','zip','png','jpg','jpeg','gif','webp') then raise exception 'BAD_TYPE'; end if;
  if (select count(*) from wbd.hwsub where code = p_code and cid = p_cid and created_at > now() - interval '1 minute') >= 6 then raise exception 'RATE_LIMIT'; end if;
  return jsonb_build_object('path', p_code || '/' || p_hw || '/' || substr(p_cid, 1, 12) || '-' || encode(extensions.gen_random_bytes(5), 'hex') || '.' || e);
end $$;

create or replace function public.wb_hw_submit(p_code text, p_cid text, p_name text, p_hw text, p_path text, p_fname text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare nm text := left(trim(coalesce(p_name, '')), 20); fn text := left(regexp_replace(coalesce(p_fname, ''), '[\\/:*?"<>|\r\n]', '_', 'g'), 150); k int;
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 or nm = '' or fn = '' then raise exception 'BAD_INPUT'; end if;
  if not exists (select 1 from wbd.hw where id = p_hw and code = p_code and not hidden and open and (due is null or due > now())) then raise exception 'HW_CLOSED'; end if;
  if p_path not like p_code || '/' || p_hw || '/' || substr(p_cid, 1, 12) || '-%' then raise exception 'BAD_PATH'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'wb-hw' and name = p_path) then raise exception 'NO_FILE'; end if;
  if exists (select 1 from wbd.hwsub where path = p_path) then raise exception 'BAD_PATH'; end if;
  select coalesce(max(n), 0) + 1 into k from wbd.hwsub where hw = p_hw and cid = p_cid;
  update wbd.hwsub set cur = false where hw = p_hw and cid = p_cid and cur;
  insert into wbd.hwsub(hw, code, cid, name, path, fname, size, n) values (p_hw, p_code, p_cid, nm, p_path, fn, greatest(coalesce(p_size, 0), 0), k);
  return jsonb_build_object('ok', true, 'n', k);
end $$;

create or replace function public.wb_hw_list(p_token text, p_code text, p_hw text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'cid', s.cid, 'name', s.name, 'fname', s.fname, 'size', s.size, 'n', s.n, 'path', s.path, 't', (extract(epoch from s.created_at) * 1000)::bigint) order by s.created_at)
    from wbd.hwsub s where s.hw = p_hw and s.code = p_code and s.cur and s.path <> ''), '[]'::jsonb);
end $$;

create or replace function public.wb_hw_paths(p_token text, p_code text, p_hw text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(s.path) from wbd.hwsub s where s.hw = p_hw and s.code = p_code and s.path <> ''), '[]'::jsonb);
end $$;

create or replace function public.wb_hw_purge(p_token text, p_code text, p_hw text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.hwsub set name = '', fname = '', path = '', cur = false where hw = p_hw and code = p_code;
  update wbd.hw set hidden = true, open = false where id = p_hw and code = p_code;
end $$;

revoke execute on function public.wb_hw_create(text, text, text, text, timestamptz), public.wb_hw_state(text, text, text, boolean), public.wb_hw_all(text, text), public.wb_hw_mine(text, text),
  public.wb_hw_prepare(text, text, text, text, bigint), public.wb_hw_submit(text, text, text, text, text, text, bigint), public.wb_hw_list(text, text, text), public.wb_hw_paths(text, text, text), public.wb_hw_purge(text, text, text) from public;
grant execute on function public.wb_hw_create(text, text, text, text, timestamptz), public.wb_hw_state(text, text, text, boolean), public.wb_hw_all(text, text), public.wb_hw_mine(text, text),
  public.wb_hw_prepare(text, text, text, text, bigint), public.wb_hw_submit(text, text, text, text, text, text, bigint), public.wb_hw_list(text, text, text), public.wb_hw_paths(text, text, text), public.wb_hw_purge(text, text, text) to anon, authenticated;
revoke execute on function wbd.hw_ext(text) from public, anon, authenticated;
