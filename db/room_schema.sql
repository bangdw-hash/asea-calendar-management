-- ============================================================================
-- 링크형 업무방(room.html) 스키마  — 스키마 이름 rm
--  * 링크(추측 불가 토큰)를 가진 사람은 누구나 방을 보고, 이름을 입력해 입장하면 쓸 수 있습니다(한컴독스형).
--  * 이름은 방 안에서 유일하며 PIN(숫자 4자리)은 선택입니다. PIN 을 만들면 그 이름은 다른 사람이 쓸 수 없습니다.
--  * 방 개설·설정·링크 재발급·휴지통 정리는 Google 로그인(task-auth 세션, tsk 스키마)을 거친 관리자·개설자만 합니다.
--  * 테이블은 외부에 노출되지 않고, 브라우저는 public.rm_* RPC(SECURITY DEFINER)로만 접근합니다.
--  * 파일은 비공개 저장소 room-files 에 두며, 업로드·열람 주소는 Edge Function room-file 이 짧게 발급합니다.
--  * 여러 번 실행해도 안전합니다(idempotent).
-- 적용 메모: DELETE 는 plpgsql 안이 아닌 SQL 함수(rm.drop_*, rm.purge_rows)로 분리, 정규식 부정은 not (x ~ y) 형태 사용.
-- ============================================================================

create schema if not exists rm;
revoke all on schema rm from public, anon, authenticated;

create table if not exists rm.room (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  name text not null check (length(name) between 1 and 80),
  mode text not null default 'rw' check (mode in ('rw','ro','locked')),
  owner text,
  stages jsonb not null default '["준비","확정·진행","점검","운영·마무리"]'::jsonb,
  orgs jsonb not null default '[{"k":"gen","n":"총학생회","c":"#1A73E8"},{"k":"edu","n":"교육처","c":"#16a34a"},{"k":"adm","n":"중앙행정","c":"#ea580c"},{"k":"job","n":"일경험팀","c":"#7c3aed"},{"k":"all","n":"합동","c":"#5B6678"}]'::jsonb,
  tracks jsonb not null default '["기획·총괄","무대·프로그램","부스·참여단체","홍보·SNS","시설·대관·안전","예산·계약·물품","학생 스태프"]'::jsonb,
  info jsonb not null default '{}'::jsonb,
  upload_on boolean not null default true,
  max_mb int not null default 20 check (max_mb between 1 and 20),
  rev bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rm.person (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rm.room(id) on delete cascade,
  name text not null check (length(name) between 1 and 20),
  name_key text not null,
  org text not null default '',
  pin_hash text,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, name_key)
);

