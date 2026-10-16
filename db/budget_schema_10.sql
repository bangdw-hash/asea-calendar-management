-- 부서 예산안 스키마 10: 입력판 — 내년 계획 통합 반영 + 시험용 연도(1999)
-- 선행: budget_schema_1~9.sql. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
--  * 내년 계획: 같은 코드(목)에 여러 건을 적어도 코드는 늘어나지 않고, 한 항목(코드 이름)으로 합쳐 반영됩니다.
--    (명칭이 같은 기존 항목이 있으면 그 항목에 합산) 항목 금액 = 연결된 입력 줄의 합계, 산출식 = 줄별 내용·금액·산출 근거 요약
--  * 시험용 연도 1999: 실제 예산과 분리된 연습 공간(입력판 주소에 &test=1). 부서가 직접 초기화할 수 있습니다.

insert into bgt.settings(year, base_year, status, note)
values (1999, 1998, 'open', '시험용 연도: 실제 예산과 분리된 연습 공간입니다.')
on conflict (year) do nothing;

-- 항목 하나에 연결된 내년 계획 줄을 합쳐 금액·산출식을 다시 만듭니다.
create or replace function bgt.entry_line_recalc(p_line uuid, p_actor text)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare l bgt.lines; n int; v_amt bigint; v_calc text;
begin
  select * into l from bgt.lines where id = p_line;
  if not found then return; end if;
  select count(*), coalesce(sum(amount), 0),
         string_agg(case when memo <> '' then memo || ' ' else '' end || to_char(amount, 'FM999,999,999,999') || '원' || case when calc <> '' then ' (' || calc || ')' else '' end, ' / ' order by sort)
    into n, v_amt, v_calc
    from bgt.entries where line_id = p_line and phase = 'plan' and deleted_at is null;
  if n = 0 then
    if l.updated_by like 'e:%' and l.base_amount = 0 and l.base_calc = ''
       and not exists (select 1 from bgt.spend where line_id = l.id)
       and not exists (select 1 from bgt.entries x where x.line_id = l.id and x.deleted_at is null) then
      perform bgt.line_remove(l.id, l.dept, true, 'e:자동');
    else
      update bgt.lines set amount = 0, calc = '', updated_at = now() where id = l.id;
    end if;
    return;
  end if;
  perform bgt.line_upsert(l.year, l.dept, jsonb_build_object('id', l.id, 'amount', v_amt, 'calc', case when n = 1 then coalesce((select calc from bgt.entries where line_id = p_line and phase = 'plan' and deleted_at is null limit 1), '') else left(v_calc, 1000) end), true, 'e:' || coalesce(nullif(p_actor, ''), '자동'));
end $f$;

create or replace function bgt.entry_unsync(e bgt.entries, p_actor text)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare l bgt.lines; v_old uuid := e.line_id;
begin
  if e.spend_id is not null and exists (select 1 from bgt.spend where id = e.spend_id) then
    perform bgt.spend_remove(e.spend_id, e.dept, true, p_actor);
  end if;
  update bgt.entries set line_id = null, spend_id = null where id = e.id;
  if v_old is null then return; end if;
  if e.phase = 'plan' then
    perform bgt.entry_line_recalc(v_old, p_actor);
  else
    select * into l from bgt.lines where id = v_old;
    if found and l.updated_by like 'e:%' and l.base_amount = 0 and l.base_calc = ''
       and not exists (select 1 from bgt.spend where line_id = l.id)
       and not exists (select 1 from bgt.entries x where x.line_id = l.id and x.deleted_at is null) then
      perform bgt.line_remove(l.id, e.dept, true, p_actor);
    end if;
  end if;
end $f$;

create or replace function bgt.entry_sync(p_id uuid, p_actor text)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare e bgt.entries; l bgt.lines; v_lid uuid; v_old uuid; v_sid uuid; v jsonb; v_name text; v_cn text; sp bgt.spend;
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
    v_old := e.line_id;
    update bgt.entries set line_id = v_lid, spend_id = (v->>'id')::uuid where id = e.id;
    if v_old is not null and v_old <> v_lid then
      select * into l from bgt.lines where id = v_old;
      if found and l.updated_by like 'e:%' and l.base_amount = 0 and l.base_calc = ''
         and not exists (select 1 from bgt.spend where line_id = l.id)
         and not exists (select 1 from bgt.entries x where x.line_id = l.id and x.deleted_at is null) then
        perform bgt.line_remove(l.id, e.dept, true, p_actor);
      end if;
    end if;
  else
    -- 내년 계획: ① 이미 연결된 항목 → ② 명칭이 같은(또는 AI가 짚은) 기존 항목 → ③ 코드 이름으로 통합 항목(없으면 생성)
    v_name := left(btrim(e.memo), 120);
    v_old := e.line_id; v_lid := null;
    if v_old is not null then
      select * into l from bgt.lines where id = v_old;
      if found and l.mok = e.mok and l.type = e.type then v_lid := l.id; end if;
    end if;
    if v_lid is null then
      select id into v_lid from bgt.lines
       where year = e.year and dept = e.dept and type = e.type and mok = e.mok and ((v_name <> '' and name = v_name) or name = nullif(e.line_hint, ''))
       order by (case when name = v_name then 0 else 1 end), sort limit 1;
    end if;
    if v_lid is null then
      select id into v_lid from bgt.lines where year = e.year and dept = e.dept and type = e.type and mok = e.mok and name = v_cn and updated_by like 'e:%' order by sort limit 1;
    end if;
    if v_lid is null then
      v := bgt.line_upsert(e.year, e.dept, jsonb_build_object('type', e.type, 'mok', e.mok, 'name', v_cn), true, 'e:' || p_actor);
      v_lid := (v->>'id')::uuid;
    end if;
    update bgt.entries set line_id = v_lid where id = e.id;
    perform bgt.entry_line_recalc(v_lid, p_actor);
    if v_old is not null and v_old <> v_lid then perform bgt.entry_line_recalc(v_old, p_actor); end if;
  end if;
end $f$;

-- 시험용 연도(1999)의 내 부서 데이터를 지우고, 실제 연도의 항목을 복사해 처음 상태로 돌립니다.
create or replace function public.bgt_e_test_reset(p_token text, p_src_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token); n int; r record;
begin
  if v is null or v.role <> 'dept' then raise exception 'AUTH_REQUIRED'; end if;
  for r in select id from bgt.entries where year = 1999 and dept = v.dept loop delete from bgt.entries where id = r.id; end loop;
  for r in select s.id from bgt.spend s join bgt.lines l on l.id = s.line_id where l.year = 1999 and l.dept = v.dept loop delete from bgt.spend where id = r.id; end loop;
  for r in select id from bgt.lines where year = 1999 and dept = v.dept loop delete from bgt.lines where id = r.id; end loop;
  insert into bgt.lines(year, dept, type, mok, name, base_calc, base_amount, sort, updated_by)
  select 1999, dept, type, mok, name, base_calc, base_amount, sort, 'test' from bgt.lines where year = p_src_year and dept = v.dept;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'lines', n);
end $f$;

revoke all on function public.bgt_e_test_reset(text, integer) from public;
grant execute on function public.bgt_e_test_reset(text, integer) to anon, authenticated;
