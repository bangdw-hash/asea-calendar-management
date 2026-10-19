-- 부서 예산안 스키마 14: 입력판 새 줄의 정렬 위치 지정 (학기·분기 나눔 줄을 원래 줄 바로 아래에 두기 위함)
-- 선행: budget_schema_9.sql. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
-- bgt.entry_save: 새 줄(id 없음)에 sort 값을 주면 그 위치에 넣습니다. 없으면 이전처럼 현재 시각 기준으로 맨 아래에 붙습니다.

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
              coalesce(bgt.num(it->>'sort')::bigint, (extract(epoch from clock_timestamp()) * 1000)::bigint), p_actor, p_actor)
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