create table if not exists rm.sess (
  token_hash text primary key,
  person_id uuid not null references rm.person(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '90 days'
);

create table if not exists rm.task (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rm.room(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  org text not null default '',
  track text not null default '' check (length(track) <= 20),
  stage int not null default 0 check (stage between 0 and 7),
  assignee uuid references rm.person(id) on delete set null,
  due date,
  note text not null default '' check (length(note) <= 2000),
  items jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  ver int not null default 1,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rm_task_room_idx on rm.task(room_id);

create table if not exists rm.file (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rm.room(id) on delete cascade,
  task_id uuid references rm.task(id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  path text not null unique,
  size bigint not null default 0,
  mime text not null default '',
  kind text not null default 'doc' check (kind in ('img','pdf','doc')),
  by_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rm_file_room_idx on rm.file(room_id);

create table if not exists rm.decision (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rm.room(id) on delete cascade,
  text text not null check (length(text) between 1 and 300),
  org text not null default '',
  by_name text,
  hist jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rm_dec_room_idx on rm.decision(room_id);

create table if not exists rm.activity (
  id bigserial primary key,
  room_id uuid not null references rm.room(id) on delete cascade,
  at timestamptz not null default now(),
  who text,
  msg text not null
);
create index if not exists rm_act_room_idx on rm.activity(room_id, id desc);

create table if not exists rm.notice (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references rm.person(id) on delete cascade,
  room_id uuid not null references rm.room(id) on delete cascade,
  ref uuid,
  msg text not null,
  read boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists rm_notice_idx on rm.notice(person_id, at desc);

create table if not exists rm.creator (email text primary key);

do $$ declare t text; begin
  foreach t in array array['room','person','sess','task','file','decision','activity','notice','creator'] loop
    execute format('alter table rm.%I enable row level security', t);
    execute format('revoke all on rm.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ============================================================================
-- 내부 함수
-- ============================================================================
create or replace function rm.room_of(p_room text) returns rm.room
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room;
begin
  select * into r from rm.room where token = p_room;
  if not found then raise exception 'NO_ROOM'; end if;
  if r.mode = 'locked' then raise exception 'LOCKED'; end if;
  return r;
end $$;

create or replace function rm.person_of(r rm.room, p_ptok text) returns rm.person
language plpgsql security definer set search_path = rm, extensions, public as $$
declare pr rm.person;
begin
  select p.* into pr from rm.sess s join rm.person p on p.id = s.person_id
   where s.token_hash = encode(extensions.digest(coalesce(p_ptok, ''), 'sha256'), 'hex')
     and s.expires_at > now() and p.room_id = r.id;
  if not found then raise exception 'JOIN'; end if;
  return pr;
end $$;

-- 쓰기 권한 확인: 방이 쓰기 가능 상태이고 입장한 사람이어야 합니다.
create or replace function rm.writer(p_room text, p_ptok text) returns rm.person
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  return pr;
end $$;

create or replace function rm.bump(p_room uuid) returns void
language sql security definer set search_path = rm, public as $$
  update rm.room set rev = rev + 1, updated_at = now() where id = p_room;
$$;

create or replace function rm.act(p_room uuid, p_who text, p_msg text) returns void
language sql security definer set search_path = rm, public as $$
  insert into rm.activity(room_id, who, msg) values (p_room, p_who, left(p_msg, 200));
$$;

create or replace function rm.notify(p_person uuid, p_by uuid, p_room uuid, p_ref uuid, p_msg text) returns void
language sql security definer set search_path = rm, public as $$
  insert into rm.notice(person_id, room_id, ref, msg)
  select p_person, p_room, p_ref, left(p_msg, 200)
   where p_person is not null and p_person is distinct from p_by
     and exists (select 1 from rm.person where id = p_person and room_id = p_room);
$$;

create or replace function rm.new_sess(p_person uuid) returns text
language plpgsql security definer set search_path = rm, extensions, public as $$
declare tok text;
begin
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into rm.sess(token_hash, person_id) values (encode(extensions.digest(tok, 'sha256'), 'hex'), p_person);
  return tok;
end $$;

-- 삭제는 SQL 함수로 분리
create or replace function rm.purge_rows(p_room uuid, p_days int) returns text[]
language sql security definer set search_path = rm, public as $$
  with f as (delete from rm.file where room_id = p_room and deleted_at <= now() - make_interval(days => p_days) returning path),
       t as (delete from rm.task where room_id = p_room and deleted_at <= now() - make_interval(days => p_days) returning 1),
       d as (delete from rm.decision where room_id = p_room and deleted_at <= now() - make_interval(days => p_days) returning 1)
  select coalesce((select array_agg(path) from f), '{}'::text[]);
$$;

create or replace function rm.drop_sess_expired() returns void
language sql security definer set search_path = rm, public as $$
  delete from rm.sess where expires_at < now();
$$;

create or replace function rm.admin(p_tsk text) returns tsk.member
language plpgsql security definer set search_path = rm, tsk, extensions, public as $$
declare m tsk.member;
begin
  m := tsk.me(p_tsk);
  if m.role = 'admin' or exists (select 1 from rm.creator where email = m.email) then return m; end if;
  raise exception 'FORBIDDEN';
end $$;

-- ============================================================================
-- 공개 RPC (브라우저 → anon). 첫 인자는 방 링크 토큰, 쓰기는 입장 토큰(p_ptok)이 필요합니다.
-- ============================================================================
create or replace function public.rm_peek(p_room text) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room;
begin
  r := rm.room_of(p_room);
  return jsonb_build_object('name', r.name, 'mode', r.mode, 'info', r.info, 'orgs', r.orgs);
end $$;

-- 입장: 이름(필수)·소속·PIN(선택 4자리). PIN 이 있는 이름은 PIN 을 맞춰야 들어올 수 있습니다.
create or replace function public.rm_join(p_room text, p_name text, p_org text, p_pin text) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; nm text := trim(coalesce(p_name, '')); pn text := coalesce(p_pin, ''); pr rm.person; applied boolean := false;
begin
  r := rm.room_of(p_room);
  if length(nm) not between 1 and 20 then raise exception 'BAD_NAME'; end if;
  if pn <> '' and not (pn ~ '^[0-9]{4}$') then raise exception 'BAD_PIN'; end if;
  select * into pr from rm.person where room_id = r.id and name_key = lower(nm);
  if not found then
    if (select count(*) from rm.person where room_id = r.id) >= 300 then raise exception 'ROOM_FULL'; end if;
    insert into rm.person(room_id, name, name_key, org, pin_hash)
    values (r.id, nm, lower(nm), left(coalesce(p_org, ''), 10), case when pn <> '' then extensions.crypt(pn, extensions.gen_salt('bf')) end)
    returning * into pr;
    applied := pn <> '';
    perform rm.act(r.id, nm, nm || '님이 입장했습니다.');
    perform rm.bump(r.id);
  elsif pr.pin_hash is not null then
    if pr.locked_until is not null and pr.locked_until > now() then
      return jsonb_build_object('error', 'PIN_LOCKED');
    end if;
    if pn = '' or pr.pin_hash <> extensions.crypt(pn, pr.pin_hash) then
      update rm.person set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
             locked_until = case when fails + 1 >= 5 then now() + interval '15 minutes' end
       where id = pr.id;
      return jsonb_build_object('error', 'PIN_WRONG');
    end if;
    update rm.person set fails = 0, locked_until = null where id = pr.id;
    applied := true;
  end if;
  return jsonb_build_object('ptok', rm.new_sess(pr.id), 'me', jsonb_build_object('id', pr.id, 'name', pr.name, 'org', pr.org, 'pin', pr.pin_hash is not null or applied));
end $$;

-- 이미 입장한 사람이 PIN 을 새로 만듭니다(이미 PIN 이 있으면 불가).
create or replace function public.rm_pin_set(p_room text, p_ptok text, p_pin text) returns void
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person;
begin
  r := rm.room_of(p_room);
  pr := rm.person_of(r, p_ptok);
  if not (coalesce(p_pin, '') ~ '^[0-9]{4}$') then raise exception 'BAD_PIN'; end if;
  if pr.pin_hash is not null then raise exception 'PIN_EXISTS'; end if;
  update rm.person set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')) where id = pr.id;
  perform rm.bump(r.id);
end $$;

create or replace function public.rm_sync(p_room text, p_ptok text, p_since bigint) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person;
begin
  r := rm.room_of(p_room);
  if coalesce(p_ptok, '') <> '' then
    begin pr := rm.person_of(r, p_ptok); exception when others then pr := null; end;
  end if;
  if p_since is not null and p_since = r.rev then
    return jsonb_build_object('changed', false, 'rev', r.rev, 'joined', pr.id is not null);
  end if;
  return jsonb_build_object(
    'changed', true, 'rev', r.rev, 'joined', pr.id is not null,
    'room', jsonb_build_object('name', r.name, 'mode', r.mode, 'info', r.info, 'stages', r.stages, 'orgs', r.orgs,
                               'tracks', r.tracks, 'upload_on', r.upload_on, 'max_mb', r.max_mb),
    'me', case when pr.id is null then null else jsonb_build_object('id', pr.id, 'name', pr.name, 'org', pr.org, 'pin', pr.pin_hash is not null) end,
    'persons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'org', org, 'pin', pin_hash is not null) order by name)
                           from rm.person where room_id = r.id), '[]'),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'org', t.org, 'track', t.track, 'stage', t.stage,
                           'assignee', t.assignee, 'due', t.due, 'note', t.note, 'items', t.items, 'ver', t.ver,
                           'files', (select count(*) from rm.file f where f.task_id = t.id and f.deleted_at is null)) order by t.due nulls last, t.created_at)
                         from rm.task t where t.room_id = r.id and t.deleted_at is null), '[]'),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'task_id', task_id, 'name', name, 'size', size, 'mime', mime, 'kind', kind, 'by', by_name, 'at', created_at) order by created_at desc)
                         from (select * from rm.file where room_id = r.id and deleted_at is null order by created_at desc limit 300) f), '[]'),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'org', org, 'by', by_name, 'at', created_at, 'edits', jsonb_array_length(hist)) order by created_at desc)
                             from rm.decision where room_id = r.id and deleted_at is null), '[]'),
    'trash', jsonb_build_object(
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'at', deleted_at) order by deleted_at desc) from (select * from rm.task where room_id = r.id and deleted_at is not null order by deleted_at desc limit 50) x), '[]'),
      'files', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', name, 'at', deleted_at) order by deleted_at desc) from (select * from rm.file where room_id = r.id and deleted_at is not null order by deleted_at desc limit 50) x), '[]'),
      'decisions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', text, 'at', deleted_at) order by deleted_at desc) from (select * from rm.decision where room_id = r.id and deleted_at is not null order by deleted_at desc limit 50) x), '[]')),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'who', who, 'msg', msg) order by id desc)
                            from (select * from rm.activity where room_id = r.id order by id desc limit 40) a), '[]'),
    'notices', case when pr.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ref', ref, 'msg', msg, 'read', read, 'at', at) order by at desc)
                            from (select * from rm.notice where person_id = pr.id order by at desc limit 40) n), '[]') end);
