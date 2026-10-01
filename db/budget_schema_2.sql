-- 부서 예산안 스키마 2/4: 내부 함수
-- 번호 순서대로 파일마다 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)

-- ── 내부 함수 (bgt 스키마, 외부 노출 안 됨) ─────────────────────────────────
create or replace function bgt.sess(p_token text, p_role text)
returns bgt.sessions language plpgsql security definer
set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  select * into v from bgt.sessions
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if not found or v.role <> p_role then raise exception 'AUTH_REQUIRED'; end if;
  return v;
end $$;

create or replace function bgt.log_add(p_actor text, p_action text, p_target text, p_detail jsonb default null)
returns void language sql security definer set search_path = bgt, public as $$
  insert into bgt.log(actor, action, target, detail) values (coalesce(p_actor, ''), p_action, coalesce(p_target, ''), p_detail);
$$;

create or replace function bgt.new_session(p_role text, p_dept text)
returns text language plpgsql security definer set search_path = bgt, extensions, public as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  delete from bgt.sessions where expires_at < now();
  insert into bgt.sessions(token_hash, role, dept, expires_at)
  values (encode(digest(t, 'sha256'), 'hex'), p_role, p_dept, now() + interval '12 hours');
  return t;
end $$;

create or replace function bgt.is_open(p_year int)
returns boolean language sql stable security definer set search_path = bgt, public as $$
  select coalesce((select status = 'open'
                          and (open_at is null or now() >= open_at)
                          and (close_at is null or now() <= close_at)
                     from bgt.settings where year = p_year), false);
$$;

-- 부서 편집 가능 여부: 작성기간 열림 + 해당 (부서, 구분) 제출상태가 draft
create or replace function bgt.assert_editable(p_year int, p_dept text, p_type text)
returns void language plpgsql security definer set search_path = bgt, public as $$
declare v_status text;
begin
  if not bgt.is_open(p_year) then raise exception 'PERIOD_CLOSED'; end if;
  select status into v_status from bgt.submissions where year = p_year and dept = p_dept and type = p_type;
  if coalesce(v_status, 'draft') <> 'draft' then raise exception 'LOCKED'; end if;
end $$;

create or replace function bgt.num(p text)
returns bigint language sql immutable as $$
  select case when p is null or btrim(p) = '' then null else round(p::numeric)::bigint end;
$$;

