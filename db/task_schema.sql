-- ============================================================================
-- 업무진행 평가툴(task.html) 스키마
--  * 테이블/내부 함수는 외부에 노출되지 않는 tsk 스키마에 둡니다. (award·budget·wbd 와 동일한 보안 구조)
--  * 브라우저(anon 키)는 public.tsk_* RPC(SECURITY DEFINER)로만 접근하며, 모든 RPC는 로그인 토큰을 서버에서 검사합니다.
--  * 로그인: Google 계정 → Edge Function task-auth 가 Google ID 토큰을 검증 → tsk_login(service_role 전용) 이 세션 발급.
--    비밀번호는 어디에도 저장하지 않습니다. 관리자(bangdw@gmail.com)는 첫 Google 로그인 때 자동 등록됩니다.
--  * 그 밖의 계정은 첫 로그인 시 「승인 대기」로 등록되고, 관리자가 승인해야 사용할 수 있습니다.
--  * 여러 번 실행해도 안전합니다(idempotent).
-- ============================================================================

create schema if not exists tsk;
revoke all on schema tsk from public, anon, authenticated;

-- ---------------------------------------------------------------- 구성원·세션
create table if not exists tsk.member (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null default '' check (length(name) <= 40),
  dept text not null default '' check (length(dept) <= 40),
  role text not null default 'member' check (role in ('admin','manager','member','viewer')),
  status text not null default 'pending' check (status in ('active','pending','disabled')),
  created_at timestamptz not null default now(),
  last_login timestamptz
);

create table if not exists tsk.session (
  token_hash text primary key,
  email text not null references tsk.member(email) on update cascade on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 설정(단계 이름·평가 양식·알림 기준)
create table if not exists tsk.setting (
  id int primary key default 1 check (id = 1),
  stages jsonb not null,
  eval_form jsonb not null,
  remind_days int not null default 3 check (remind_days between 0 and 30)
);
insert into tsk.setting(id, stages, eval_form, remind_days) values (
  1,
  '{"공통":["준비","모집","개강","운영","종강","종료(사후 검토)"],
    "과정":["준비","모집","개강","운영","종강","종료(사후 검토)"],
    "행사":["기획","준비","홍보·모집","운영","정산","종료(사후 검토)"],
    "TF":["구성","착수","운영","결과 정리","보고","종료(사후 검토)"],
    "일반":["준비","착수","진행","점검","마무리","종료(사후 검토)"]}'::jsonb,
  '[{"key":"goal","label":"목표 달성도"},{"key":"time","label":"일정 준수"},{"key":"budget","label":"예산 관리"},{"key":"team","label":"협업·소통"},{"key":"sat","label":"참여자 만족"}]'::jsonb,
  3
) on conflict do nothing;

-- ---------------------------------------------------------------- 업무
create table if not exists tsk.task (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('행사','과정','TF','일반')),
  title text not null check (length(title) between 1 and 120),
  dept text not null default '' check (length(dept) <= 40),
  owner text references tsk.member(email) on update cascade on delete set null,
  stage int not null default 0 check (stage between 0 and 5),
  start_date date,
  due_date date,
  note text not null default '' check (length(note) <= 4000),
  links jsonb not null default '[]'::jsonb,
  retro text not null default '' check (length(retro) <= 4000),
  archived boolean not null default false,
  ver int not null default 1,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or due_date is null or start_date <= due_date)
);
create index if not exists task_dept_idx on tsk.task(dept);
create index if not exists task_owner_idx on tsk.task(owner);

create table if not exists tsk.part (
  task_id uuid not null references tsk.task(id) on delete cascade,
  email text not null references tsk.member(email) on update cascade on delete cascade,
  primary key (task_id, email)
);

create table if not exists tsk.item (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tsk.task(id) on delete cascade,
  stage int not null default 0 check (stage between 0 and 5),
  text text not null check (length(text) between 1 and 200),
  assignee text references tsk.member(email) on update cascade on delete set null,
  due date,
  done boolean not null default false,
  done_at timestamptz,
  done_by text,
  pos int not null default 0
);
create index if not exists item_task_idx on tsk.item(task_id);
create index if not exists item_asg_idx on tsk.item(assignee);