end $$;

-- 업무 만들기·수정 (p.id 없으면 생성). 수정은 ver 로 충돌을 막습니다.
create or replace function public.rm_task_save(p_room text, p_ptok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person; t rm.task; v_id uuid := nullif(p->>'id', '')::uuid; ttl text; og text; tr text; st int; asg uuid; dd date; its jsonb; old_asg uuid;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  ttl := trim(coalesce(p->>'title', ''));
  if length(ttl) not between 1 and 120 then raise exception 'BAD_TITLE'; end if;
  og := left(coalesce(p->>'org', ''), 10);
  tr := left(coalesce(p->>'track', ''), 20);
  st := coalesce((p->>'stage')::int, 0);
  if st not between 0 and jsonb_array_length(r.stages) - 1 then raise exception 'BAD_STAGE'; end if;
  asg := nullif(p->>'assignee', '')::uuid;
  if asg is not null and not exists (select 1 from rm.person where id = asg and room_id = r.id) then raise exception 'BAD_ASSIGNEE'; end if;
  dd := nullif(p->>'due', '')::date;
  if jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) > 40 then raise exception 'BAD_ITEMS'; end if;
  its := coalesce((select jsonb_agg(jsonb_build_object('id', left(coalesce(nullif(x->>'id', ''), substr(md5(random()::text), 1, 8)), 12), 't', left(trim(x->>'t'), 120), 'done', coalesce((x->>'done')::boolean, false)))
                     from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) x where length(trim(coalesce(x->>'t', ''))) > 0), '[]'::jsonb);
  if v_id is null then
    if (select count(*) from rm.task where room_id = r.id) >= 300 then raise exception 'TOO_MANY'; end if;
    insert into rm.task(room_id, title, org, track, stage, assignee, due, note, items, created_by)
    values (r.id, ttl, og, tr, st, asg, dd, left(coalesce(p->>'note', ''), 2000), its, pr.name) returning * into t;
    perform rm.act(r.id, pr.name, '업무 「' || ttl || '」을(를) 만들었습니다.');
  else
    select * into t from rm.task where id = v_id and room_id = r.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if t.ver <> coalesce((p->>'ver')::int, -1) then raise exception 'CONFLICT'; end if;
    old_asg := t.assignee;
    update rm.task set title = ttl, org = og, track = tr, stage = st, assignee = asg, due = dd,
           note = left(coalesce(p->>'note', ''), 2000), items = its, ver = ver + 1, updated_at = now()
     where id = t.id returning * into t;
    perform rm.act(r.id, pr.name, '업무 「' || ttl || '」을(를) 수정했습니다.');
  end if;
  if t.assignee is not null and t.assignee is distinct from old_asg then
    perform rm.notify(t.assignee, pr.id, r.id, t.id, '「' || t.title || '」 업무의 담당으로 지정되었습니다.');
  end if;
  perform rm.bump(r.id);
  return jsonb_build_object('id', t.id, 'ver', t.ver);
