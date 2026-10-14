-- ============================================================================
-- 상장 메일머지 출력기(award.html) 스키마
--  * 테이블/내부 함수는 외부에 노출되지 않는 awd 스키마에 둡니다. (budget.html 과 동일한 보안 구조)
--  * 브라우저(anon 키)는 public.award_* RPC(SECURITY DEFINER, 12시간 토큰 검증)로만 접근합니다.
--  * 관리자 비밀번호는 이 파일에 넣지 않습니다. 설치 후 아래 명령으로 별도 등록하십시오.
--      update awd.secret set admin_hash = extensions.crypt('<관리자 비밀번호>', extensions.gen_salt('bf')) where id = 1;
--  * 여러 번 실행해도 안전합니다(idempotent).
-- ============================================================================

create schema if not exists awd;
revoke all on schema awd from public, anon, authenticated;

create table if not exists awd.secret (
  id int primary key default 1 check (id = 1),
  admin_hash text,
  admin_fail int not null default 0,
  admin_locked_until timestamptz
);
insert into awd.secret(id) values (1) on conflict do nothing;

create table if not exists awd.sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 양식: 배경(bg)은 용량이 커서 별도 컬럼, 목록 조회에서는 제외합니다.
create table if not exists awd.tpl (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  page jsonb not null default '{}'::jsonb,    -- {w,h,orient} (mm)
  elems jsonb not null default '[]'::jsonb,   -- 요소 배열
  fields jsonb not null default '[]'::jsonb,  -- 입력 항목 안내(이름·설명·예시·최대글자)
  rows jsonb not null default '[]'::jsonb,    -- 현재 작업 중인 일괄 데이터
  bg text,                                    -- 배경 이미지 data URL (JPEG)
  bg_name text,
  ver int not null default 1,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 양식 버전 이력(저장 시마다 스냅샷, 배경 제외)
create table if not exists awd.tpl_ver (
  id bigserial primary key,
  tpl_id uuid not null references awd.tpl(id) on delete cascade,
  ver int not null,
  note text not null default '',
  snap jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists tpl_ver_idx on awd.tpl_ver(tpl_id, ver desc);

-- 발급(출력) 이력: 당시 양식·데이터를 그대로 보관하여 재출력 가능
create table if not exists awd.batch (
  id uuid primary key default gen_random_uuid(),
  tpl_id uuid references awd.tpl(id) on delete set null,
  tpl_name text not null,
  kind text not null default 'print',        -- print | pdf | preview
  cnt int not null default 0,
  label text not null default '',
  rows jsonb not null default '[]'::jsonb,
  snap jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists batch_idx on awd.batch(created_at desc);

create table if not exists awd.log (
  id bigserial primary key,
  action text not null,
  target text not null default '',
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table awd.secret enable row level security;
alter table awd.sessions enable row level security;
alter table awd.tpl enable row level security;
alter table awd.tpl_ver enable row level security;
alter table awd.batch enable row level security;
alter table awd.log enable row level security;
revoke all on all tables in schema awd from public, anon, authenticated;
revoke all on all sequences in schema awd from public, anon, authenticated;

-- ── 내부 함수 ────────────────────────────────────────────────────────────────
create or replace function awd.sess(p_token text) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  delete from awd.sessions where expires_at < now();
  if not exists (select 1 from awd.sessions
                  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
                    and expires_at > now()) then
    raise exception 'AUTH_REQUIRED';
  end if;
end $$;

create or replace function awd.log_add(p_action text, p_target text, p_detail jsonb default null) returns void
language sql security definer set search_path = awd, public as $$
  insert into awd.log(action, target, detail) values (p_action, coalesce(p_target, ''), p_detail);
$$;

-- ── 공개 RPC ────────────────────────────────────────────────────────────────
create or replace function public.award_login(p_pw text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare v awd.secret; t text;
begin
  select * into v from awd.secret where id = 1 for update;
  if v.admin_hash is null then return jsonb_build_object('ok', false, 'error', 'ADMIN_NOT_SET'); end if;
  if v.admin_locked_until is not null and v.admin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED_OUT', 'until', v.admin_locked_until);
  end if;
  if crypt(coalesce(p_pw, ''), v.admin_hash) <> v.admin_hash then
    update awd.secret set admin_fail = case when admin_fail + 1 >= 5 then 0 else admin_fail + 1 end,
           admin_locked_until = case when admin_fail + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = 1;
    perform awd.log_add('login_fail', '');
    return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD', 'left', greatest(5 - (v.admin_fail + 1), 0));
  end if;
  update awd.secret set admin_fail = 0, admin_locked_until = null where id = 1;
  t := encode(gen_random_bytes(24), 'hex');
  insert into awd.sessions(token_hash, expires_at)
    values (encode(digest(t, 'sha256'), 'hex'), now() + interval '12 hours');
  perform awd.log_add('login', '');
  return jsonb_build_object('ok', true, 'token', t);
end $$;

create or replace function public.award_logout(p_token text) returns void
language sql security definer set search_path = awd, extensions, public as $$
  delete from awd.sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.award_check(p_token text) returns boolean
language plpgsql security definer set search_path = awd, extensions, public as $$
begin perform awd.sess(p_token); return true; end $$;

-- 양식 목록 (배경 제외)
create or replace function public.award_tpl_list(p_token text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'name', t.name, 'ver', t.ver, 'updated_at', t.updated_at,
            'rows', jsonb_array_length(t.rows), 'page', t.page, 'has_bg', t.bg is not null)
            order by t.updated_at desc), '[]'::jsonb)
            from awd.tpl t where not t.archived);
end $$;

-- 양식 1건 (배경 포함)
create or replace function public.award_tpl_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare t awd.tpl;
begin
  perform awd.sess(p_token);
  select * into t from awd.tpl where id = p_id and not archived;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(t);
end $$;

-- 저장: p_base_ver 가 서버 ver 와 다르면 충돌(다른 단말기에서 먼저 저장). p_force=true 면 덮어쓰기.
-- p_bg: null 이면 배경 유지, '' 이면 배경 삭제, 그 외 새 배경.
create or replace function public.award_tpl_save(
  p_token text, p_id uuid, p_base_ver int, p_force boolean,
  p_name text, p_page jsonb, p_elems jsonb, p_fields jsonb, p_rows jsonb,
  p_bg text, p_bg_name text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare t awd.tpl; nv int; nid uuid;
begin
  perform awd.sess(p_token);
  if p_id is null then
    insert into awd.tpl(name, page, elems, fields, rows, bg, bg_name)
      values (coalesce(nullif(trim(p_name), ''), '새 상장 양식'), coalesce(p_page, '{}'), coalesce(p_elems, '[]'),
              coalesce(p_fields, '[]'), coalesce(p_rows, '[]'), nullif(p_bg, ''), p_bg_name)
      returning id into nid;
    insert into awd.tpl_ver(tpl_id, ver, note, snap)
      values (nid, 1, coalesce(p_note, '최초 저장'), jsonb_build_object('name', p_name, 'page', p_page, 'elems', p_elems, 'fields', p_fields));
    perform awd.log_add('tpl_create', nid::text, jsonb_build_object('name', p_name));
    return jsonb_build_object('ok', true, 'id', nid, 'ver', 1);
  end if;
  select * into t from awd.tpl where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if t.ver <> p_base_ver and not coalesce(p_force, false) then
    return jsonb_build_object('ok', false, 'error', 'CONFLICT', 'ver', t.ver, 'updated_at', t.updated_at);
  end if;
  nv := t.ver + 1;
  update awd.tpl set
      name = coalesce(nullif(trim(p_name), ''), name),
      page = coalesce(p_page, page), elems = coalesce(p_elems, elems),
      fields = coalesce(p_fields, fields), rows = coalesce(p_rows, rows),
      bg = case when p_bg is null then bg when p_bg = '' then null else p_bg end,
      bg_name = case when p_bg is null then bg_name when p_bg = '' then null else p_bg_name end,
      ver = nv, updated_at = now()
    where id = p_id;
  -- 양식 구조(요소·항목)가 바뀐 경우에만 버전 스냅샷 보관 (데이터만 바뀐 자동저장은 제외)
  if t.elems is distinct from coalesce(p_elems, t.elems) or t.page is distinct from coalesce(p_page, t.page)
     or t.fields is distinct from coalesce(p_fields, t.fields) or t.name is distinct from coalesce(nullif(trim(p_name), ''), t.name) then
    insert into awd.tpl_ver(tpl_id, ver, note, snap)
      values (p_id, nv, coalesce(p_note, ''), jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), t.name),
              'page', coalesce(p_page, t.page), 'elems', coalesce(p_elems, t.elems), 'fields', coalesce(p_fields, t.fields)));
    delete from awd.tpl_ver where tpl_id = p_id and id not in
      (select id from awd.tpl_ver where tpl_id = p_id order by ver desc limit 30);
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'ver', nv);
end $$;