-- 대상자(교육생·위원 등): 개인정보이므로 업무 담당·관리자에게만 보입니다.
create table if not exists tsk.target (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tsk.task(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  org text not null default '' check (length(org) <= 60),
  contact text not null default '' check (length(contact) <= 80),
  score numeric check (score is null or (score >= 0 and score <= 1000)),
  status text not null default '대기' check (status in ('대기','선정','예비','탈락')),
  note text not null default '' check (length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists target_task_idx on tsk.target(task_id);

create table if not exists tsk.evaluation (
  task_id uuid primary key references tsk.task(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  comment text not null default '' check (length(comment) <= 3000),
  improvements text not null default '' check (length(improvements) <= 3000),
  evaluator text,
  updated_at timestamptz not null default now()
);

create table if not exists tsk.history (
  id bigserial primary key,
  task_id uuid not null references tsk.task(id) on delete cascade,
  at timestamptz not null default now(),
  by_email text,
  msg text not null
);
create index if not exists history_task_idx on tsk.history(task_id, id desc);

create table if not exists tsk.notice (
  id uuid primary key default gen_random_uuid(),
  email text not null references tsk.member(email) on update cascade on delete cascade,
  task_id uuid references tsk.task(id) on delete cascade,
  msg text not null,
  read boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists notice_email_idx on tsk.notice(email, at desc);

create table if not exists tsk.template (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('행사','과정','TF','일반')),
  name text not null check (length(name) between 1 and 60),
  items jsonb not null default '[]'::jsonb
);

create table if not exists tsk.mail_log (
  id bigserial primary key,
  task_id uuid references tsk.task(id) on delete set null,
  by_email text,
  subject text,
  n int,
  at timestamptz not null default now()
);

-- 모든 테이블 RLS 켜기(정책 없음 = 직접 접근 불가, 함수만 통과)
do $$ declare t text; begin
  foreach t in array array['member','session','setting','task','part','item','target','evaluation','history','notice','template','mail_log'] loop
    execute format('alter table tsk.%I enable row level security', t);
    execute format('revoke all on tsk.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- 기본 템플릿(없을 때만)
insert into tsk.template(kind, name, items)
select * from (values
 ('과정','일반 교육과정 운영', '[{"s":0,"t":"운영 계획 기안"},{"s":0,"t":"강사·강의실 확정"},{"s":1,"t":"모집 공고 게시"},{"s":1,"t":"접수 현황 점검"},{"s":1,"t":"대상자 선정·안내"},{"s":2,"t":"개강 안내 발송"},{"s":2,"t":"교재·출석부 준비"},{"s":3,"t":"출석·진도 점검"},{"s":3,"t":"중간 점검"},{"s":4,"t":"성적·수료 처리"},{"s":4,"t":"만족도 설문"},{"s":5,"t":"결과 보고"},{"s":5,"t":"개선과제 정리"}]'::jsonb),
 ('행사','학교 행사 운영', '[{"s":0,"t":"행사 계획 기안"},{"s":1,"t":"장소 대관 확정"},{"s":1,"t":"예산 확보"},{"s":2,"t":"홍보물 제작·배포"},{"s":2,"t":"참가자 모집"},{"s":3,"t":"현장 인력 배치"},{"s":3,"t":"행사 당일 점검"},{"s":4,"t":"예산 정산"},{"s":5,"t":"결과 보고"},{"s":5,"t":"회고 회의"}]'::jsonb),
 ('TF','TF 운영', '[{"s":0,"t":"위원 위촉"},{"s":1,"t":"킥오프 회의"},{"s":2,"t":"정기 회의 운영"},{"s":2,"t":"자료 수합·검토"},{"s":3,"t":"결과 초안 작성"},{"s":4,"t":"최종 보고서 제출"},{"s":5,"t":"성과 점검"},{"s":5,"t":"해산 처리"}]'::jsonb)
) v(kind, name, items)
where not exists (select 1 from tsk.template);

-- ============================================================================
-- 내부 함수 (tsk 스키마 — 브라우저에서 직접 호출 불가)
-- ============================================================================

create or replace function tsk.me(p_token text) returns tsk.member
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member;
begin
  select mm.* into m from tsk.session s join tsk.member mm on mm.email = s.email
   where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and s.expires_at > now() and mm.status = 'active';
  if not found then raise exception 'AUTH' using errcode = '28000'; end if;
  return m;
end $$;

create or replace function tsk.is_part(p_task uuid, p_email text) returns boolean
language sql stable security definer set search_path = tsk, public as $$
  select exists (select 1 from tsk.part where task_id = p_task and email = p_email)
      or exists (select 1 from tsk.item where task_id = p_task and assignee = p_email);
$$;

-- 상세 열람: 관리자 · 같은 부서 · 담당 · 참여자
create or replace function tsk.can_see(t tsk.task, m tsk.member) returns boolean
language sql stable security definer set search_path = tsk, public as $$
  select m.role = 'admin' or (m.dept <> '' and t.dept = m.dept) or t.owner = m.email or tsk.is_part(t.id, m.email);
$$;

-- 업무 정보 수정·단계 이동·삭제: 관리자 · 같은 부서 부서장 · 담당자 본인(열람 전용 제외)
create or replace function tsk.can_edit(t tsk.task, m tsk.member) returns boolean
language sql stable security definer set search_path = tsk, public as $$
  select case m.role
    when 'admin' then true
    when 'manager' then (m.dept <> '' and t.dept = m.dept) or t.owner = m.email
    when 'member' then t.owner = m.email
    else false end;
$$;

-- 체크리스트 체크·대상자 관리: 수정 권한자 + 참여자
create or replace function tsk.can_work(t tsk.task, m tsk.member) returns boolean
language sql stable security definer set search_path = tsk, public as $$
  select tsk.can_edit(t, m) or (m.role <> 'viewer' and tsk.is_part(t.id, m.email));
$$;

-- 평가 입력: 관리자 · 같은 부서 부서장
create or replace function tsk.can_eval(t tsk.task, m tsk.member) returns boolean
language sql stable security definer set search_path = tsk, public as $$
  select m.role = 'admin' or (m.role = 'manager' and m.dept <> '' and t.dept = m.dept);
$$;

-- 평가 열람: 평가 권한자 + 담당자 본인
create or replace function tsk.can_see_eval(t tsk.task, m tsk.member) returns boolean
language sql stable security definer set search_path = tsk, public as $$
  select tsk.can_eval(t, m) or t.owner = m.email;
$$;

create or replace function tsk.log(p_task uuid, p_by text, p_msg text) returns void
language sql security definer set search_path = tsk, public as $$
  insert into tsk.history(task_id, by_email, msg) values (p_task, p_by, left(p_msg, 300));
$$;

create or replace function tsk.notify(p_to text, p_by text, p_task uuid, p_msg text) returns void
language sql security definer set search_path = tsk, public as $$
  insert into tsk.notice(email, task_id, msg)
  select p_to, p_task, left(p_msg, 200)
   where p_to is not null and p_to is distinct from p_by
     and exists (select 1 from tsk.member where email = p_to and status = 'active');
$$;

create or replace function tsk.prog(t tsk.task) returns int
language sql stable security definer set search_path = tsk, public as $$
  select case when c.total > 0 then round(100.0 * c.done / c.total)::int else round(100.0 * t.stage / 5)::int end
    from (select count(*) total, count(*) filter (where done) done from tsk.item where task_id = t.id) c;
$$;

-- 목록용(가벼운) JSON. 열람 권한이 없으면 제목·진행률 등 기본 정보만.
create or replace function tsk.tlist(t tsk.task, m tsk.member) returns jsonb
language plpgsql stable security definer set search_path = tsk, public as $$
declare tot int; dn int; ev numeric; oname text;
begin
  select count(*), count(*) filter (where done) into tot, dn from tsk.item where task_id = t.id;
  select name into oname from tsk.member where email = t.owner;
  if tsk.can_see_eval(t, m) then
    select round(avg((v.value)::numeric), 1) into ev
      from tsk.evaluation e, jsonb_each_text(e.scores) v(key, value) where e.task_id = t.id and v.value ~ '^[0-9.]+$';
  end if;
  return jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'dept', t.dept, 'owner', t.owner, 'owner_name', coalesce(oname, ''),
    'stage', t.stage, 'start', t.start_date, 'due', t.due_date,
    'progress', case when tot > 0 then round(100.0 * dn / tot)::int else round(100.0 * t.stage / 5)::int end,
    'total', tot, 'done', dn, 'archived', t.archived, 'ver', t.ver,
    'full', tsk.can_see(t, m), 'edit', tsk.can_edit(t, m), 'ev', ev);
end $$;

create or replace function tsk.new_session(p_email text) returns text
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare tok text;
begin
  delete from tsk.session where expires_at < now();
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into tsk.session(token_hash, email, expires_at)
  values (encode(extensions.digest(tok, 'sha256'), 'hex'), p_email, now() + interval '12 hours');
  return tok;
end $$;

create or replace function tsk.ensure_member(e text, p_name text) returns tsk.member
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member;
begin
  select * into m from tsk.member where email = e;
  if found then return m; end if;
  if e = 'bangdw@gmail.com' then
    insert into tsk.member(email, name, dept, role, status) values (e, left(coalesce(p_name, ''), 40), '기획처', 'admin', 'active') returning * into m;
  else
    if (select count(*) from tsk.member where status = 'pending') >= 200 then raise exception 'PENDING_FULL'; end if;
    insert into tsk.member(email, name, status) values (e, left(coalesce(p_name, ''), 40), 'pending') returning * into m;
  end if;
  return m;
end $$;

-- DELETE 문은 단순 SQL 함수로 분리(운영 DB 적용 도구가 긴 plpgsql 안의 DELETE 에서 시간 초과가 나는 경우가 있어 분리함)
create or replace function tsk.drop_task(p_id uuid) returns void
language sql security definer set search_path = tsk, public as $$
  delete from tsk.task where id = p_id;
$$;
create or replace function tsk.drop_item(p_id uuid) returns void
language sql security definer set search_path = tsk, public as $$
  delete from tsk.item where id = p_id;
$$;
create or replace function tsk.drop_target(p_task uuid, p_id uuid) returns void
language sql security definer set search_path = tsk, public as $$
  delete from tsk.target where id = p_id and task_id = p_task;
$$;
create or replace function tsk.drop_template(p_id uuid) returns void
language sql security definer set search_path = tsk, public as $$
  delete from tsk.template where id = p_id;
$$;
create or replace function tsk.drop_sessions(p_email text) returns void
language sql security definer set search_path = tsk, public as $$
  delete from tsk.session where email = p_email;
$$;
create or replace function tsk.clear_parts(p_task uuid) returns void
language sql security definer set search_path = tsk, public as $$
  delete from tsk.part where task_id = p_task;
$$;

create or replace function tsk.check_links(lk jsonb) returns jsonb
language plpgsql security definer set search_path = tsk, public as $$
declare l jsonb;
begin
  lk := coalesce(lk, '[]'::jsonb);
  if jsonb_typeof(lk) <> 'array' or jsonb_array_length(lk) > 10 then raise exception 'BAD_LINKS'; end if;
  for l in select * from jsonb_array_elements(lk) loop
    if not (coalesce(l->>'url', '') ~ '^https://[^[:space:]]+$') or length(l->>'url') > 500 or length(coalesce(l->>'name', '')) > 60 then raise exception 'BAD_LINKS'; end if;
  end loop;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', left(coalesce(x->>'name', ''), 60), 'url', x->>'url')), '[]') from jsonb_array_elements(lk) x);
end $$;

create or replace function tsk.set_parts(p_task uuid, p_by text, p_title text, p_list jsonb, p_notify boolean) returns void
language plpgsql security definer set search_path = tsk, public as $$
declare pe text;
begin
  if jsonb_typeof(p_list) <> 'array' then return; end if;
  perform tsk.clear_parts(p_task);
  for pe in select lower(x) from jsonb_array_elements_text(p_list) x loop
    insert into tsk.part(task_id, email)
    select p_task, pe where exists (select 1 from tsk.member where email = pe and status = 'active') on conflict do nothing;
    if p_notify then perform tsk.notify(pe, p_by, p_task, '「' || p_title || '」 업무의 참여자로 지정되었습니다.'); end if;
  end loop;
end $$;

-- ============================================================================
-- 공개 RPC (브라우저에서 호출). 첫 인자는 항상 로그인 토큰.
-- ============================================================================

-- 로그인: Edge Function(task-auth)만 호출합니다. Google 검증은 그쪽에서 끝난 상태입니다.
create or replace function public.tsk_login(p_email text, p_name text) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare e text := lower(trim(coalesce(p_email, ''))); m tsk.member;
begin
  m := tsk.ensure_member(e, p_name);
  if m.status <> 'active' then
    return jsonb_build_object('status', m.status);
  end if;
  update tsk.member set last_login = now(), name = case when name = '' then left(coalesce(p_name, ''), 40) else name end where email = e;
  return jsonb_build_object('status', 'active', 'token', tsk.new_session(e), 'expires_in', 43200);
end $$;

create or replace function public.tsk_logout(p_token text) returns void
language sql security definer set search_path = tsk, extensions, public as $$
  delete from tsk.session where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- 첫 화면에 필요한 모든 것을 한 번에
create or replace function public.tsk_boot(p_token text) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; s tsk.setting; res jsonb;
begin
  m := tsk.me(p_token);
  select * into s from tsk.setting where id = 1;
  select jsonb_build_object(
    'me', jsonb_build_object('email', m.email, 'name', m.name, 'dept', m.dept, 'role', m.role),
    'cfg', jsonb_build_object('stages', s.stages, 'eval_form', s.eval_form, 'remind_days', s.remind_days),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name, 'n', jsonb_array_length(items)) order by kind, name) from tsk.template), '[]'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('email', email, 'name', name, 'dept', dept, 'role', role, 'status', status) order by status, dept, name)
                           from tsk.member where status = 'active' or m.role = 'admin'), '[]'),
    'tasks', coalesce((select jsonb_agg(tsk.tlist(t, m) order by t.due_date nulls last, t.created_at) from (select * from tsk.task order by created_at desc limit 1500) t), '[]'),
    'my_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'task_id', i.task_id, 'title', t.title, 'text', i.text, 'due', i.due, 'done', i.done) order by i.due nulls last)
                           from tsk.item i join tsk.task t on t.id = i.task_id where i.assignee = m.email and not i.done and not t.archived), '[]'),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'task_id', task_id, 'msg', msg, 'read', read, 'at', at) order by at desc)
                           from (select * from tsk.notice where email = m.email order by at desc limit 60) n), '[]')
  ) into res;
  return res;