end $$;

create or replace function public.rm_task_stage(p_room text, p_ptok text, p_id uuid, p_stage int, p_ver int) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person; t rm.task; nm text;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  select * into t from rm.task where id = p_id and room_id = r.id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_stage not between 0 and jsonb_array_length(r.stages) - 1 then raise exception 'BAD_STAGE'; end if;
  if t.ver <> p_ver then raise exception 'CONFLICT'; end if;
  if p_stage = t.stage then return jsonb_build_object('id', t.id, 'ver', t.ver); end if;
  update rm.task set stage = p_stage, ver = ver + 1, updated_at = now() where id = t.id returning * into t;
  nm := r.stages->>p_stage;
  perform rm.act(r.id, pr.name, '「' || t.title || '」을(를) 「' || nm || '」 단계로 옮겼습니다.');
  perform rm.notify(t.assignee, pr.id, r.id, t.id, '「' || t.title || '」 업무가 「' || nm || '」 단계로 이동했습니다.');
  perform rm.bump(r.id);
  return jsonb_build_object('id', t.id, 'ver', t.ver);
end $$;

create or replace function public.rm_item_toggle(p_room text, p_ptok text, p_task uuid, p_item text, p_done boolean) returns void
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person; t rm.task;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  select * into t from rm.task where id = p_task and room_id = r.id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update rm.task set ver = ver + 1, updated_at = now(),
         items = (select coalesce(jsonb_agg(case when e->>'id' = p_item then jsonb_set(e, '{done}', to_jsonb(p_done)) else e end order by ord), '[]'::jsonb)
                    from jsonb_array_elements(t.items) with ordinality as x(e, ord))
   where id = t.id;
  perform rm.act(r.id, pr.name, '「' || t.title || '」 체크 ' || case when p_done then '완료' else '해제' end);
  perform rm.bump(r.id);