create or replace function public.award_tpl_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  update awd.tpl set archived = true, updated_at = now() where id = p_id;
  perform awd.log_add('tpl_delete', p_id::text);
end $$;

create or replace function public.award_tpl_duplicate(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare nid uuid;
begin
  perform awd.sess(p_token);
  insert into awd.tpl(name, page, elems, fields, rows, bg, bg_name)
    select name || ' (복사)', page, elems, fields, '[]'::jsonb, bg, bg_name from awd.tpl where id = p_id and not archived
    returning id into nid;
  if nid is null then raise exception 'NOT_FOUND'; end if;
  insert into awd.tpl_ver(tpl_id, ver, note, snap)
    select nid, 1, '복사본 생성', jsonb_build_object('name', name, 'page', page, 'elems', elems, 'fields', fields) from awd.tpl where id = nid;
  perform awd.log_add('tpl_duplicate', p_id::text, jsonb_build_object('new', nid));
  return jsonb_build_object('id', nid);
end $$;

create or replace function public.award_ver_list(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('ver', v.ver, 'note', v.note, 'created_at', v.created_at,
            'elems', jsonb_array_length(v.snap->'elems')) order by v.ver desc), '[]'::jsonb)
            from awd.tpl_ver v where v.tpl_id = p_id);
end $$;

