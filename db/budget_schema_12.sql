-- 부서 예산안 스키마 12: 조직 개편 보강 — 통합 시 예산 가져가기/남겨 두기, 되돌리기, 부서 순서
-- 선행: budget_schema_1~11.sql. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
--  * 통합(흡수) 방식: carry = 이전 예산(항목·지출·입력판·결재 QR·한도)을 받는 부서로 가져감 / leave = 이전 부서에 그대로 남겨 두고 부서만 정리(비노출)
--  * 되돌리기: 이름 변경·하위 편입·통합 모두 적용 당시 옮긴 행을 기록해 두므로, 같은 행을 원래 부서로 되돌립니다.
--    (통합 뒤에 받는 부서에서 새로 만든 항목·수정한 금액은 그대로 두고, 옮겨졌던 행만 돌려보냅니다.)
--  * 부서 순서: 화면에 나열되는 순서를 한 번에 저장합니다.

alter table bgt.reorg add column if not exists mode text not null default 'carry';
alter table bgt.reorg add column if not exists undone_at timestamptz;

create or replace function bgt.dept_under(p_src text, p_parent text, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v text := p_parent; n int := 0; v_prev text;
begin
  if not exists (select 1 from bgt.depts where dept = p_src) then raise exception 'NO_DEPT'; end if;
  select parent into v_prev from bgt.depts where dept = p_src;
  if p_parent is null or p_parent = '' then
    update bgt.depts set parent = null where dept = p_src;
    perform bgt.log_add(p_actor, 'dept_detach', p_src);
    return jsonb_build_object('src', p_src, 'parent', null, 'prev_parent', v_prev);
  end if;
  if p_parent = p_src or not exists (select 1 from bgt.depts where dept = p_parent) then raise exception 'BAD_PARENT'; end if;
  while v is not null and n < 10 loop
    if v = p_src then raise exception 'BAD_PARENT'; end if;
    select parent into v from bgt.depts where dept = v; n := n + 1;
  end loop;
  update bgt.depts set parent = p_parent where dept = p_src;
  perform bgt.log_add(p_actor, 'dept_under', p_src, jsonb_build_object('parent', p_parent));
  return jsonb_build_object('src', p_src, 'parent', p_parent, 'prev_parent', v_prev);
end $f$;

create or replace function bgt.dept_merge2(p_src text, p_dst text, p_year int, p_mode text, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare mv jsonb; ids jsonb; r record; v_active boolean; v_parent text; kids jsonb; caps jsonb := '[]'::jsonb; subs jsonb := '[]'::jsonb;
  n_lines int := 0; n_entries int := 0; n_tickets int := 0; v_has boolean;
begin
  if p_src = p_dst or not exists (select 1 from bgt.depts where dept = p_src) or not exists (select 1 from bgt.depts where dept = p_dst) then raise exception 'BAD_DEPT'; end if;
  if p_mode not in ('carry', 'leave') then raise exception 'BAD_TYPE'; end if;
  select active, parent into v_active, v_parent from bgt.depts where dept = p_src;
  select coalesce(jsonb_agg(dept), '[]'::jsonb) into kids from bgt.depts where parent = p_src;
  mv := jsonb_build_object('src_active', v_active, 'src_parent', v_parent, 'children', kids);
  if p_mode = 'carry' then
    select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from bgt.lines where dept = p_src and (p_year is null or year = p_year);
    mv := mv || jsonb_build_object('lines', ids);
    update bgt.lines set dept = p_dst, updated_at = now(), updated_by = p_actor where dept = p_src and (p_year is null or year = p_year);
    get diagnostics n_lines = row_count;
    select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from bgt.entries where dept = p_src and (p_year is null or year = p_year);
    mv := mv || jsonb_build_object('entries', ids);
    update bgt.entries set dept = p_dst where dept = p_src and (p_year is null or year = p_year);
    get diagnostics n_entries = row_count;
    select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from bgt.tickets where dept = p_src and (p_year is null or year = p_year);
    mv := mv || jsonb_build_object('tickets', ids);
    update bgt.tickets set dept = p_dst where dept = p_src and (p_year is null or year = p_year);
    get diagnostics n_tickets = row_count;
    update bgt.ticket_lines set prop_dept = p_dst where prop_dept = p_src;
    for r in select year, type, amount from bgt.caps where dept = p_src and (p_year is null or year = p_year) loop
      select exists (select 1 from bgt.caps d where d.dept = p_dst and d.year = r.year and d.type = r.type) into v_has;
      if v_has then
        update bgt.caps set amount = amount + r.amount where dept = p_dst and year = r.year and type = r.type;
        update bgt.caps set amount = 0 where dept = p_src and year = r.year and type = r.type;
      else
        update bgt.caps set dept = p_dst where dept = p_src and year = r.year and type = r.type;
      end if;
      caps := caps || jsonb_build_object('y', r.year, 't', r.type, 'amt', r.amount, 'op', case when v_has then 'added' else 'moved' end);
    end loop;
    mv := mv || jsonb_build_object('caps', caps);
    if n_lines > 0 then
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into subs from bgt.submissions s where dept = p_dst and (p_year is null or year = p_year) and status <> 'draft';
      update bgt.submissions set status = 'draft', submitted_at = null, reviewed_at = null, confirmed_at = null, reject_reason = ''
       where dept = p_dst and (p_year is null or year = p_year) and status <> 'draft';
    end if;
    mv := mv || jsonb_build_object('subs', subs);
  end if;
  update bgt.depts set parent = p_dst where parent = p_src;
  update bgt.depts set active = false, parent = null where dept = p_src;
  perform bgt.log_add(p_actor, 'dept_merge', p_src, jsonb_build_object('into', p_dst, 'year', p_year, 'mode', p_mode, 'lines', n_lines, 'entries', n_entries, 'tickets', n_tickets));
  return jsonb_build_object('src', p_src, 'dst', p_dst, 'mode', p_mode, 'lines', n_lines, 'entries', n_entries, 'tickets', n_tickets, 'moved', mv);
end $f$;

create or replace function bgt.reorg_apply(p_id uuid, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare r bgt.reorg; res jsonb;
begin
  select * into r from bgt.reorg where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'planned' then raise exception 'BAD_TRANSITION'; end if;
  update bgt.reorg set status = 'applied', applied_at = now() where id = p_id;   -- 먼저 표시해 두어야 이름 변경이 이 행의 대상 이름을 건드리지 않습니다.
  res := case r.kind
    when 'rename' then bgt.dept_rename(r.src, r.dst, p_actor)
    when 'merge' then bgt.dept_merge2(r.src, r.dst, r.year, coalesce(r.mode, 'carry'), p_actor)
    when 'under' then bgt.dept_under(r.src, r.dst, p_actor)
    else bgt.dept_under(r.src, null, p_actor) end;
  update bgt.reorg set result = res where id = p_id;
  return res;
end $f$;

create or replace function bgt.reorg_undo(p_id uuid, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare r bgt.reorg; mv jsonb; x text; c jsonb; s jsonb; out jsonb;
begin
  select * into r from bgt.reorg where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.status <> 'applied' or r.undone_at is not null then raise exception 'BAD_TRANSITION'; end if;
  if r.kind = 'rename' then
    out := bgt.dept_rename(r.dst, r.src, p_actor);
  elsif r.kind in ('under', 'detach') then
    out := bgt.dept_under(r.src, nullif(r.result->>'prev_parent', ''), p_actor);
  else
    mv := r.result->'moved';
    if mv is null then raise exception 'NOT_UNDOABLE'; end if;   -- 스키마 12 이전에 적용된 통합은 이동 기록이 없어 되돌릴 수 없습니다(항목 이동으로 수동 조정).
    if r.mode = 'carry' then
      for x in select jsonb_array_elements_text(coalesce(mv->'lines', '[]'::jsonb)) loop update bgt.lines set dept = r.src, updated_at = now(), updated_by = p_actor where id = x::uuid and dept = r.dst; end loop;
      for x in select jsonb_array_elements_text(coalesce(mv->'entries', '[]'::jsonb)) loop update bgt.entries set dept = r.src where id = x::uuid and dept = r.dst; end loop;
      for x in select jsonb_array_elements_text(coalesce(mv->'tickets', '[]'::jsonb)) loop update bgt.tickets set dept = r.src where id = x::uuid and dept = r.dst; end loop;
      update bgt.ticket_lines set prop_dept = r.src where prop_dept = r.dst and ticket_id in (select id from bgt.tickets where dept = r.src);
      for c in select * from jsonb_array_elements(coalesce(mv->'caps', '[]'::jsonb)) loop
        if c->>'op' = 'moved' then
          update bgt.caps set dept = r.src where dept = r.dst and year = (c->>'y')::int and type = c->>'t';
        else
          update bgt.caps set amount = greatest(amount - (c->>'amt')::bigint, 0) where dept = r.dst and year = (c->>'y')::int and type = c->>'t';
          update bgt.caps set amount = (c->>'amt')::bigint where dept = r.src and year = (c->>'y')::int and type = c->>'t';
        end if;
      end loop;
      for s in select * from jsonb_array_elements(coalesce(mv->'subs', '[]'::jsonb)) loop
        update bgt.submissions set status = s->>'status', submitted_at = nullif(s->>'submitted_at', '')::timestamptz, reviewed_at = nullif(s->>'reviewed_at', '')::timestamptz,
               confirmed_at = nullif(s->>'confirmed_at', '')::timestamptz, reject_reason = coalesce(s->>'reject_reason', '')
         where dept = r.dst and year = (s->>'year')::int and type = s->>'type';
      end loop;
    end if;
    update bgt.depts set active = coalesce((mv->>'src_active')::boolean, true), parent = nullif(mv->>'src_parent', '') where dept = r.src;
    for x in select jsonb_array_elements_text(coalesce(mv->'children', '[]'::jsonb)) loop update bgt.depts set parent = r.src where dept = x and parent = r.dst; end loop;
    out := jsonb_build_object('src', r.src, 'dst', r.dst, 'restored', true);
  end if;
  update bgt.reorg set undone_at = now() where id = p_id;
  perform bgt.log_add(p_actor, 'reorg_undo', r.src, jsonb_build_object('kind', r.kind, 'dst', r.dst));
  return out;
end $f$;

create or replace function public.bgt_a_reorg_add2(p_token text, p_kind text, p_src text, p_dst text, p_year int, p_effective_on date, p_note text, p_mode text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v_id uuid; v_res jsonb := null; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform bgt.sess(p_token, 'admin');
  if p_kind not in ('rename', 'merge', 'under', 'detach') then raise exception 'BAD_TYPE'; end if;
  if coalesce(p_mode, 'carry') not in ('carry', 'leave') then raise exception 'BAD_TYPE'; end if;
  if not exists (select 1 from bgt.depts where dept = p_src) then raise exception 'NO_DEPT'; end if;
  if p_kind = 'rename' and (btrim(coalesce(p_dst, '')) = '' or exists (select 1 from bgt.depts where dept = btrim(p_dst))) then raise exception 'DEPT_EXISTS'; end if;
  if p_kind in ('merge', 'under') and not exists (select 1 from bgt.depts where dept = p_dst) then raise exception 'BAD_DEPT'; end if;
  insert into bgt.reorg(kind, src, dst, year, effective_on, note, mode) values (p_kind, p_src, btrim(coalesce(p_dst, '')), p_year, p_effective_on, left(coalesce(p_note, ''), 300), coalesce(p_mode, 'carry')) returning id into v_id;
  if p_effective_on is null or p_effective_on <= v_today then v_res := bgt.reorg_apply(v_id, '관리자'); end if;
  perform bgt.log_add('admin', 'reorg_add', p_src, jsonb_build_object('kind', p_kind, 'dst', p_dst, 'year', p_year, 'on', p_effective_on, 'mode', p_mode));
  return jsonb_build_object('ok', true, 'id', v_id, 'applied', v_res is not null, 'result', v_res - 'moved');
end $f$;

create or replace function public.bgt_a_reorg_undo(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  return jsonb_build_object('ok', true, 'result', bgt.reorg_undo(p_id, '관리자'));
end $f$;

-- 부서 나열 순서 저장: 화면에 보이는 순서대로 이름 배열을 넘깁니다.
create or replace function public.bgt_a_dept_order(p_token text, p_order jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare x text; i int := 0;
begin
  perform bgt.sess(p_token, 'admin');
  if jsonb_typeof(p_order) <> 'array' then raise exception 'BAD_ITEMS'; end if;
  for x in select jsonb_array_elements_text(p_order) loop
    i := i + 1;
    update bgt.depts set sort = i * 10 where dept = x;
  end loop;
  perform bgt.log_add('admin', 'dept_order', '', jsonb_build_object('n', i));
  return jsonb_build_object('ok', true, 'n', i);
end $f$;

-- 목록용: 큰 이동 기록(moved)은 빼고 돌려줍니다.
create or replace function public.bgt_a_reorg_list(p_token text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
begin
  perform bgt.sess(p_token, 'admin');
  return coalesce((select jsonb_agg((to_jsonb(r) - 'result') || jsonb_build_object('result', case when r.result is null then null else r.result - 'moved' end, 'undoable', r.status = 'applied' and r.undone_at is null and (r.kind <> 'merge' or (r.result ? 'moved')))
                    order by r.status = 'planned' desc, coalesce(r.applied_at, r.created_at) desc) from bgt.reorg r), '[]'::jsonb);
end $f$;

revoke all on function public.bgt_a_reorg_add2(text, text, text, text, integer, date, text, text) from public;
revoke all on function public.bgt_a_reorg_undo(text, uuid) from public;
revoke all on function public.bgt_a_dept_order(text, jsonb) from public;
revoke all on function public.bgt_a_reorg_list(text) from public;
grant execute on function public.bgt_a_reorg_add2(text, text, text, text, integer, date, text, text) to anon, authenticated;
grant execute on function public.bgt_a_reorg_undo(text, uuid) to anon, authenticated;
grant execute on function public.bgt_a_dept_order(text, jsonb) to anon, authenticated;
grant execute on function public.bgt_a_reorg_list(text) to anon, authenticated;
