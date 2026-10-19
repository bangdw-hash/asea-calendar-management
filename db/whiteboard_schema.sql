-- ============================================================================
-- 실시간 수업 노트(whiteboard.html) 스키마
--  * 테이블/내부 함수는 외부에 노출되지 않는 wbd 스키마에 둡니다. (award·budget 와 동일한 보안 구조)
--  * 브라우저(anon 키)는 public.wb_* RPC(SECURITY DEFINER)로만 접근합니다.
--  * 교수자 비밀번호는 이 파일에 넣지 않습니다. 설치 후 아래 중 한 가지로 등록하십시오.
--      (같은 비밀번호 사용) update wbd.secret set admin_hash = (select admin_hash from awd.secret where id = 1) where id = 1;
--      (새 비밀번호)        update wbd.secret set admin_hash = extensions.crypt('<비밀번호>', extensions.gen_salt('bf')) where id = 1;
--  * PDF 교안은 공개 저장소 버킷 wb-files 에 올립니다. (PDF 형식·50MB 이하만 허용, 덮어쓰기·삭제 불가)
--  * 여러 번 실행해도 안전합니다(idempotent).
-- ============================================================================

create schema if not exists wbd;
revoke all on schema wbd from public, anon, authenticated;

create table if not exists wbd.secret (
  id int primary key default 1 check (id = 1),
  admin_hash text,
  admin_fail int not null default 0,
  admin_locked_until timestamptz
);
insert into wbd.secret(id) values (1) on conflict do nothing;

create table if not exists wbd.sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 수업방: 학생 화면이 읽는 공개 상태 + 교수자 전용 키(tk)
create table if not exists wbd.room (
  code text primary key,
  title text not null default '',
  pdf_url text,
  pdf_name text,
  pages int not null default 0,
  page int not null default 1,
  page_ts bigint not null default 0,
  note text not null default '',
  note_ts bigint not null default 0,
  links jsonb not null default '[]'::jsonb,
  tk text not null,
  active boolean not null default true,
  ver int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 이해도 신호: 학생 기기별 1건 (0 해제 · 1 이해함 · 2 어려움)
create table if not exists wbd.sig (
  code text not null references wbd.room(code) on delete cascade,
  cid text not null,
  val int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code, cid)
);

create or replace function wbd.sess(p_token text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  delete from wbd.sessions where expires_at < now();
  if not exists (select 1 from wbd.sessions
                  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
                    and expires_at > now()) then
    raise exception 'AUTH_REQUIRED';
  end if;
end $$;

-- ───────── 교수자 로그인 ─────────
create or replace function public.wb_login(p_pw text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare v wbd.secret; t text;
begin
  select * into v from wbd.secret where id = 1 for update;
  if v.admin_hash is null then return jsonb_build_object('ok', false, 'error', 'ADMIN_NOT_SET'); end if;
  if v.admin_locked_until is not null and v.admin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED_OUT', 'until', v.admin_locked_until);
  end if;
  if crypt(coalesce(p_pw, ''), v.admin_hash) <> v.admin_hash then
    update wbd.secret set admin_fail = case when admin_fail + 1 >= 5 then 0 else admin_fail + 1 end,
           admin_locked_until = case when admin_fail + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = 1;
    return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD', 'left', greatest(5 - (v.admin_fail + 1), 0));
  end if;
  update wbd.secret set admin_fail = 0, admin_locked_until = null where id = 1;
  t := encode(gen_random_bytes(24), 'hex');
  insert into wbd.sessions(token_hash, expires_at)
    values (encode(digest(t, 'sha256'), 'hex'), now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', t);
end $$;

create or replace function public.wb_check(p_token text) returns boolean
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return true;
exception when others then return false;
end $$;

-- ───────── 수업방 ─────────
create or replace function public.wb_room_create(p_token text, p_title text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare c text; n int := 0;
begin
  perform wbd.sess(p_token);
  loop
    c := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from wbd.room where code = c);
    n := n + 1;
    if n > 200 then raise exception 'NO_FREE_CODE'; end if;
  end loop;
  insert into wbd.room(code, title, tk)
    values (c, left(coalesce(nullif(trim(p_title), ''), 'New class'), 80), encode(gen_random_bytes(16), 'hex'));
  return jsonb_build_object('ok', true, 'code', c);
end $$;

create or replace function public.wb_room_list(p_token text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'code', code, 'title', title, 'pdf_name', pdf_name, 'pages', pages, 'active', active,
      'updated_at', updated_at) order by updated_at desc)
    from wbd.room), '[]'::jsonb);