end $$;

-- 삭제(휴지통)·복구. kind: task | file | decision
create or replace function public.rm_trash(p_room text, p_ptok text, p_kind text, p_id uuid, p_flag boolean) returns void
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person; ts timestamptz := case when p_flag then now() end; nm text;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  if p_kind = 'task' then
    update rm.task set deleted_at = ts, ver = ver + 1 where id = p_id and room_id = r.id returning title into nm;
  elsif p_kind = 'file' then
    update rm.file set deleted_at = ts where id = p_id and room_id = r.id returning name into nm;
  elsif p_kind = 'decision' then
    update rm.decision set deleted_at = ts where id = p_id and room_id = r.id returning left(text, 40) into nm;
  else raise exception 'BAD_KIND'; end if;
  if nm is null then raise exception 'NOT_FOUND'; end if;
  perform rm.act(r.id, pr.name, '「' || nm || '」 ' || case when p_flag then '삭제(휴지통으로 이동)' else '복구' end);
  perform rm.bump(r.id);
end $$;

-- 파일: 업로드 전 검사(주소는 Edge Function 이 발급) → 업로드 후 등록
create or replace function rm.kind_of(p_name text) returns text
language sql immutable set search_path = public as $$
  select case
    when lower(substring(p_name from '\.([A-Za-z0-9]{1,5})$')) in ('png','jpg','jpeg','gif','webp') then 'img'
    when lower(substring(p_name from '\.([A-Za-z0-9]{1,5})$')) = 'pdf' then 'pdf'
    when lower(substring(p_name from '\.([A-Za-z0-9]{1,5})$')) in ('doc','docx','xls','xlsx','ppt','pptx','hwp','hwpx','txt','csv') then 'doc'
    else null end;