-- 항목 저장 (부서/관리자 공용)
create or replace function bgt.line_upsert(p_year int, p_dept text, p_line jsonb, p_admin boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare
  v_id uuid := nullif(p_line->>'id', '')::uuid;
  v_old bgt.lines;
  v_type text; v_dept text := p_dept; v_mok text; v_name text; v_row bgt.lines;
  v_added boolean := true;
begin
  if v_id is not null then
    select * into v_old from bgt.lines where id = v_id;
    if not found or v_old.year <> p_year then raise exception 'NOT_FOUND'; end if;
    if not p_admin and v_old.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    v_dept := v_old.dept; v_type := v_old.type;
    v_added := (v_old.base_amount = 0 and v_old.base_calc = '');
  else
    v_type := p_line->>'type';
    if p_admin and coalesce(p_line->>'dept', '') <> '' then v_dept := p_line->>'dept'; end if;
  end if;
  if v_type is null or v_type not in ('세입', '세출') then raise exception 'BAD_TYPE'; end if;
  if not exists (select 1 from bgt.depts where dept = v_dept and active) then raise exception 'BAD_DEPT'; end if;
  if not p_admin then perform bgt.assert_editable(p_year, v_dept, v_type); end if;

  -- 2026 기준 항목의 코드·명칭은 부서가 바꿀 수 없음(양식 불변). 관리자 또는 부서 추가 항목만 변경 가능.
  if v_id is not null and not p_admin and not v_added then
    v_mok := v_old.mok; v_name := v_old.name;
  else
    v_mok := btrim(coalesce(p_line->>'mok', coalesce(v_old.mok, '')));
    v_name := btrim(coalesce(p_line->>'name', coalesce(v_old.name, '')));
  end if;
  if not exists (select 1 from bgt.codes where type = v_type and code = v_mok and level = 'mok' and active) then
    raise exception 'BAD_CODE';
  end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;

  if v_id is null then
    insert into bgt.lines(year, dept, type, mok, name, base_calc, base_amount, forecast, calc, amount, reason, sort, updated_by)
    values (p_year, v_dept, v_type, v_mok, v_name,
            case when p_admin then coalesce(p_line->>'base_calc', '') else '' end,
            case when p_admin then greatest(coalesce(bgt.num(p_line->>'base_amount'), 0), 0) else 0 end,
            bgt.num(p_line->>'forecast'),
            coalesce(p_line->>'calc', ''),
            greatest(coalesce(bgt.num(p_line->>'amount'), 0), 0),
            coalesce(p_line->>'reason', ''),
            coalesce((select max(sort) + 1 from bgt.lines where year = p_year and dept = v_dept and type = v_type), 0),
            p_actor)
    returning * into v_row;
  else
    update bgt.lines set
      mok = v_mok, name = v_name,
      base_calc = case when p_admin and p_line ? 'base_calc' then coalesce(p_line->>'base_calc', '') else base_calc end,
      base_amount = case when p_admin and p_line ? 'base_amount' then greatest(coalesce(bgt.num(p_line->>'base_amount'), 0), 0) else base_amount end,
      forecast = case when p_line ? 'forecast' then bgt.num(p_line->>'forecast') else forecast end,
      calc = case when p_line ? 'calc' then coalesce(p_line->>'calc', '') else calc end,
      amount = case when p_line ? 'amount' then greatest(coalesce(bgt.num(p_line->>'amount'), 0), 0) else amount end,
      reason = case when p_line ? 'reason' then coalesce(p_line->>'reason', '') else reason end,
      updated_at = now(), updated_by = p_actor
    where id = v_id returning * into v_row;
  end if;
  perform bgt.log_add(p_actor, case when v_id is null then 'line_add' else 'line_save' end, v_dept || '/' || v_type || '/' || v_mok,
                      jsonb_build_object('id', v_row.id, 'name', v_row.name, 'amount', v_row.amount, 'forecast', v_row.forecast));
  return to_jsonb(v_row);
end $$;

create or replace function bgt.line_remove(p_id uuid, p_dept text, p_admin boolean, p_actor text)
returns void language plpgsql security definer set search_path = bgt, public as $$
declare v bgt.lines;
begin
  select * into v from bgt.lines where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_admin then
    if v.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    if not (v.base_amount = 0 and v.base_calc = '') then raise exception 'BASE_LINE_PROTECTED'; end if;
    perform bgt.assert_editable(v.year, v.dept, v.type);
  end if;
  delete from bgt.lines where id = p_id;
  perform bgt.log_add(p_actor, 'line_delete', v.dept || '/' || v.type || '/' || v.mok, jsonb_build_object('name', v.name, 'amount', v.amount));
end $$;

create or replace function bgt.spend_upsert(p_line_id uuid, p_entry jsonb, p_dept text, p_admin boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, public as $$
declare v_line bgt.lines; v_id uuid := nullif(p_entry->>'id', '')::uuid; v_row bgt.spend;
begin
  select * into v_line from bgt.lines where id = p_line_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_admin then
    if v_line.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    perform bgt.assert_editable(v_line.year, v_line.dept, v_line.type);
  end if;
  if v_id is null then
    insert into bgt.spend(line_id, spent_on, memo, vendor, amount)
    values (p_line_id, nullif(p_entry->>'spent_on', '')::date, coalesce(p_entry->>'memo', ''), coalesce(p_entry->>'vendor', ''),
            coalesce(bgt.num(p_entry->>'amount'), 0))
    returning * into v_row;
  else
    update bgt.spend set
      spent_on = case when p_entry ? 'spent_on' then nullif(p_entry->>'spent_on', '')::date else spent_on end,
      memo = case when p_entry ? 'memo' then coalesce(p_entry->>'memo', '') else memo end,
      vendor = case when p_entry ? 'vendor' then coalesce(p_entry->>'vendor', '') else vendor end,
      amount = case when p_entry ? 'amount' then coalesce(bgt.num(p_entry->>'amount'), 0) else amount end
    where id = v_id and line_id = p_line_id returning * into v_row;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  perform bgt.log_add(p_actor, 'spend_save', v_line.dept || '/' || v_line.mok, jsonb_build_object('line', v_line.name, 'amount', v_row.amount));
  return to_jsonb(v_row);
end $$;

create or replace function bgt.spend_remove(p_id uuid, p_dept text, p_admin boolean, p_actor text)
returns void language plpgsql security definer set search_path = bgt, public as $$
declare v_line bgt.lines;
begin
  select l.* into v_line from bgt.lines l join bgt.spend s on s.line_id = l.id where s.id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_admin then
    if v_line.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    perform bgt.assert_editable(v_line.year, v_line.dept, v_line.type);
  end if;
  delete from bgt.spend where id = p_id;
  perform bgt.log_add(p_actor, 'spend_delete', v_line.dept || '/' || v_line.mok, jsonb_build_object('line', v_line.name));
end $$;

-- 연도 범위 데이터 묶음 (부서 하나 또는 전체)
create or replace function bgt.bundle(p_year int, p_dept text)
returns jsonb language sql stable security definer set search_path = bgt, public as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(x) from bgt.settings x where x.year = p_year),
    'open', bgt.is_open(p_year),
    'lines', (select coalesce(jsonb_agg(to_jsonb(l) order by l.type, l.mok, l.sort, l.name), '[]'::jsonb)
                from bgt.lines l where l.year = p_year and (p_dept is null or l.dept = p_dept)),
    'spend', (select coalesce(jsonb_agg(to_jsonb(s) order by s.spent_on, s.created_at), '[]'::jsonb)
                from bgt.spend s join bgt.lines l on l.id = s.line_id
               where l.year = p_year and (p_dept is null or l.dept = p_dept)),
    'subs', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
               from bgt.submissions b where b.year = p_year and (p_dept is null or b.dept = p_dept)),
    'caps', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
               from bgt.caps k where k.year = p_year and (p_dept is null or k.dept = p_dept))
  );
$$;

