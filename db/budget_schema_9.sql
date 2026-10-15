-- 부서 예산안 스키마 9/9: 부서 입력판 (올해 집행·내년 계획 건별 입력 → AI 코드 매칭 → 항목·지출에 자동 반영)
-- 선행: budget_schema_1~8.sql. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
--  * bgt.entries      : 부서가 적은 한 줄(올해 집행/수납 · 내년 계획, 세출/세입). 코드(목)는 기존 코드표(bgt.codes)에서만 고릅니다.
--  * bgt.entry_hist   : 수정·삭제·코드 변경 이력 (수정·삭제 불가)
--  * bgt.entry_presence: 같은 부서에서 지금 접속 중인 사람(실시간 표시용)
--  * 코드가 정해진 줄은 bgt.spend(올해 집행) / bgt.lines(내년 계획) 에 자동으로 반영됩니다.
--  * 입력 가능 기간: 기본은 예산 연도 상태(작성중·마감=열림, 최종 확정=닫힘). 부서별 기간(입학처 등)을 따로 지정하면 그 기간만 따릅니다.
--  * 같은 부서 여러 명이 동시에 입력해도 줄 단위 버전(ver)·입력 중 표시(lock)로 서로 덮어쓰지 않게 합니다.

alter table bgt.settings add column if not exists entry_open boolean not null default true;
alter table bgt.depts add column if not exists entry_open_at timestamptz;
alter table bgt.depts add column if not exists entry_close_at timestamptz;