end $$;

-- 업무 상세
create or replace function public.tsk_task_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; res jsonb; seeall boolean;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  res := tsk.tlist(t, m);
  if not tsk.can_see(t, m) then return jsonb_build_object('task', res); end if;
  seeall := tsk.can_work(t, m);
  return jsonb_build_object(
    'task', res || jsonb_build_object('note', t.note, 'links', t.links, 'retro', t.retro, 'created_by', t.created_by),
    'parts', coalesce((select jsonb_agg(email) from tsk.part where task_id = t.id), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'stage', stage, 'text', text, 'assignee', assignee, 'due', due, 'done', done, 'done_at', done_at) order by stage, pos, text)
                        from tsk.item where task_id = t.id), '[]'),
    'targets', case when seeall then coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'org', org, 'contact', contact, 'score', score, 'status', status, 'note', note) order by score desc nulls last, created_at)
                        from tsk.target where task_id = t.id), '[]') else null end,
    'eval', case when tsk.can_see_eval(t, m) then (select to_jsonb(e) - 'task_id' from tsk.evaluation e where e.task_id = t.id) else null end,
    'can_eval', tsk.can_eval(t, m),
    'can_work', seeall,
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'by', by_email, 'msg', msg) order by id desc)
                           from (select * from tsk.history where task_id = t.id order by id desc limit 60) h), '[]'));