$$;

create or replace function public.rm_file_prepare(p_room text, p_ptok text, p_name text, p_size bigint, p_mime text) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person; k text; ext text;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  if not r.upload_on then raise exception 'UPLOAD_OFF'; end if;
  k := rm.kind_of(coalesce(p_name, ''));
  if k is null then raise exception 'BAD_TYPE'; end if;
  if p_size is null or p_size <= 0 or p_size > r.max_mb::bigint * 1048576 then raise exception 'TOO_BIG'; end if;
  if k = 'img' and not (coalesce(p_mime, '') like 'image/%') then raise exception 'BAD_TYPE'; end if;
  if k = 'pdf' and coalesce(p_mime, '') <> 'application/pdf' then raise exception 'BAD_TYPE'; end if;
  if (select count(*) from rm.file where room_id = r.id) >= 300 then raise exception 'TOO_MANY'; end if;
  ext := lower(substring(p_name from '\.([A-Za-z0-9]{1,5})$'));
  return jsonb_build_object('path', r.id::text || '/' || gen_random_uuid()::text || '.' || ext, 'kind', k);
end $$;

create or replace function public.rm_file_commit(p_room text, p_ptok text, p_path text, p_task uuid, p_name text, p_mime text) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person; k text; sz bigint; f rm.file;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  if left(coalesce(p_path, ''), 37) <> r.id::text || '/' then raise exception 'BAD_PATH'; end if;
  k := rm.kind_of(coalesce(p_name, ''));
  if k is null or k is distinct from rm.kind_of(p_path) then raise exception 'BAD_TYPE'; end if;
  select (metadata->>'size')::bigint into sz from storage.objects where bucket_id = 'room-files' and name = p_path;
  if sz is null then raise exception 'NO_OBJECT'; end if;
  if sz > r.max_mb::bigint * 1048576 then raise exception 'TOO_BIG'; end if;
  if p_task is not null and not exists (select 1 from rm.task where id = p_task and room_id = r.id) then raise exception 'NOT_FOUND'; end if;
  insert into rm.file(room_id, task_id, name, path, size, mime, kind, by_name)
  values (r.id, p_task, left(trim(p_name), 120), p_path, sz, left(coalesce(p_mime, ''), 100), k, pr.name) returning * into f;
  perform rm.act(r.id, pr.name, '파일 「' || f.name || '」을(를) 올렸습니다.');
  perform rm.bump(r.id);
  return jsonb_build_object('id', f.id);
end $$;

create or replace function public.rm_file_paths(p_room text, p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room;
begin
  r := rm.room_of(p_room);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'path', path, 'name', name))
                     from rm.file where room_id = r.id and deleted_at is null and id = any(p_ids)), '[]'::jsonb);
end $$;

-- 결정 로그: 한 줄 기록, 수정하면 이전 문구를 이력에 남깁니다.
create or replace function public.rm_decision_save(p_room text, p_ptok text, p_id uuid, p_text text, p_org text) returns void
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person; tx text := trim(coalesce(p_text, '')); d rm.decision;
begin
  r := rm.room_of(p_room);
  if r.mode <> 'rw' then raise exception 'READONLY'; end if;
  pr := rm.person_of(r, p_ptok);
  if length(tx) not between 1 and 300 then raise exception 'BAD_TEXT'; end if;
  if p_id is null then
    if (select count(*) from rm.decision where room_id = r.id) >= 200 then raise exception 'TOO_MANY'; end if;
    insert into rm.decision(room_id, text, org, by_name) values (r.id, tx, left(coalesce(p_org, ''), 10), pr.name);
    perform rm.act(r.id, pr.name, '결정을 기록했습니다: ' || left(tx, 40));
  else
    select * into d from rm.decision where id = p_id and room_id = r.id and deleted_at is null for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    update rm.decision set text = tx, org = left(coalesce(p_org, ''), 10),
           hist = hist || jsonb_build_array(jsonb_build_object('t', d.text, 'by', pr.name, 'at', now()))
     where id = d.id;
    perform rm.act(r.id, pr.name, '결정 기록을 수정했습니다: ' || left(tx, 40));
  end if;
  perform rm.bump(r.id);