create table if not exists bgt.entries (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  dept text not null references bgt.depts(dept) on update cascade,
  phase text not null check (phase in ('actual', 'plan')),
  type text not null check (type in ('세입', '세출')),
  entry_date date,
  memo text not null default '',
  vendor text not null default '',
  amount bigint not null default 0,
  calc text not null default '',
  mok text not null default '',
  code_src text not null default 'none' check (code_src in ('none', 'ai', 'manual', 'admin')),
  ai_conf int,
  ai_why text not null default '',
  ai_alt jsonb not null default '[]'::jsonb,
  line_hint text not null default '',
  needs_check boolean not null default false,
  line_id uuid,
  spend_id uuid,
  sort bigint not null default 0,
  ver int not null default 1,
  locked_by text not null default '',
  locked_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists bgt_entries_scope on bgt.entries(year, dept, phase, type) where deleted_at is null;
create index if not exists bgt_entries_upd on bgt.entries(year, updated_at);

create table if not exists bgt.entry_hist (
  id bigserial primary key,
  entry_id uuid not null,
  at timestamptz not null default now(),
  actor text not null default '',
  kind text not null,
  old jsonb,
  new jsonb,
  note text not null default ''
);
create index if not exists bgt_entry_hist_e on bgt.entry_hist(entry_id, at);

create table if not exists bgt.entry_presence (
  dept text not null,
  who text not null,
  seen_at timestamptz not null default now(),
  primary key (dept, who)
);

alter table bgt.entries enable row level security;
alter table bgt.entry_hist enable row level security;
alter table bgt.entry_presence enable row level security;
revoke all on bgt.entries, bgt.entry_hist, bgt.entry_presence from public, anon, authenticated;
revoke all on sequence bgt.entry_hist_id_seq from public, anon, authenticated;

create or replace function bgt.entry_hist_guard() returns trigger language plpgsql as $f$
begin
  raise exception 'ENTRY_HIST_IMMUTABLE';
end $f$;
create or replace trigger entry_hist_guard before update or delete on bgt.entry_hist
  for each row execute function bgt.entry_hist_guard();

-- ── 내부 함수 ───────────────────────────────────────────────────────────────
-- 입력판 열림 여부
create or replace function bgt.entry_open(p_year int, p_dept text)
returns boolean language sql stable security definer set search_path = bgt, public as $f$
  select coalesce((select s.entry_open and s.status <> 'finalized'
                          and case when d.entry_open_at is not null or d.entry_close_at is not null
                                   then (d.entry_open_at is null or now() >= d.entry_open_at) and (d.entry_close_at is null or now() <= d.entry_close_at)
                                   else s.status in ('open', 'closed') end
                     from bgt.settings s, bgt.depts d where s.year = p_year and d.dept = p_dept), false);
$f$;

create or replace function bgt.entry_json(e bgt.entries)
returns jsonb language sql stable security definer set search_path = bgt, public as $f$
  select (to_jsonb(e) - 'locked_until' - 'spend_id' - 'created_by')
         || jsonb_build_object('hist_n', (select count(*) from bgt.entry_hist h where h.entry_id = e.id),
                               'locked', (e.locked_by <> '' and e.locked_until is not null and e.locked_until > now()));
$f$;

create or replace function bgt.entry_hist_add(p_id uuid, p_actor text, p_kind text, p_old jsonb, p_new jsonb, p_note text default '')
returns void language sql security definer set search_path = bgt, public as $f$
  insert into bgt.entry_hist(entry_id, actor, kind, old, new, note) values (p_id, coalesce(p_actor, ''), p_kind, p_old, p_new, coalesce(p_note, ''));
$f$;

-- 바뀐 칸만 뽑아 이력용 old/new 로 만듭니다.
create or replace function bgt.entry_diff(o bgt.entries, n bgt.entries)
returns jsonb[] language plpgsql immutable as $f$
declare oj jsonb := to_jsonb(o); nj jsonb := to_jsonb(n); k text; od jsonb := '{}'::jsonb; nd jsonb := '{}'::jsonb;
begin
  foreach k in array array['entry_date', 'memo', 'vendor', 'amount', 'calc', 'mok'] loop
    if oj->k is distinct from nj->k then od := od || jsonb_build_object(k, oj->k); nd := nd || jsonb_build_object(k, nj->k); end if;
  end loop;
  return array[od, nd];
end $f$;

-- 줄 하나를 항목(내년 계획) 또는 지출(올해 집행)에 반영/해제합니다. 코드가 없거나 삭제된 줄은 반영을 거둡니다.
create or replace function bgt.entry_unsync(e bgt.entries, p_actor text)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare l bgt.lines;
begin
  if e.spend_id is not null and exists (select 1 from bgt.spend where id = e.spend_id) then
    perform bgt.spend_remove(e.spend_id, e.dept, true, p_actor);
  end if;
  if e.line_id is not null then
    select * into l from bgt.lines where id = e.line_id;
    if found then
      if l.updated_by like 'e:%' and l.base_amount = 0 and l.base_calc = ''
         and not exists (select 1 from bgt.spend where line_id = l.id)
         and not exists (select 1 from bgt.entries x where x.line_id = l.id and x.id <> e.id and x.deleted_at is null) then
        perform bgt.line_remove(l.id, e.dept, true, p_actor);
      elsif e.phase = 'plan' and not exists (select 1 from bgt.entries x where x.line_id = l.id and x.id <> e.id and x.deleted_at is null) then
        update bgt.lines set amount = 0, calc = '', updated_at = now(), updated_by = p_actor where id = l.id;
      end if;
    end if;
  end if;
  update bgt.entries set line_id = null, spend_id = null where id = e.id;
end $f$;

create or replace function bgt.entry_sync(p_id uuid, p_actor text)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare e bgt.entries; l bgt.lines; v_lid uuid; v_sid uuid; v jsonb; v_name text; v_cn text; sp bgt.spend;
begin
  select * into e from bgt.entries where id = p_id;
  if not found then return; end if;
  if e.deleted_at is not null or e.mok = '' then perform bgt.entry_unsync(e, p_actor); return; end if;
  if not exists (select 1 from bgt.codes where type = e.type and code = e.mok and level = 'mok' and active) then raise exception 'BAD_CODE'; end if;
  select name into v_cn from bgt.codes where type = e.type and code = e.mok;

  if e.phase = 'actual' then
    -- 올해 집행(수납): 같은 부서·같은 코드(목)의 항목에 지출로 넣습니다. 항목이 없으면 미편성 신규 항목을 만듭니다.
    select id into v_lid from bgt.lines
     where year = e.year and dept = e.dept and type = e.type and mok = e.mok
     order by (case when name = e.line_hint then 0 else 1 end), sort, name limit 1;
    if v_lid is null then
      v := bgt.line_upsert(e.year, e.dept, jsonb_build_object('type', e.type, 'mok', e.mok, 'name', v_cn), true, 'e:' || p_actor);
      v_lid := (v->>'id')::uuid;
      update bgt.lines set origin = 'unplanned' where id = v_lid;
    end if;
    v_sid := e.spend_id;
    if v_sid is not null then
      select * into sp from bgt.spend where id = v_sid;
      if not found then v_sid := null;
      elsif sp.line_id <> v_lid then perform bgt.spend_remove(v_sid, e.dept, true, p_actor); v_sid := null; end if;
    end if;
    v := bgt.spend_upsert(v_lid, jsonb_build_object('id', v_sid, 'spent_on', e.entry_date, 'memo', e.memo, 'vendor', e.vendor, 'amount', e.amount), e.dept, true, p_actor);
    update bgt.entries set line_id = v_lid, spend_id = (v->>'id')::uuid where id = e.id;
  else
    -- 내년 계획: 한 줄 = 항목 하나. 같은 코드·같은 명칭의 기존 항목이 있으면 그 항목의 요구액·산출식을 갱신합니다.
    v_name := left(btrim(e.memo), 120); if v_name = '' then v_name := v_cn; end if;
    v_lid := null;
    if e.line_id is not null then
      select * into l from bgt.lines where id = e.line_id;
      if found and l.mok = e.mok and l.type = e.type then v_lid := l.id; end if;
    end if;
    if v_lid is null then
      select id into v_lid from bgt.lines
       where year = e.year and dept = e.dept and type = e.type and mok = e.mok and (name = v_name or name = nullif(e.line_hint, ''))
         and not exists (select 1 from bgt.entries x where x.line_id = lines.id and x.id <> e.id and x.deleted_at is null)
       order by (case when name = v_name then 0 else 1 end), sort limit 1;
    end if;
    if v_lid is null then
      if e.line_id is not null then
        -- 코드가 바뀌어 예전 항목과 연결이 끊김: 이 줄이 만든 빈 항목이면 지우고, 전년 기준 항목은 그대로 둡니다.
        select * into l from bgt.lines where id = e.line_id;
        if found and l.updated_by like 'e:%' and l.base_amount = 0 and l.base_calc = ''
           and not exists (select 1 from bgt.spend where line_id = l.id)
           and not exists (select 1 from bgt.entries x where x.line_id = l.id and x.id <> e.id and x.deleted_at is null) then
          update bgt.entries set line_id = null where id = e.id;
          perform bgt.line_remove(l.id, e.dept, true, p_actor);
        end if;
      end if;
      v := bgt.line_upsert(e.year, e.dept, jsonb_build_object('type', e.type, 'mok', e.mok, 'name', v_name, 'calc', e.calc, 'amount', e.amount), true, 'e:' || p_actor);
      v_lid := (v->>'id')::uuid;
    else
      select * into l from bgt.lines where id = v_lid;
      if l.base_amount > 0 or l.base_calc <> '' then
        -- 전년 기준 항목: 명칭·코드는 그대로 두고 요구액·산출식만 갱신
        v := bgt.line_upsert(e.year, e.dept, jsonb_build_object('id', v_lid, 'calc', e.calc, 'amount', e.amount), true, p_actor);
      else
        v := bgt.line_upsert(e.year, e.dept, jsonb_build_object('id', v_lid, 'name', v_name, 'calc', e.calc, 'amount', e.amount), true, p_actor);
      end if;
    end if;
    update bgt.entries set line_id = v_lid where id = e.id;
  end if;
end $f$;

-- 저장(추가·수정). 줄마다 ver 가 다르면 덮어쓰지 않고 conflicts 로 돌려줍니다.
create or replace function bgt.entry_save(p_year int, p_dept text, p_items jsonb, p_admin boolean, p_actor text, p_who text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare
  it jsonb; o bgt.entries; n bgt.entries; v_id uuid; v_dept text; v_phase text; v_type text; v_mok text;
  rows jsonb := '[]'::jsonb; conf jsonb := '[]'::jsonb; d jsonb[]; v_who text := coalesce(p_who, '');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 400 then raise exception 'BAD_ITEMS'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_id := nullif(it->>'id', '')::uuid;
    v_dept := case when p_admin then coalesce(nullif(it->>'dept', ''), p_dept) else p_dept end;
    if v_dept is null or not exists (select 1 from bgt.depts where dept = v_dept and active) then raise exception 'BAD_DEPT'; end if;
    if p_admin then
      if exists (select 1 from bgt.settings where year = p_year and status = 'finalized') then raise exception 'LOCKED'; end if;
    elsif not bgt.entry_open(p_year, v_dept) then raise exception 'PERIOD_CLOSED'; end if;
    v_mok := btrim(coalesce(it->>'mok', ''));

    if v_id is null then
      v_phase := it->>'phase'; v_type := it->>'type';
      if v_phase not in ('actual', 'plan') or v_type not in ('세입', '세출') then raise exception 'BAD_TYPE'; end if;
      if v_mok <> '' and not exists (select 1 from bgt.codes where type = v_type and code = v_mok and level = 'mok' and active) then raise exception 'BAD_CODE'; end if;
      insert into bgt.entries(year, dept, phase, type, entry_date, memo, vendor, amount, calc, mok, code_src, sort, created_by, updated_by)
      values (p_year, v_dept, v_phase, v_type, nullif(it->>'entry_date', '')::date, left(coalesce(it->>'memo', ''), 300), left(coalesce(it->>'vendor', ''), 120),
              greatest(coalesce(bgt.num(it->>'amount'), 0), 0), left(coalesce(it->>'calc', ''), 300), v_mok,
              case when v_mok = '' then 'none' when p_admin then 'admin' else 'manual' end,
              (extract(epoch from clock_timestamp()) * 1000)::bigint, p_actor, p_actor)
      returning * into n;
      perform bgt.entry_hist_add(n.id, p_actor, 'add', null, to_jsonb(n) - 'locked_until');
    else
      select * into o from bgt.entries where id = v_id and year = p_year and dept = v_dept and deleted_at is null for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if (it ? 'ver' and (it->>'ver')::int <> o.ver)
         or (o.locked_by <> '' and o.locked_by <> v_who and o.locked_until is not null and o.locked_until > now()) then
        conf := conf || bgt.entry_json(o); continue;
      end if;
      if v_mok <> '' and v_mok <> o.mok and not exists (select 1 from bgt.codes where type = o.type and code = v_mok and level = 'mok' and active) then raise exception 'BAD_CODE'; end if;
      update bgt.entries set
        entry_date = case when it ? 'entry_date' then nullif(it->>'entry_date', '')::date else entry_date end,
        memo = case when it ? 'memo' then left(coalesce(it->>'memo', ''), 300) else memo end,
        vendor = case when it ? 'vendor' then left(coalesce(it->>'vendor', ''), 120) else vendor end,
        amount = case when it ? 'amount' then greatest(coalesce(bgt.num(it->>'amount'), 0), 0) else amount end,
        calc = case when it ? 'calc' then left(coalesce(it->>'calc', ''), 300) else calc end,
        mok = case when it ? 'mok' then v_mok else mok end,
        code_src = case when it ? 'mok' and v_mok <> o.mok then (case when v_mok = '' then 'none' when p_admin then 'admin' else 'manual' end) else code_src end,
        needs_check = case when it ? 'mok' and v_mok <> o.mok then false else needs_check end,
        ver = ver + 1, updated_at = now(), updated_by = p_actor
      where id = v_id returning * into n;
      d := bgt.entry_diff(o, n);
      if d[1] <> '{}'::jsonb then perform bgt.entry_hist_add(n.id, p_actor, case when d[2] ? 'mok' and (select count(*) from jsonb_object_keys(d[2])) = 1 then 'code' else 'edit' end, d[1], d[2]); end if;
    end if;
    perform bgt.entry_sync(n.id, p_actor);
    select * into n from bgt.entries where id = n.id;
    rows := rows || bgt.entry_json(n);
  end loop;
  return jsonb_build_object('rows', rows, 'conflicts', conf, 'as_of', now());
end $f$;

create or replace function bgt.entry_delete(p_year int, p_dept text, p_ids jsonb, p_admin boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare x text; o bgt.entries; n int := 0;
begin
  if jsonb_typeof(p_ids) <> 'array' then raise exception 'BAD_ITEMS'; end if;
  for x in select jsonb_array_elements_text(p_ids) loop
    select * into o from bgt.entries where id = x::uuid and year = p_year and deleted_at is null and (p_dept is null or dept = p_dept) for update;
    if not found then continue; end if;
    if p_admin then
      if exists (select 1 from bgt.settings where year = p_year and status = 'finalized') then raise exception 'LOCKED'; end if;
    elsif not bgt.entry_open(p_year, o.dept) then raise exception 'PERIOD_CLOSED'; end if;
    update bgt.entries set deleted_at = now(), ver = ver + 1, updated_at = now(), updated_by = p_actor where id = o.id;
    perform bgt.entry_hist_add(o.id, p_actor, 'delete', to_jsonb(o) - 'locked_until', null);
    perform bgt.entry_sync(o.id, p_actor);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'deleted', n, 'as_of', now());
end $f$;

-- AI 판정 결과 반영: [{id, mok, conf, why, alt, line}]
create or replace function bgt.entry_code_apply(p_year int, p_dept text, p_items jsonb, p_admin boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare it jsonb; o bgt.entries; n bgt.entries; v_conf int; rows jsonb := '[]'::jsonb; v_mok text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 400 then raise exception 'BAD_ITEMS'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into o from bgt.entries where id = nullif(it->>'id', '')::uuid and year = p_year and deleted_at is null and (p_dept is null or dept = p_dept) for update;
    if not found then continue; end if;
    if p_admin then
      if exists (select 1 from bgt.settings where year = p_year and status = 'finalized') then raise exception 'LOCKED'; end if;
    elsif not bgt.entry_open(p_year, o.dept) then raise exception 'PERIOD_CLOSED'; end if;
    v_mok := btrim(coalesce(it->>'mok', ''));
    if not exists (select 1 from bgt.codes where type = o.type and code = v_mok and level = 'mok' and active) then continue; end if;
    v_conf := least(greatest(coalesce(bgt.num(it->>'conf'), 0), 0), 100);
    update bgt.entries set mok = v_mok, code_src = 'ai', ai_conf = v_conf, ai_why = left(coalesce(it->>'why', ''), 300),
           ai_alt = case when jsonb_typeof(it->'alt') = 'array' then it->'alt' else '[]'::jsonb end,
           line_hint = left(coalesce(it->>'line', ''), 120), needs_check = (v_conf < 70),
           ver = ver + 1, updated_at = now(), updated_by = p_actor
     where id = o.id returning * into n;
    perform bgt.entry_hist_add(n.id, 'AI(' || p_actor || ')', 'code', jsonb_build_object('mok', o.mok), jsonb_build_object('mok', n.mok, 'conf', v_conf), n.ai_why);
    perform bgt.entry_sync(n.id, p_actor);
    select * into n from bgt.entries where id = n.id;
    rows := rows || bgt.entry_json(n);
  end loop;
  return jsonb_build_object('rows', rows, 'conflicts', '[]'::jsonb, 'as_of', now());
end $f$;

create or replace function bgt.entry_who(p_dept text, p_who text)
returns text language sql immutable as $f$
  select coalesce(p_dept, '관리자') || case when btrim(coalesce(p_who, '')) <> '' then '(' || left(btrim(p_who), 20) || ')' else '' end;
$f$;

-- ── 공개 RPC (부서·관리자 공용: 토큰의 역할로 구분) ─────────────────────────────
create or replace function public.bgt_e_load(p_token text, p_year int, p_dept text default null)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token); v_dept text;
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  v_dept := case when v.role = 'admin' then nullif(p_dept, '') else v.dept end;
  return jsonb_build_object(
    'now', now(), 'role', v.role, 'dept', v_dept,
    'settings', (select to_jsonb(s) from bgt.settings s where s.year = p_year),
    'open', case when v_dept is null then (select not exists (select 1 from bgt.settings where year = p_year and status = 'finalized')) else bgt.entry_open(p_year, v_dept) end,
    'window', (select jsonb_build_object('open_at', d.entry_open_at, 'close_at', d.entry_close_at) from bgt.depts d where d.dept = v_dept),
    'codes', (select coalesce(jsonb_agg(jsonb_build_object('type', c.type, 'code', c.code, 'level', c.level, 'name', c.name, 'descr', c.descr, 'example', c.example) order by c.type, c.sort, c.code), '[]'::jsonb) from bgt.codes c where c.active),
    'entries', (select coalesce(jsonb_agg(bgt.entry_json(e) order by e.dept, e.phase, e.type, e.sort), '[]'::jsonb) from bgt.entries e
                 where e.year = p_year and e.deleted_at is null and (v_dept is null or e.dept = v_dept)));
end $f$;

create or replace function public.bgt_e_changes(p_token text, p_year int, p_dept text default null, p_since timestamptz default null, p_who text default '')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token); v_dept text; v_who text := btrim(coalesce(p_who, ''));
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  v_dept := case when v.role = 'admin' then nullif(p_dept, '') else v.dept end;
  if v_who <> '' and v_dept is not null then
    insert into bgt.entry_presence(dept, who, seen_at) values (v_dept, left(v_who, 20), now())
    on conflict (dept, who) do update set seen_at = now();
  end if;
  return jsonb_build_object(
    'as_of', now(),
    'open', case when v_dept is null then true else bgt.entry_open(p_year, v_dept) end,
    'rows', (select coalesce(jsonb_agg(bgt.entry_json(e) || jsonb_build_object('gone', e.deleted_at is not null)), '[]'::jsonb) from bgt.entries e
              where e.year = p_year and e.updated_at > coalesce(p_since, '-infinity') and (v_dept is null or e.dept = v_dept)),
    'locks', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'by', e.locked_by)), '[]'::jsonb) from bgt.entries e
               where e.year = p_year and e.deleted_at is null and e.locked_until > now() and e.locked_by <> '' and e.locked_by <> v_who and (v_dept is null or e.dept = v_dept)),
    'online', (select coalesce(jsonb_agg(p.who order by p.who), '[]'::jsonb) from bgt.entry_presence p where p.dept = v_dept and p.seen_at > now() - interval '20 seconds'));
