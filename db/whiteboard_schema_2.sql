-- ============================================================================
-- 실시간 수업 노트(whiteboard.html) 스키마 2 — 여러 자료·첨부 파일·쪽별 이해도
--  * db/whiteboard_schema.sql 을 먼저 실행한 뒤 실행합니다. 여러 번 실행해도 안전합니다.
--  * 삭제(DELETE) 대신 자료는 「숨김(hidden)」으로 처리합니다.
-- ============================================================================

alter table wbd.room add column if not exists cur_mat text;
alter table wbd.room add column if not exists dl boolean not null default true;

-- 수업 자료: kind = pdf(화면에 표시) | file(첨부, 학생 내려받기)
create table if not exists wbd.mat (
  id text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  code text not null references wbd.room(code) on delete cascade,
  kind text not null check (kind in ('pdf','file')),
  name text not null,
  url text not null,
  size bigint not null default 0,
  pages int not null default 0,
  ord int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mat_code_idx on wbd.mat(code, ord);

-- 쪽별 이해도 신호: 학생 기기(cid)마다 자료·쪽 단위로 1건 (0 해제 · 1 이해함 · 2 어려움). 이름은 저장하지 않습니다.
create table if not exists wbd.sigp (
  code text not null references wbd.room(code) on delete cascade,
  mat text not null,
  page int not null,
  cid text not null,
  val int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code, mat, page, cid)
);

-- 스키마 1 시절의 단일 PDF 를 자료로 옮김
insert into wbd.mat(code, kind, name, url, pages, ord)
select r.code, 'pdf', coalesce(r.pdf_name, 'material.pdf'), r.pdf_url, r.pages, 0
from wbd.room r where r.pdf_url is not null and not exists (select 1 from wbd.mat m where m.code = r.code);
update wbd.room r set cur_mat = (select m.id from wbd.mat m where m.code = r.code and m.kind = 'pdf' order by m.ord limit 1)
 where r.cur_mat is null and exists (select 1 from wbd.mat m where m.code = r.code);

create or replace function wbd.mats_json(p_code text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name, 'url', url, 'size', size, 'pages', pages)
           order by ord, created_at), '[]'::jsonb)
    from wbd.mat where code = p_code and not hidden;
$$;

