-- 부서 예산안 스키마 11: 조직 개편 (이름 변경 · 통합(흡수) · 하위 편입 · 예약 적용 · 항목 이동)
-- 선행: budget_schema_1~10.sql. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
--  * 이름 변경 : 부서 이름을 바꾸면 항목·지출·입력판·결재 QR·한도·제출 상태·세션이 모두 새 이름으로 따라갑니다. (확정안 이력은 당시 이름으로 남음)
--  * 통합(흡수): 한 부서의 (해당 연도) 항목·입력판 줄·결재 QR·한도를 다른 부서로 옮기고 원 부서는 사용 안 함으로 둡니다. 합친 부서의 제출 상태는 다시 작성 중으로 돌립니다.
--  * 하위 편입 : 부서의 상위 조직(parent)만 지정합니다. 예산 항목은 그대로이며 화면에서 「상위 › 하위」로 묶여 보입니다.
--  * 예약 적용 : 적용일을 정해 두면, 그 날짜 이후 첫 접속(bgt_info)에서 자동으로 적용됩니다.
--  * 항목 이동 : 선택한 항목을 지출·입력판 줄과 함께 다른 부서로 옮깁니다(조직 개편 중 일부 항목만 조정할 때).

alter table bgt.depts add column if not exists parent text;
alter table bgt.depts add column if not exists sub_units text[] not null default '{}';

create table if not exists bgt.reorg (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rename', 'merge', 'under', 'detach')),
  src text not null,
  dst text not null default '',
  year int,
  effective_on date,
  status text not null default 'planned' check (status in ('planned', 'applied', 'cancelled', 'failed')),
  note text not null default '',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  result jsonb
);
alter table bgt.reorg enable row level security;
revoke all on bgt.reorg from public, anon, authenticated;