create or replace function public.award_ver_get(p_token text, p_id uuid, p_ver int) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select snap from awd.tpl_ver where tpl_id = p_id and ver = p_ver);
end $$;

-- 발급(출력) 이력
create or replace function public.award_batch_add(
  p_token text, p_tpl uuid, p_name text, p_kind text, p_label text, p_rows jsonb, p_snap jsonb) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare bid uuid;
begin
  perform awd.sess(p_token);
  insert into awd.batch(tpl_id, tpl_name, kind, cnt, label, rows, snap)
    values (p_tpl, coalesce(p_name, ''), coalesce(p_kind, 'print'), jsonb_array_length(coalesce(p_rows, '[]')),
            coalesce(p_label, ''), coalesce(p_rows, '[]'), coalesce(p_snap, '{}'))
    returning id into bid;
  delete from awd.batch where id not in (select id from awd.batch order by created_at desc limit 300);
  return jsonb_build_object('id', bid);
end $$;

create or replace function public.award_batch_list(p_token text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'tpl_id', b.tpl_id, 'tpl_name', b.tpl_name,
            'kind', b.kind, 'cnt', b.cnt, 'label', b.label, 'created_at', b.created_at,
            'first', b.rows->0) order by b.created_at desc), '[]'::jsonb)
            from (select * from awd.batch order by created_at desc limit 100) b);
end $$;

create or replace function public.award_batch_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select to_jsonb(b) from awd.batch b where b.id = p_id);
end $$;

create or replace function public.award_log_list(p_token text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]'::jsonb)
            from (select * from awd.log order by id desc limit 100) l);
end $$;

create or replace function public.award_log_add(p_token text, p_action text, p_target text, p_detail jsonb) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  perform awd.log_add(left(p_action, 40), left(p_target, 80), p_detail);
end $$;

-- ── 실행 권한: 내부 함수는 회수, public.award_* 만 anon 에 허용 ──────────────
revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