end $$;

create or replace function public.rm_notice_read(p_room text, p_ptok text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = rm, extensions, public as $$
declare r rm.room; pr rm.person;
begin
  r := rm.room_of(p_room);
  pr := rm.person_of(r, p_ptok);
  update rm.notice set read = true where person_id = pr.id and (p_ids is null or id = any(p_ids));
  perform rm.bump(r.id);
end $$;

-- ============================================================================
-- 관리자·개설자 RPC (task-auth 로 로그인한 Google 계정의 세션 토큰 p_tsk 사용)
-- ============================================================================
create or replace function public.rm_admin_list(p_tsk text) returns jsonb
language plpgsql security definer set search_path = rm, tsk, extensions, public as $$
declare m tsk.member;
begin
  m := rm.admin(p_tsk);
  return jsonb_build_object(
    'me', jsonb_build_object('email', m.email, 'name', m.name, 'admin', m.role = 'admin'),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'token', r.token, 'name', r.name, 'mode', r.mode, 'owner', r.owner, 'info', r.info,
                'stages', r.stages, 'orgs', r.orgs, 'tracks', r.tracks, 'upload_on', r.upload_on, 'max_mb', r.max_mb, 'updated', r.updated_at,
                'tasks', (select count(*) from rm.task t where t.room_id = r.id and t.deleted_at is null),
                'files', (select count(*) from rm.file f where f.room_id = r.id and f.deleted_at is null),
                'persons', (select count(*) from rm.person p where p.room_id = r.id),
                'trash', (select count(*) from rm.task t where t.room_id = r.id and t.deleted_at is not null) + (select count(*) from rm.file f where f.room_id = r.id and f.deleted_at is not null)) order by r.created_at desc)
              from rm.room r where m.role = 'admin' or r.owner = m.email), '[]'::jsonb),
    'creators', case when m.role = 'admin' then coalesce((select jsonb_agg(email order by email) from rm.creator), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.rm_admin_create(p_tsk text, p jsonb) returns jsonb
language plpgsql security definer set search_path = rm, tsk, extensions, public as $$
declare m tsk.member; r rm.room; nm text := trim(coalesce(p->>'name', ''));
begin
  m := rm.admin(p_tsk);
  if length(nm) not between 1 and 80 then raise exception 'BAD_NAME'; end if;
  insert into rm.room(token, name, owner, info)
  values (left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40), nm, m.email, coalesce(p->'info', '{}'::jsonb))
  returning * into r;
  perform rm.act(r.id, m.name, '업무방을 만들었습니다.');
  return jsonb_build_object('id', r.id, 'token', r.token);
end $$;