end $f$;

create or replace function public.bgt_e_save(p_token text, p_year int, p_dept text, p_items jsonb, p_who text default '')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token);
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  return bgt.entry_save(p_year, case when v.role = 'admin' then nullif(p_dept, '') else v.dept end, p_items, v.role = 'admin',
                        case when v.role = 'admin' then '관리자' || case when btrim(coalesce(p_who, '')) <> '' then '(' || left(btrim(p_who), 20) || ')' else '' end else bgt.entry_who(v.dept, p_who) end, p_who);
end $f$;

create or replace function public.bgt_e_delete(p_token text, p_year int, p_dept text, p_ids jsonb, p_who text default '')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token);
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  return bgt.entry_delete(p_year, case when v.role = 'admin' then nullif(p_dept, '') else v.dept end, p_ids, v.role = 'admin',
                          case when v.role = 'admin' then '관리자' || case when btrim(coalesce(p_who, '')) <> '' then '(' || left(btrim(p_who), 20) || ')' else '' end else bgt.entry_who(v.dept, p_who) end);
end $f$;

create or replace function public.bgt_e_code_apply(p_token text, p_year int, p_dept text, p_items jsonb, p_who text default '')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token);
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  return bgt.entry_code_apply(p_year, case when v.role = 'admin' then nullif(p_dept, '') else v.dept end, p_items, v.role = 'admin',
                              case when v.role = 'admin' then '관리자' else bgt.entry_who(v.dept, p_who) end);