end $$;

-- 업무 만들기·수정 (p.id 없으면 생성). 충돌 방지를 위해 수정 시 ver 필요.
create or replace function public.tsk_task_save(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; v_id uuid := nullif(p->>'id', '')::uuid; k text; ttl text; dp text; ow text;
        sd date; dd date; lk jsonb; created boolean := false; old_owner text;
begin
  m := tsk.me(p_token);
  if m.role = 'viewer' then raise exception 'FORBIDDEN'; end if;
  k := p->>'kind'; ttl := trim(coalesce(p->>'title', ''));
  if k not in ('행사','과정','TF','일반') then raise exception 'BAD_KIND'; end if;
  if length(ttl) not between 1 and 120 then raise exception 'BAD_TITLE'; end if;
  sd := nullif(p->>'start_date', '')::date; dd := nullif(p->>'due_date', '')::date;
  if sd is not null and dd is not null and sd > dd then raise exception 'BAD_DATES'; end if;
  lk := tsk.check_links(p->'links');

  if v_id is null then
    ow := coalesce(nullif(lower(p->>'owner'), ''), m.email);
    dp := case when m.role = 'admin' then coalesce(p->>'dept', m.dept) else m.dept end;
    if m.role = 'member' and ow <> m.email then raise exception 'FORBIDDEN'; end if;
    if not exists (select 1 from tsk.member where email = ow and status = 'active') then raise exception 'BAD_OWNER'; end if;
    insert into tsk.task(kind, title, dept, owner, stage, start_date, due_date, note, links, created_by)
    values (k, ttl, left(dp, 40), ow, coalesce((p->>'stage')::int, 0), sd, dd, left(coalesce(p->>'note', ''), 4000), lk, m.email)
    returning * into t;
    created := true;
    perform tsk.log(t.id, m.email, '업무를 만들었습니다.');
  else
    select * into t from tsk.task where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not tsk.can_edit(t, m) then raise exception 'FORBIDDEN'; end if;
    if t.ver <> coalesce((p->>'ver')::int, -1) then raise exception 'CONFLICT'; end if;
    old_owner := t.owner;
    ow := coalesce(nullif(lower(p->>'owner'), ''), t.owner);
    dp := case when m.role = 'admin' then coalesce(p->>'dept', t.dept) else t.dept end;
    if m.role = 'member' and ow <> t.owner then raise exception 'FORBIDDEN'; end if;
    if not exists (select 1 from tsk.member where email = ow and status = 'active') then raise exception 'BAD_OWNER'; end if;
    update tsk.task set kind = k, title = ttl, dept = left(dp, 40), owner = ow, start_date = sd, due_date = dd,
           note = left(coalesce(p->>'note', ''), 4000), links = lk, ver = ver + 1, updated_at = now()
     where id = t.id returning * into t;
    perform tsk.log(t.id, m.email, '업무 정보를 수정했습니다.');
    if ow is distinct from old_owner then
      perform tsk.log(t.id, m.email, '담당자를 변경했습니다.');
      perform tsk.notify(ow, m.email, t.id, '「' || t.title || '」 업무의 담당자로 지정되었습니다.');
    end if;
  end if;

  if p ? 'participants' then perform tsk.set_parts(t.id, m.email, t.title, p->'participants', created); end if;
  if created then perform tsk.notify(t.owner, m.email, t.id, '「' || t.title || '」 업무의 담당자로 지정되었습니다.'); end if;
  return tsk.tlist(t, m);
end $$;

-- 단계 이동
create or replace function public.tsk_task_stage(p_token text, p_id uuid, p_stage int, p_ver int) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; nm text; r text;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_edit(t, m) then raise exception 'FORBIDDEN'; end if;
  if p_stage not between 0 and 5 then raise exception 'BAD_STAGE'; end if;
  if t.ver <> p_ver then raise exception 'CONFLICT'; end if;
  if p_stage = t.stage then return tsk.tlist(t, m); end if;
  update tsk.task set stage = p_stage, ver = ver + 1, updated_at = now() where id = t.id returning * into t;
  nm := coalesce((select stages->t.kind->>p_stage from tsk.setting where id = 1), p_stage::text);
  perform tsk.log(t.id, m.email, '단계를 「' || nm || '」(으)로 옮겼습니다.');
  for r in select email from tsk.part where task_id = t.id loop
    perform tsk.notify(r, m.email, t.id, '「' || t.title || '」 업무가 「' || nm || '」 단계로 이동했습니다.');
  end loop;
  perform tsk.notify(t.owner, m.email, t.id, '「' || t.title || '」 업무가 「' || nm || '」 단계로 이동했습니다.');
  return tsk.tlist(t, m);
end $$;

create or replace function public.tsk_task_archive(p_token text, p_id uuid, p_flag boolean) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_edit(t, m) then raise exception 'FORBIDDEN'; end if;
  update tsk.task set archived = p_flag, ver = ver + 1, updated_at = now() where id = t.id;
  perform tsk.log(t.id, m.email, case when p_flag then '보관 처리했습니다.' else '보관을 해제했습니다.' end);
end $$;

-- 완전 삭제는 관리자만
create or replace function public.tsk_task_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member;
begin
  m := tsk.me(p_token);
  if m.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
  perform tsk.drop_task(p_id);
end $$;

-- 템플릿으로 업무 만들기
create or replace function public.tsk_task_from_tpl(p_token text, p_tpl uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare tp tsk.template; r jsonb; x jsonb; pos int := 0; m tsk.member;
begin
  m := tsk.me(p_token);
  select * into tp from tsk.template where id = p_tpl;
  if not found then raise exception 'NOT_FOUND'; end if;
  r := public.tsk_task_save(p_token, p || jsonb_build_object('kind', tp.kind, 'id', null));
  for x in select * from jsonb_array_elements(tp.items) loop
    pos := pos + 1;
    insert into tsk.item(task_id, stage, text, pos)
    values ((r->>'id')::uuid, least(greatest(coalesce((x->>'s')::int, 0), 0), 5), left(coalesce(x->>'t', ''), 200), pos);
  end loop;
  perform tsk.log((r->>'id')::uuid, m.email, '템플릿 「' || tp.name || '」(으)로 체크리스트를 만들었습니다.');
  select tsk.tlist(t, m) into r from tsk.task t where t.id = (r->>'id')::uuid;
  return r;
end $$;

-- 엑셀 가져오기(최대 200건). 형식 오류가 있으면 전체를 되돌립니다.
create or replace function public.tsk_import(p_token text, p_rows jsonb) returns int
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare x jsonb; n int := 0;
begin
  perform tsk.me(p_token);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then raise exception 'BAD_ROWS'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    perform public.tsk_task_save(p_token, x - 'id' - 'ver');
    n := n + 1;
  end loop;
  return n;
end $$;

-- 체크리스트
create or replace function public.tsk_item_save(p_token text, p_task uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; i tsk.item; v_id uuid := nullif(p->>'id', '')::uuid; asg text; txt text; dd date; st int;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_edit(t, m) then raise exception 'FORBIDDEN'; end if;
  txt := trim(coalesce(p->>'text', ''));
  if length(txt) not between 1 and 200 then raise exception 'BAD_TEXT'; end if;
  asg := nullif(lower(p->>'assignee'), '');
  if asg is not null and not exists (select 1 from tsk.member where email = asg and status = 'active') then raise exception 'BAD_ASSIGNEE'; end if;
  dd := nullif(p->>'due', '')::date;
  st := coalesce((p->>'stage')::int, t.stage);
  if st not between 0 and 5 then raise exception 'BAD_STAGE'; end if;
  if v_id is null then
    if (select count(*) from tsk.item where task_id = t.id) >= 300 then raise exception 'TOO_MANY'; end if;
    insert into tsk.item(task_id, stage, text, assignee, due, pos)
    values (t.id, st, txt, asg, dd, coalesce((select max(pos) + 1 from tsk.item where task_id = t.id), 1)) returning * into i;
  else
    update tsk.item set stage = st, text = txt, assignee = asg, due = dd where id = v_id and task_id = t.id returning * into i;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  if asg is not null then
    perform tsk.notify(asg, m.email, t.id, '「' || t.title || '」 업무의 항목 「' || txt || '」 담당으로 지정되었습니다.');
  end if;
  update tsk.task set updated_at = now() where id = t.id;
  return jsonb_build_object('id', i.id);
end $$;

create or replace function public.tsk_item_toggle(p_token text, p_id uuid, p_done boolean) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; i tsk.item;
begin
  m := tsk.me(p_token);
  select * into i from tsk.item where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into t from tsk.task where id = i.task_id;
  if not (tsk.can_edit(t, m) or (m.role <> 'viewer' and (i.assignee = m.email or tsk.is_part(t.id, m.email)))) then raise exception 'FORBIDDEN'; end if;
  update tsk.item set done = p_done, done_at = case when p_done then now() end, done_by = case when p_done then m.email end where id = i.id;
  update tsk.task set updated_at = now() where id = t.id;
  perform tsk.log(t.id, m.email, '항목 「' || left(i.text, 60) || '」 ' || case when p_done then '완료' else '완료 취소' end);
  return jsonb_build_object('progress', tsk.prog((select x from tsk.task x where x.id = t.id)));
end $$;

create or replace function public.tsk_item_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; i tsk.item;
begin
  m := tsk.me(p_token);
  select * into i from tsk.item where id = p_id;
  if not found then return; end if;
  select * into t from tsk.task where id = i.task_id;
  if not tsk.can_edit(t, m) then raise exception 'FORBIDDEN'; end if;
  perform tsk.drop_item(i.id);
end $$;

-- 대상자
create or replace function public.tsk_target_save(p_token text, p_task uuid, p jsonb) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; v_id uuid := nullif(p->>'id', '')::uuid; nm text; sc numeric; stt text;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_work(t, m) then raise exception 'FORBIDDEN'; end if;
  nm := trim(coalesce(p->>'name', ''));
  if length(nm) not between 1 and 40 then raise exception 'BAD_NAME'; end if;
  sc := nullif(p->>'score', '')::numeric;
  stt := coalesce(nullif(p->>'status', ''), '대기');
  if stt not in ('대기','선정','예비','탈락') then raise exception 'BAD_STATUS'; end if;
  if v_id is null then
    if (select count(*) from tsk.target where task_id = t.id) >= 500 then raise exception 'TOO_MANY'; end if;
    insert into tsk.target(task_id, name, org, contact, score, status, note)
    values (t.id, nm, left(coalesce(p->>'org', ''), 60), left(coalesce(p->>'contact', ''), 80), sc, stt, left(coalesce(p->>'note', ''), 200));
  else
    update tsk.target set name = nm, org = left(coalesce(p->>'org', ''), 60), contact = left(coalesce(p->>'contact', ''), 80),
           score = sc, status = stt, note = left(coalesce(p->>'note', ''), 200)
     where id = v_id and task_id = t.id;
  end if;
end $$;

create or replace function public.tsk_target_delete(p_token text, p_task uuid, p_id uuid) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_work(t, m) then raise exception 'FORBIDDEN'; end if;
  perform tsk.drop_target(t.id, p_id);
end $$;

-- 명단 일괄 등록(엑셀·붙여넣기). 이름 열 필수.
create or replace function public.tsk_target_import(p_token text, p_task uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; x jsonb; n int := 0;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_work(t, m) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'BAD_ROWS'; end if;
  if (select count(*) from tsk.target where task_id = t.id) + jsonb_array_length(p_rows) > 500 then raise exception 'TOO_MANY'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    perform public.tsk_target_save(p_token, p_task, x - 'id');
    n := n + 1;
  end loop;
  perform tsk.log(t.id, m.email, '대상자 ' || n || '명을 등록했습니다.');
  return n;
end $$;

-- 점수 순으로 상위 N명 선정, 나머지(탈락 제외)는 예비
create or replace function public.tsk_target_pick(p_token text, p_task uuid, p_n int) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_work(t, m) then raise exception 'FORBIDDEN'; end if;
  if p_n not between 0 and 500 then raise exception 'BAD_N'; end if;
  with ranked as (
    select id, row_number() over (order by score desc nulls last, created_at) rn
      from tsk.target where task_id = t.id and status <> '탈락')
  update tsk.target g set status = case when r.rn <= p_n then '선정' else '예비' end
    from ranked r where g.id = r.id;
  perform tsk.log(t.id, m.email, '점수 순위로 상위 ' || p_n || '명을 선정했습니다.');
end $$;

-- 사후 평가(평가 권한자) · 회고(수정 권한자)
create or replace function public.tsk_eval_save(p_token text, p_task uuid, p jsonb) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task; sc jsonb := '{}'::jsonb; f jsonb; v numeric; keys text[];
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_eval(t, m) then raise exception 'FORBIDDEN'; end if;
  select array_agg(e->>'key') into keys from tsk.setting s, jsonb_array_elements(s.eval_form) e where s.id = 1;
  for f in select jsonb_build_object('k', key, 'v', value) from jsonb_each(coalesce(p->'scores', '{}'::jsonb)) loop
    if not ((f->>'k') = any(keys)) then continue; end if;
    v := (f->>'v')::numeric;
    if v not between 1 and 5 then raise exception 'BAD_SCORE'; end if;
    sc := sc || jsonb_build_object(f->>'k', v);
  end loop;
  insert into tsk.evaluation(task_id, scores, comment, improvements, evaluator, updated_at)
  values (t.id, sc, left(coalesce(p->>'comment', ''), 3000), left(coalesce(p->>'improvements', ''), 3000), m.email, now())
  on conflict (task_id) do update set scores = excluded.scores, comment = excluded.comment,
         improvements = excluded.improvements, evaluator = excluded.evaluator, updated_at = now();
  perform tsk.log(t.id, m.email, '사후 평가를 저장했습니다.');
  perform tsk.notify(t.owner, m.email, t.id, '「' || t.title || '」 업무의 사후 평가가 등록되었습니다.');
end $$;

create or replace function public.tsk_retro_save(p_token text, p_task uuid, p_text text) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; t tsk.task;
begin
  m := tsk.me(p_token);
  select * into t from tsk.task where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not tsk.can_edit(t, m) then raise exception 'FORBIDDEN'; end if;
  update tsk.task set retro = left(coalesce(p_text, ''), 4000), updated_at = now() where id = t.id;
  perform tsk.log(t.id, m.email, '회고를 저장했습니다.');
end $$;

-- 알림
create or replace function public.tsk_notice_read(p_token text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member;
begin
  m := tsk.me(p_token);
  update tsk.notice set read = true where email = m.email and (p_ids is null or id = any(p_ids));
end $$;

create or replace function public.tsk_mail_log(p_token text, p_task uuid, p_subject text, p_n int) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member;
begin
  m := tsk.me(p_token);
  if m.role = 'viewer' then raise exception 'FORBIDDEN'; end if;
  insert into tsk.mail_log(task_id, by_email, subject, n)
  values ((select id from tsk.task where id = p_task), m.email, left(coalesce(p_subject, ''), 200), least(greatest(coalesce(p_n, 0), 0), 500));
  if p_task is not null and exists (select 1 from tsk.task where id = p_task) then
    perform tsk.log(p_task, m.email, '메일 ' || coalesce(p_n, 0) || '건을 발송했습니다.');
  end if;
end $$;

-- ---------------------------------------------------------------- 관리자 기능
create or replace function public.tsk_member_save(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; e text := lower(trim(coalesce(p->>'email', ''))); rl text := coalesce(p->>'role', 'member'); st text := coalesce(p->>'status', 'active');
begin
  m := tsk.me(p_token);
  if m.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if rl not in ('admin','manager','member','viewer') or st not in ('active','pending','disabled') then raise exception 'BAD_VALUE'; end if;
  if e = m.email and (rl <> 'admin' or st <> 'active') then raise exception 'SELF_LOCK'; end if;
  if e = 'bangdw@gmail.com' and (rl <> 'admin' or st <> 'active') then raise exception 'SELF_LOCK'; end if;
  insert into tsk.member(email, name, dept, role, status)
  values (e, left(coalesce(p->>'name', ''), 40), left(coalesce(p->>'dept', ''), 40), rl, st)
  on conflict (email) do update set name = excluded.name, dept = excluded.dept, role = excluded.role, status = excluded.status;
  if st <> 'active' then perform tsk.drop_sessions(e); end if;
end $$;

create or replace function public.tsk_cfg_save(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; k text; a jsonb; x jsonb; ef jsonb := p->'eval_form'; rd int := coalesce((p->>'remind_days')::int, 3);
begin
  m := tsk.me(p_token);
  if m.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
  a := p->'stages';
  foreach k in array array['공통','과정','행사','TF','일반'] loop
    if jsonb_typeof(a->k) <> 'array' or jsonb_array_length(a->k) <> 6 then raise exception 'BAD_STAGES'; end if;
    for x in select * from jsonb_array_elements(a->k) loop
      if jsonb_typeof(x) <> 'string' or length(x #>> '{}') not between 1 and 14 then raise exception 'BAD_STAGES'; end if;
    end loop;
  end loop;
  if jsonb_typeof(ef) <> 'array' or jsonb_array_length(ef) not between 1 and 10 then raise exception 'BAD_FORM'; end if;
  for x in select * from jsonb_array_elements(ef) loop
    if not (coalesce(x->>'key', '') ~ '^[a-z][a-z0-9_]{0,15}$') or length(coalesce(x->>'label', '')) not between 1 and 20 then raise exception 'BAD_FORM'; end if;
  end loop;
  if rd not between 0 and 30 then raise exception 'BAD_DAYS'; end if;
  update tsk.setting set stages = a, eval_form = ef, remind_days = rd where id = 1;
end $$;

create or replace function public.tsk_tpl_save(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member; v_id uuid := nullif(p->>'id', '')::uuid; x jsonb;
begin
  m := tsk.me(p_token);
  if m.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if p->>'kind' not in ('행사','과정','TF','일반') or length(trim(coalesce(p->>'name', ''))) not between 1 and 60 then raise exception 'BAD_VALUE'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') > 100 then raise exception 'BAD_ITEMS'; end if;
  for x in select * from jsonb_array_elements(p->'items') loop
    if coalesce((x->>'s')::int, -1) not between 0 and 5 or length(coalesce(x->>'t', '')) not between 1 and 200 then raise exception 'BAD_ITEMS'; end if;
  end loop;
  if v_id is null then
    insert into tsk.template(kind, name, items) values (p->>'kind', trim(p->>'name'), p->'items');
  else
    update tsk.template set kind = p->>'kind', name = trim(p->>'name'), items = p->'items' where id = v_id;
  end if;
end $$;

create or replace function public.tsk_tpl_get(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member;
begin
  m := tsk.me(p_token);
  if m.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
  return (select to_jsonb(t) from tsk.template t where id = p_id);
end $$;

create or replace function public.tsk_tpl_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = tsk, extensions, public as $$
declare m tsk.member;
begin
  m := tsk.me(p_token);
  if m.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
  perform tsk.drop_template(p_id);
end $$;

-- ---------------------------------------------------------------- 권한 정리
revoke all on all functions in schema tsk from public, anon, authenticated;
-- 모든 tsk_* RPC: 기본 PUBLIC 실행권 제거 후 필요한 역할에만 부여
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'tsk\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname = 'tsk_login' then
      execute format('grant execute on function %s to service_role', r.sig);
    else
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    end if;
  end loop;
end $$;