end $$;

-- 교수자가 방을 열 때: 공개 상태 + 교수자 키
create or replace function public.wb_room_open(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'tk', r.tk, 'ver', r.ver, 'code', r.code, 'title', r.title,
    'pdf_url', r.pdf_url, 'pdf_name', r.pdf_name, 'pages', r.pages, 'page', r.page, 'page_ts', r.page_ts,
    'note', r.note, 'note_ts', r.note_ts, 'links', r.links, 'active', r.active);
end $$;

-- 교수자 상태 갱신 (허용된 항목만)
create or replace function public.wb_room_set(p_token text, p_code text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  update wbd.room set
    title    = case when p_patch ? 'title'    then left(coalesce(nullif(trim(p_patch->>'title'), ''), title), 80) else title end,
    pdf_url  = case when p_patch ? 'pdf_url'  then left(p_patch->>'pdf_url', 500) else pdf_url end,
    pdf_name = case when p_patch ? 'pdf_name' then left(p_patch->>'pdf_name', 200) else pdf_name end,
    pages    = case when p_patch ? 'pages'    then greatest((p_patch->>'pages')::int, 0) else pages end,
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

-- 학생(공개) 조회: 버전이 같으면 본문 없이 same 만 반환
create or replace function public.wb_room_get(p_code text, p_ver int default null) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room;
begin
  select * into r from wbd.room where code = left(coalesce(p_code, ''), 8);
  if not found then return jsonb_build_object('ok', false, 'error', 'ROOM_NOT_FOUND'); end if;
  if p_ver is not null and p_ver = r.ver then
    return jsonb_build_object('ok', true, 'same', true, 'ver', r.ver);
  end if;
  return jsonb_build_object('ok', true, 'ver', r.ver, 'code', r.code, 'title', r.title,
    'pdf_url', r.pdf_url, 'pdf_name', r.pdf_name, 'pages', r.pages, 'page', r.page, 'page_ts', r.page_ts,
    'note', r.note, 'note_ts', r.note_ts, 'links', r.links, 'active', r.active,
    'tk_hash', encode(digest(r.tk, 'sha256'), 'hex'));
end $$;

-- ───────── 이해도 신호 ─────────
create or replace function public.wb_sig(p_code text, p_cid text, p_val int) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  if not exists (select 1 from wbd.room where code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_val not in (0, 1, 2) or length(coalesce(p_cid, '')) not between 6 and 40 then raise exception 'BAD_INPUT'; end if;
  if (select count(*) from wbd.sig where code = p_code) > 500
     and not exists (select 1 from wbd.sig where code = p_code and cid = p_cid) then
    raise exception 'ROOM_FULL';
  end if;
  insert into wbd.sig(code, cid, val) values (p_code, p_cid, p_val)
  on conflict (code, cid) do update set val = excluded.val, updated_at = now();
end $$;

create or replace function public.wb_sig_get(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return jsonb_build_object('ok', true,
    'got',  (select count(*) from wbd.sig where code = p_code and val = 1),
    'hard', (select count(*) from wbd.sig where code = p_code and val = 2));
end $$;

create or replace function public.wb_sig_reset(p_token text, p_code text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.sig set val = 0, updated_at = now() where code = p_code;
end $$;

-- 외부 실행 권한: wb_* 만 허용 (수업방 삭제 RPC 는 두지 않고 「수업 종료」로 비활성화합니다)
revoke execute on function wbd.sess(text) from public, anon, authenticated;
revoke execute on function
  public.wb_login(text), public.wb_check(text), public.wb_room_create(text, text), public.wb_room_list(text),
  public.wb_room_open(text, text), public.wb_room_set(text, text, jsonb),
  public.wb_room_get(text, int), public.wb_sig(text, text, int), public.wb_sig_get(text, text),
  public.wb_sig_reset(text, text)
  from public;
grant execute on function
  public.wb_login(text), public.wb_check(text), public.wb_room_create(text, text), public.wb_room_list(text),
  public.wb_room_open(text, text), public.wb_room_set(text, text, jsonb),
  public.wb_room_get(text, int), public.wb_sig(text, text, int), public.wb_sig_get(text, text),
  public.wb_sig_reset(text, text)
  to anon, authenticated;

-- ───────── PDF 저장소 ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wb-files', 'wb-files', true, 52428800, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['application/pdf'];

drop policy if exists wb_files_insert on storage.objects;
create policy wb_files_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'wb-files');