end $f$;

-- 입력 중 표시(다른 사람이 같은 줄을 동시에 고치지 못하게)
create or replace function public.bgt_e_lock(p_token text, p_year int, p_dept text, p_id uuid, p_who text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token); v_who text := btrim(coalesce(p_who, '')); n int;
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_who = '' then return jsonb_build_object('ok', true); end if;
  if p_on then
    update bgt.entries set locked_by = v_who, locked_until = now() + interval '45 seconds'
     where id = p_id and year = p_year and deleted_at is null and (v.role = 'admin' or dept = v.dept)
       and (locked_by = '' or locked_by = v_who or locked_until is null or locked_until < now());
    get diagnostics n = row_count;
    return jsonb_build_object('ok', n > 0);
  end if;
  update bgt.entries set locked_by = '', locked_until = null where id = p_id and locked_by = v_who;
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.bgt_e_hist(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token);
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  if v.role <> 'admin' and not exists (select 1 from bgt.entries where id = p_id and dept = v.dept) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', h.at, 'actor', h.actor, 'kind', h.kind, 'old', h.old, 'new', h.new, 'note', h.note) order by h.at desc, h.id desc)
                     from bgt.entry_hist h where h.entry_id = p_id), '[]'::jsonb);
end $f$;

-- AI 서버 함수(budget-ai)가 토큰을 확인하고 코드표·부서 항목을 받아 갈 때 쓰는 컨텍스트
create or replace function public.bgt_e_ctx(p_token text, p_year int, p_dept text default null)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token); v_dept text;
begin
  if v is null then raise exception 'AUTH_REQUIRED'; end if;
  v_dept := case when v.role = 'admin' then nullif(p_dept, '') else v.dept end;
  return jsonb_build_object('role', v.role, 'dept', v_dept,
    'codes', (select coalesce(jsonb_agg(jsonb_build_object('type', c.type, 'code', c.code, 'level', c.level, 'name', c.name, 'descr', c.descr, 'example', c.example) order by c.type, c.sort, c.code), '[]'::jsonb) from bgt.codes c where c.active),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('type', l.type, 'mok', l.mok, 'name', l.name) order by l.type, l.mok, l.sort), '[]'::jsonb)
                from bgt.lines l where l.year = p_year and (v_dept is null or l.dept = v_dept)),
    'hist', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
               select jsonb_build_object('type', e.type, 'memo', e.memo, 'vendor', e.vendor, 'mok', e.mok) x
                 from bgt.entries e where e.year = p_year and e.deleted_at is null and e.mok <> '' and (e.code_src in ('manual', 'admin') or (e.code_src = 'ai' and not e.needs_check))
                  and (v_dept is null or e.dept = v_dept) order by e.updated_at desc limit 60) t));