create or replace function public.rm_admin_save(p_tsk text, p jsonb) returns void
language plpgsql security definer set search_path = rm, tsk, extensions, public as $$
declare m tsk.member; r rm.room; x jsonb; md text := p->>'mode'; mb int := coalesce((p->>'max_mb')::int, 20);
begin
  m := rm.admin(p_tsk);
  select * into r from rm.room where id = (p->>'id')::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
  if m.role <> 'admin' and r.owner is distinct from m.email then raise exception 'FORBIDDEN'; end if;
  if md not in ('rw','ro','locked') then raise exception 'BAD_MODE'; end if;
  if length(trim(coalesce(p->>'name', ''))) not between 1 and 80 then raise exception 'BAD_NAME'; end if;
  if mb not between 1 and 20 then raise exception 'BAD_SIZE'; end if;
  if jsonb_typeof(p->'stages') <> 'array' or jsonb_array_length(p->'stages') not between 3 and 6 then raise exception 'BAD_STAGES'; end if;
  for x in select * from jsonb_array_elements(p->'stages') loop
    if jsonb_typeof(x) <> 'string' or length(x #>> '{}') not between 1 and 12 then raise exception 'BAD_STAGES'; end if;
  end loop;
  if jsonb_array_length(p->'stages') < (select coalesce(max(stage), 0) + 1 from rm.task where room_id = r.id) then raise exception 'STAGES_IN_USE'; end if;
  if jsonb_typeof(p->'tracks') <> 'array' or jsonb_array_length(p->'tracks') > 12 then raise exception 'BAD_TRACKS'; end if;
  for x in select * from jsonb_array_elements(p->'tracks') loop
    if jsonb_typeof(x) <> 'string' or length(x #>> '{}') not between 1 and 20 then raise exception 'BAD_TRACKS'; end if;
  end loop;
  if jsonb_typeof(p->'orgs') <> 'array' or jsonb_array_length(p->'orgs') not between 1 and 8 then raise exception 'BAD_ORGS'; end if;
  for x in select * from jsonb_array_elements(p->'orgs') loop
    if not (coalesce(x->>'k', '') ~ '^[a-z]{1,6}$') or length(coalesce(x->>'n', '')) not between 1 and 10 or not (coalesce(x->>'c', '') ~ '^#[0-9A-Fa-f]{6}$') then raise exception 'BAD_ORGS'; end if;
  end loop;
  update rm.room set name = trim(p->>'name'), mode = md, stages = p->'stages', tracks = p->'tracks', orgs = p->'orgs',
         info = coalesce(p->'info', '{}'::jsonb), upload_on = coalesce((p->>'upload_on')::boolean, true), max_mb = mb, rev = rev + 1, updated_at = now()
   where id = r.id;
end $$;

-- 링크 재발급: 기존 링크는 즉시 쓸 수 없게 됩니다.
create or replace function public.rm_admin_rotate(p_tsk text, p_id uuid) returns text
language plpgsql security definer set search_path = rm, tsk, extensions, public as $$
declare m tsk.member; r rm.room; tk text := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40);
begin
  m := rm.admin(p_tsk);
  select * into r from rm.room where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if m.role <> 'admin' and r.owner is distinct from m.email then raise exception 'FORBIDDEN'; end if;
  update rm.room set token = tk, rev = rev + 1, updated_at = now() where id = r.id;
  perform rm.act(r.id, m.name, '링크를 재발급했습니다.');
  return tk;
end $$;

-- 휴지통 정리: 지정 일수가 지난 삭제 항목을 영구 삭제하고, 저장소에서 지울 파일 경로를 돌려줍니다.
create or replace function public.rm_admin_purge(p_tsk text, p_id uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = rm, tsk, extensions, public as $$
declare m tsk.member; r rm.room; paths text[];
begin
  m := rm.admin(p_tsk);
  select * into r from rm.room where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if m.role <> 'admin' and r.owner is distinct from m.email then raise exception 'FORBIDDEN'; end if;
  if p_days not between 0 and 365 then raise exception 'BAD_DAYS'; end if;
  paths := rm.purge_rows(r.id, p_days);
  perform rm.bump(r.id);
  return jsonb_build_object('paths', to_jsonb(paths));
end $$;

create or replace function public.rm_admin_creator(p_tsk text, p_email text, p_flag boolean) returns void
language plpgsql security definer set search_path = rm, tsk, extensions, public as $$
declare m tsk.member; e text := lower(trim(coalesce(p_email, '')));
begin
  m := rm.admin(p_tsk);
  if m.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if not (e ~ '^[^@ ]+@[^@ ]+[.][^@ ]+$') then raise exception 'BAD_EMAIL'; end if;
  if p_flag then insert into rm.creator(email) values (e) on conflict do nothing;
  else perform rm.drop_creator(e); end if;
end $$;

create or replace function rm.drop_creator(p_email text) returns void
language sql security definer set search_path = rm, public as $$
  delete from rm.creator where email = p_email;
$$;

-- ---------------------------------------------------------------- 권한 정리
revoke all on all functions in schema rm from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'rm\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;

-- 파일 저장소(비공개). 로컬 시험 환경처럼 storage 스키마가 없으면 건너뜁니다.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit) values ('room-files', 'room-files', false, 20971520) on conflict (id) do nothing;
  end if;
end $$;