-- ── 내부 함수 ───────────────────────────────────────────────────────────────
create or replace function bgt.dept_rename(p_old text, p_new text, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v_new text := btrim(coalesce(p_new, ''));
begin
  if v_new = '' or char_length(v_new) > 40 then raise exception 'NAME_REQUIRED'; end if;
  if p_old = v_new then raise exception 'SAME_NAME'; end if;
  if not exists (select 1 from bgt.depts where dept = p_old) then raise exception 'NO_DEPT'; end if;
  if exists (select 1 from bgt.depts where dept = v_new) then raise exception 'DEPT_EXISTS'; end if;
  update bgt.depts set dept = v_new where dept = p_old;            -- 항목·입력판·결재 QR(FK)은 자동으로 따라감
  update bgt.caps set dept = v_new where dept = p_old;
  update bgt.submissions set dept = v_new where dept = p_old;
  update bgt.ticket_lines set prop_dept = v_new where prop_dept = p_old;
  update bgt.sessions set dept = v_new where dept = p_old;
  update bgt.entry_presence set dept = v_new where dept = p_old;
  update bgt.depts set parent = v_new where parent = p_old;
  update bgt.reorg set src = v_new where src = p_old and status = 'planned';
  update bgt.reorg set dst = v_new where dst = p_old and status = 'planned';
  perform bgt.log_add(p_actor, 'dept_rename', p_old, jsonb_build_object('new', v_new));
  return jsonb_build_object('from', p_old, 'to', v_new);
end $f$;

create or replace function bgt.dept_under(p_src text, p_parent text, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v text := p_parent; n int := 0;
begin
  if not exists (select 1 from bgt.depts where dept = p_src) then raise exception 'NO_DEPT'; end if;
  if p_parent is null or p_parent = '' then
    update bgt.depts set parent = null where dept = p_src;
    perform bgt.log_add(p_actor, 'dept_detach', p_src);
    return jsonb_build_object('src', p_src, 'parent', null);
  end if;
  if p_parent = p_src or not exists (select 1 from bgt.depts where dept = p_parent) then raise exception 'BAD_PARENT'; end if;
  while v is not null and n < 10 loop                                  -- 순환 방지
    if v = p_src then raise exception 'BAD_PARENT'; end if;
    select parent into v from bgt.depts where dept = v; n := n + 1;
  end loop;
  update bgt.depts set parent = p_parent where dept = p_src;
  perform bgt.log_add(p_actor, 'dept_under', p_src, jsonb_build_object('parent', p_parent));
  return jsonb_build_object('src', p_src, 'parent', p_parent);
end $f$;

create or replace function bgt.dept_merge(p_src text, p_dst text, p_year int, p_deactivate boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare n_lines int; n_entries int; n_tickets int;
begin
  if p_src = p_dst or not exists (select 1 from bgt.depts where dept = p_src) or not exists (select 1 from bgt.depts where dept = p_dst) then raise exception 'BAD_DEPT'; end if;
  update bgt.lines set dept = p_dst, updated_at = now(), updated_by = p_actor where dept = p_src and (p_year is null or year = p_year);
  get diagnostics n_lines = row_count;
  update bgt.entries set dept = p_dst where dept = p_src and (p_year is null or year = p_year);
  get diagnostics n_entries = row_count;
  update bgt.tickets set dept = p_dst where dept = p_src and (p_year is null or year = p_year);
  get diagnostics n_tickets = row_count;
  update bgt.ticket_lines set prop_dept = p_dst where prop_dept = p_src;
  -- 한도: 받는 부서에 같은 연도·구분이 있으면 합산하고, 없으면 그대로 옮깁니다. (합산된 원 부서 행은 0원으로 남깁니다)
  update bgt.caps d set amount = d.amount + s.amount
    from bgt.caps s where s.dept = p_src and d.dept = p_dst and d.year = s.year and d.type = s.type and (p_year is null or s.year = p_year);
  update bgt.caps s set amount = 0
   where s.dept = p_src and (p_year is null or s.year = p_year) and exists (select 1 from bgt.caps d where d.dept = p_dst and d.year = s.year and d.type = s.type);
  update bgt.caps s set dept = p_dst
   where s.dept = p_src and (p_year is null or s.year = p_year) and not exists (select 1 from bgt.caps d where d.dept = p_dst and d.year = s.year and d.type = s.type);
  if n_lines > 0 then
    update bgt.submissions set status = 'draft', submitted_at = null, reviewed_at = null, confirmed_at = null, reject_reason = ''
     where dept = p_dst and (p_year is null or year = p_year) and status <> 'draft';
  end if;
  update bgt.depts set parent = p_dst where parent = p_src;
  if p_deactivate then update bgt.depts set active = false, parent = null where dept = p_src; end if;
  perform bgt.log_add(p_actor, 'dept_merge', p_src, jsonb_build_object('into', p_dst, 'year', p_year, 'lines', n_lines, 'entries', n_entries, 'tickets', n_tickets));
  return jsonb_build_object('src', p_src, 'dst', p_dst, 'lines', n_lines, 'entries', n_entries, 'tickets', n_tickets);
end $f$;

create or replace function bgt.reorg_apply(p_id uuid, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare r bgt.reorg; res jsonb;
begin
  select * into r from bgt.reorg where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'planned' then raise exception 'BAD_TRANSITION'; end if;
  res := case r.kind
    when 'rename' then bgt.dept_rename(r.src, r.dst, p_actor)
    when 'merge' then bgt.dept_merge(r.src, r.dst, r.year, true, p_actor)
    when 'under' then bgt.dept_under(r.src, r.dst, p_actor)
    else bgt.dept_under(r.src, null, p_actor) end;
  update bgt.reorg set status = 'applied', applied_at = now(), result = res where id = p_id;
  return res;
end $f$;

-- 적용일이 된 예약 개편을 자동으로 적용합니다(첫 접속 때). 하나가 실패해도 다른 접속·개편을 막지 않습니다.
create or replace function bgt.reorg_run_due()
returns void language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare r record;
begin
  for r in select id from bgt.reorg where status = 'planned' and effective_on is not null and effective_on <= (now() at time zone 'Asia/Seoul')::date order by effective_on, created_at loop
    begin
      perform bgt.reorg_apply(r.id, '예약 적용');
    exception when others then
      update bgt.reorg set status = 'failed', result = jsonb_build_object('error', sqlerrm) where id = r.id;
    end;
  end loop;
end $f$;

-- ── 공개 RPC ────────────────────────────────────────────────────────────────
create or replace function public.bgt_info()
returns jsonb language plpgsql security definer set search_path = bgt, public as $f$
begin
  perform bgt.reorg_run_due();
  return jsonb_build_object(
    'now', now(),
    'settings', (select coalesce(jsonb_agg(to_jsonb(s) order by s.year desc), '[]'::jsonb) from bgt.settings s),
    'depts', (select coalesce(jsonb_agg(jsonb_build_object('dept', d.dept, 'has_pw', d.pw_hash is not null, 'parent', d.parent, 'sub_units', to_jsonb(d.sub_units)) order by d.sort, d.dept), '[]'::jsonb)
                from bgt.depts d where d.active)
  );
end $f$;

create or replace function public.bgt_a_load(p_token text, p_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  return bgt.bundle(p_year, null) || jsonb_build_object(
    'all_settings', (select coalesce(jsonb_agg(to_jsonb(s) order by s.year desc), '[]'::jsonb) from bgt.settings s),
    'depts', (select coalesce(jsonb_agg(jsonb_build_object('dept', d.dept, 'sort', d.sort, 'active', d.active, 'parent', d.parent, 'sub_units', to_jsonb(d.sub_units),
                'has_pw', d.pw_hash is not null, 'pw_set_at', d.pw_set_at, 'locked_until', d.locked_until) order by d.sort, d.dept), '[]'::jsonb) from bgt.depts d),
    'codes', (select coalesce(jsonb_agg(to_jsonb(c) order by c.type, c.sort, c.code), '[]'::jsonb) from bgt.codes c));
end $f$;

create or replace function public.bgt_a_dept_edit(p_token text, p_dept text, p_sort int, p_active boolean, p_parent text, p_units jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v_units text[] := '{}';
begin
  perform bgt.sess(p_token, 'admin');
  if not exists (select 1 from bgt.depts where dept = p_dept) then raise exception 'NO_DEPT'; end if;
  if jsonb_typeof(p_units) = 'array' then select coalesce(array_agg(btrim(x)), '{}') into v_units from jsonb_array_elements_text(p_units) x where btrim(x) <> ''; end if;
  update bgt.depts set sort = coalesce(p_sort, sort), active = coalesce(p_active, active), sub_units = v_units where dept = p_dept;
  perform bgt.dept_under(p_dept, nullif(btrim(coalesce(p_parent, '')), ''), '관리자');
  perform bgt.log_add('admin', 'dept_edit', p_dept, jsonb_build_object('sort', p_sort, 'active', p_active, 'parent', p_parent, 'units', v_units));
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.bgt_a_reorg_list(p_token text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.status = 'planned' desc, r.effective_on desc nulls last, r.created_at desc) from bgt.reorg r), '[]'::jsonb);
end $f$;

create or replace function public.bgt_a_reorg_add(p_token text, p_kind text, p_src text, p_dst text, p_year int, p_effective_on date, p_note text default '')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v_id uuid; v_res jsonb := null; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform bgt.sess(p_token, 'admin');
  if p_kind not in ('rename', 'merge', 'under', 'detach') then raise exception 'BAD_TYPE'; end if;
  if not exists (select 1 from bgt.depts where dept = p_src) then raise exception 'NO_DEPT'; end if;
  if p_kind = 'rename' and (btrim(coalesce(p_dst, '')) = '' or exists (select 1 from bgt.depts where dept = btrim(p_dst))) then raise exception 'DEPT_EXISTS'; end if;
  if p_kind in ('merge', 'under') and not exists (select 1 from bgt.depts where dept = p_dst) then raise exception 'BAD_DEPT'; end if;
  insert into bgt.reorg(kind, src, dst, year, effective_on, note) values (p_kind, p_src, btrim(coalesce(p_dst, '')), p_year, p_effective_on, left(coalesce(p_note, ''), 300)) returning id into v_id;
  if p_effective_on is null or p_effective_on <= v_today then v_res := bgt.reorg_apply(v_id, '관리자'); end if;
  perform bgt.log_add('admin', 'reorg_add', p_src, jsonb_build_object('kind', p_kind, 'dst', p_dst, 'year', p_year, 'on', p_effective_on));
  return jsonb_build_object('ok', true, 'id', v_id, 'applied', v_res is not null, 'result', v_res);
end $f$;

create or replace function public.bgt_a_reorg_apply(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  return jsonb_build_object('ok', true, 'result', bgt.reorg_apply(p_id, '관리자'));
end $f$;

create or replace function public.bgt_a_reorg_cancel(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  update bgt.reorg set status = 'cancelled' where id = p_id and status = 'planned';
  return jsonb_build_object('ok', true);
end $f$;

-- 선택한 항목(과 그 지출·입력판 줄)을 다른 부서로 옮깁니다.
create or replace function public.bgt_a_lines_move(p_token text, p_ids jsonb, p_dst text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare x text; l bgt.lines; n int := 0;
begin
  perform bgt.sess(p_token, 'admin');
  if jsonb_typeof(p_ids) <> 'array' then raise exception 'BAD_ITEMS'; end if;
  if not exists (select 1 from bgt.depts where dept = p_dst) then raise exception 'BAD_DEPT'; end if;
  for x in select jsonb_array_elements_text(p_ids) loop
    select * into l from bgt.lines where id = x::uuid for update;
    if not found or l.dept = p_dst then continue; end if;
    update bgt.lines set dept = p_dst, updated_at = now(), updated_by = '관리자(이동)' where id = l.id;
    update bgt.entries set dept = p_dst where line_id = l.id;
    perform bgt.log_add('admin', 'line_move', l.dept || '/' || l.type || '/' || l.mok, jsonb_build_object('name', l.name, 'to', p_dst, 'amount', l.amount, 'base', l.base_amount));
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'moved', n);
end $f$;

revoke all on function public.bgt_info() from public;
revoke all on function public.bgt_a_load(text, integer) from public;
revoke all on function public.bgt_a_dept_edit(text, text, integer, boolean, text, jsonb) from public;
revoke all on function public.bgt_a_reorg_list(text) from public;
revoke all on function public.bgt_a_reorg_add(text, text, text, text, integer, date, text) from public;
revoke all on function public.bgt_a_reorg_apply(text, uuid) from public;
revoke all on function public.bgt_a_reorg_cancel(text, uuid) from public;
revoke all on function public.bgt_a_lines_move(text, jsonb, text) from public;
grant execute on function public.bgt_info() to anon, authenticated;
grant execute on function public.bgt_a_load(text, integer) to anon, authenticated;
grant execute on function public.bgt_a_dept_edit(text, text, integer, boolean, text, jsonb) to anon, authenticated;
grant execute on function public.bgt_a_reorg_list(text) to anon, authenticated;
grant execute on function public.bgt_a_reorg_add(text, text, text, text, integer, date, text) to anon, authenticated;
grant execute on function public.bgt_a_reorg_apply(text, uuid) to anon, authenticated;
grant execute on function public.bgt_a_reorg_cancel(text, uuid) to anon, authenticated;
grant execute on function public.bgt_a_lines_move(text, jsonb, text) to anon, authenticated;