end $f$;

-- ── 관리자 전용: 입력판 기간·열림 ─────────────────────────────────────────────
create or replace function public.bgt_ea_overview(p_token text, p_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  return jsonb_build_object(
    'entry_open', coalesce((select entry_open from bgt.settings where year = p_year), true),
    'status', (select status from bgt.settings where year = p_year),
    'depts', (select coalesce(jsonb_agg(jsonb_build_object('dept', d.dept, 'open_at', d.entry_open_at, 'close_at', d.entry_close_at, 'open_now', bgt.entry_open(p_year, d.dept),
                'n', (select count(*) from bgt.entries e where e.year = p_year and e.dept = d.dept and e.deleted_at is null),
                'n_check', (select count(*) from bgt.entries e where e.year = p_year and e.dept = d.dept and e.deleted_at is null and (e.needs_check or e.mok = ''))) order by d.sort, d.dept), '[]'::jsonb)
                from bgt.depts d where d.active));
end $f$;

create or replace function public.bgt_ea_window(p_token text, p_dept text, p_open_at timestamptz, p_close_at timestamptz)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  if p_open_at is not null and p_close_at is not null and p_close_at < p_open_at then raise exception 'BAD_PERIOD'; end if;
  update bgt.depts set entry_open_at = p_open_at, entry_close_at = p_close_at where dept = p_dept;
  perform bgt.log_add('admin', 'entry_window', p_dept, jsonb_build_object('open_at', p_open_at, 'close_at', p_close_at));
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.bgt_ea_toggle(p_token text, p_year int, p_open boolean)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  update bgt.settings set entry_open = coalesce(p_open, true) where year = p_year;
  perform bgt.log_add('admin', 'entry_toggle', p_year::text, jsonb_build_object('open', p_open));
  return jsonb_build_object('ok', true);
end $f$;

do $f$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'bgt\_e\_%' or p.proname like 'bgt\_ea\_%') loop
    execute 'revoke all on function ' || r.sig || ' from public';
    execute 'grant execute on function ' || r.sig || ' to anon, authenticated';
  end loop;
end $f$;