create or replace function public.wb_room_open(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room; m wbd.mat;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into m from wbd.mat where id = r.cur_mat and not hidden;
  return jsonb_build_object('ok', true, 'tk', r.tk, 'ver', r.ver, 'code', r.code, 'title', r.title,
    'cur_mat', r.cur_mat, 'dl', r.dl, 'mats', wbd.mats_json(r.code),
    'pdf_url', m.url, 'pdf_name', m.name, 'pages', coalesce(m.pages, 0),
    'page', r.page, 'page_ts', r.page_ts, 'note', r.note, 'note_ts', r.note_ts, 'links', r.links, 'active', r.active);
end $$;

create or replace function public.wb_room_get(p_code text, p_ver int default null) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room; m wbd.mat;
begin
  select * into r from wbd.room where code = left(coalesce(p_code, ''), 8);
  if not found then return jsonb_build_object('ok', false, 'error', 'ROOM_NOT_FOUND'); end if;
  if p_ver is not null and p_ver = r.ver then
    return jsonb_build_object('ok', true, 'same', true, 'ver', r.ver);
  end if;
  select * into m from wbd.mat where id = r.cur_mat and not hidden;
  return jsonb_build_object('ok', true, 'ver', r.ver, 'code', r.code, 'title', r.title,
    'cur_mat', r.cur_mat, 'dl', r.dl, 'mats', wbd.mats_json(r.code),
    'pdf_url', m.url, 'pdf_name', m.name, 'pages', coalesce(m.pages, 0),
    'page', r.page, 'page_ts', r.page_ts, 'note', r.note, 'note_ts', r.note_ts, 'links', r.links, 'active', r.active,
    'tk_hash', encode(digest(r.tk, 'sha256'), 'hex'));
end $$;

create or replace function public.wb_room_set(p_token text, p_code text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  update wbd.room set
    title    = case when p_patch ? 'title'    then left(coalesce(nullif(trim(p_patch->>'title'), ''), title), 80) else title end,
    cur_mat  = case when p_patch ? 'cur_mat'  then (select m.id from wbd.mat m where m.id = p_patch->>'cur_mat' and m.code = p_code and m.kind = 'pdf' and not m.hidden) else cur_mat end,
    dl       = case when p_patch ? 'dl'       then (p_patch->>'dl')::boolean else dl end,
    page     = case when p_patch ? 'page'     then greatest((p_patch->>'page')::int, 1) else page end,
    page_ts  = case when p_patch ? 'page_ts'  then (p_patch->>'page_ts')::bigint else page_ts end,
    note     = case when p_patch ? 'note'     then left(coalesce(p_patch->>'note', ''), 200000) else note end,
    note_ts  = case when p_patch ? 'note_ts'  then (p_patch->>'note_ts')::bigint else note_ts end,
    links    = case when p_patch ? 'links' and jsonb_typeof(p_patch->'links') = 'array' then p_patch->'links' else links end,
    active   = case when p_patch ? 'active'   then (p_patch->>'active')::boolean else active end,
    ver = ver + 1, updated_at = now()
   where code = p_code
  returning * into r;
  return jsonb_build_object('ok', true, 'ver', r.ver);
end $$;

create or replace function public.wb_mat_add(p_token text, p_code text, p_kind text, p_name text, p_url text, p_size bigint, p_pages int) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room; nid text; o int;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_kind not in ('pdf', 'file') then raise exception 'BAD_INPUT'; end if;
  if coalesce(p_url, '') not like 'https://zbpeyklwpotjyveipzxd.supabase.co/storage/v1/object/public/wb-files/%' then raise exception 'BAD_URL'; end if;
  select coalesce(max(ord), -1) + 1 into o from wbd.mat where code = p_code;
  insert into wbd.mat(code, kind, name, url, size, pages, ord)
    values (p_code, p_kind, left(coalesce(nullif(trim(p_name), ''), 'file'), 200), p_url, greatest(coalesce(p_size, 0), 0), greatest(coalesce(p_pages, 0), 0), o)
    returning id into nid;
  update wbd.room set ver = ver + 1, updated_at = now(),
    cur_mat = case when p_kind = 'pdf' and cur_mat is null then nid else cur_mat end,
    page = case when p_kind = 'pdf' and cur_mat is null then 1 else page end
   where code = p_code;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function public.wb_mat_patch(p_token text, p_code text, p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare nxt text;
begin
  perform wbd.sess(p_token);
  if not exists (select 1 from wbd.mat where id = p_id and code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  update wbd.mat set
    name   = case when p_patch ? 'name' then left(coalesce(nullif(trim(p_patch->>'name'), ''), name), 200) else name end,
    hidden = case when p_patch ? 'hidden' then (p_patch->>'hidden')::boolean else hidden end
   where id = p_id and code = p_code;
  if coalesce((p_patch->>'hidden')::boolean, false) then
    select id into nxt from wbd.mat where code = p_code and kind = 'pdf' and not hidden order by ord, created_at limit 1;
    update wbd.room set cur_mat = nxt, page = 1 where code = p_code and (cur_mat = p_id or cur_mat is null);
  end if;
  update wbd.room set ver = ver + 1, updated_at = now() where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wb_mat_order(p_token text, p_code text, p_ids jsonb) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare e record;
begin
  perform wbd.sess(p_token);
  if jsonb_typeof(p_ids) <> 'array' then raise exception 'BAD_INPUT'; end if;
  for e in select value as id, ordinality as n from jsonb_array_elements_text(p_ids) with ordinality loop
    update wbd.mat set ord = e.n::int where id = e.id and code = p_code;
  end loop;
  update wbd.room set ver = ver + 1, updated_at = now() where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wb_sigp(p_code text, p_cid text, p_val int, p_mat text, p_page int) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  if not exists (select 1 from wbd.room where code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_val not in (0, 1, 2) or p_page < 1 or p_page > 2000 or length(coalesce(p_cid, '')) not between 6 and 40
     or length(coalesce(p_mat, '')) not between 1 and 40 then raise exception 'BAD_INPUT'; end if;
  if (select count(*) from wbd.sigp where code = p_code) > 30000
     and not exists (select 1 from wbd.sigp where code = p_code and mat = p_mat and page = p_page and cid = p_cid) then
    raise exception 'ROOM_FULL';
  end if;
  insert into wbd.sigp(code, mat, page, cid, val) values (p_code, p_mat, p_page, p_cid, p_val)
  on conflict (code, mat, page, cid) do update set val = excluded.val, updated_at = now();
end $$;

create or replace function public.wb_sigp_get(p_token text, p_code text, p_mat text, p_page int) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return jsonb_build_object('ok', true,
    'got',  (select count(*) from wbd.sigp where code = p_code and mat = p_mat and page = p_page and val = 1),
    'hard', (select count(*) from wbd.sigp where code = p_code and mat = p_mat and page = p_page and val = 2),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('m', mat, 'p', page, 'g', g, 'h', h) order by mat, page)
       from (select mat, page, count(*) filter (where val = 1) as g, count(*) filter (where val = 2) as h
               from wbd.sigp where code = p_code group by mat, page
              having count(*) filter (where val > 0) > 0) x), '[]'::jsonb));
end $$;

create or replace function public.wb_sigp_reset(p_token text, p_code text, p_mat text, p_page int) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.sigp set val = 0, updated_at = now() where code = p_code and mat = p_mat and page = p_page;
end $$;

revoke execute on function public.wb_mat_add(text, text, text, text, text, bigint, int), public.wb_mat_patch(text, text, text, jsonb), public.wb_mat_order(text, text, jsonb), public.wb_sigp(text, text, int, text, int), public.wb_sigp_get(text, text, text, int), public.wb_sigp_reset(text, text, text, int) from public;
grant execute on function public.wb_mat_add(text, text, text, text, text, bigint, int), public.wb_mat_patch(text, text, text, jsonb), public.wb_mat_order(text, text, jsonb), public.wb_sigp(text, text, int, text, int), public.wb_sigp_get(text, text, text, int), public.wb_sigp_reset(text, text, text, int) to anon, authenticated;
revoke execute on function wbd.mats_json(text) from public, anon, authenticated;

-- 첨부 파일 형식(그림·문서·텍스트 등)을 저장소 버킷에서 허용
update storage.buckets set allowed_mime_types = array['application/pdf','image/png','image/jpeg','image/gif','image/webp','text/plain','text/csv','application/zip','application/x-zip-compressed','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint','application/x-hwp','application/haansofthwp','application/vnd.hancom.hwp','application/vnd.hancom.hwpx'] where id = 'wb-files';
