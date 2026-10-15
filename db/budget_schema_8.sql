-- 부서 예산안 스키마 8/8: 엑셀 양식 확장 (올해 집행 건별 내역 + 신규 항목의 전년 예산)
-- 선행: budget_schema_1~4.sql, 5(지출 이력 함수), 7. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
--  * bgt_a_lines_import  : 신규 항목에 전년 예산(base_amount)·전년 산출식(base_calc)도 받도록 확장
--  * bgt_a_spend_import  : 올해 집행(수납) 건별 내역을 일괄 반영 (id 있으면 수정, 없으면 추가, 오류 시 전체 취소)
--    지출 변경은 bgt.spend_upsert 를 거치므로 변경 전후 값이 bgt.log 에 남습니다.

create or replace function public.bgt_a_lines_import(p_token text, p_year int, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare
  it jsonb; l bgt.lines; st text; n_upd int := 0; n_new int := 0; n_same int := 0; changed jsonb := '[]'::jsonb; new_amt bigint;
begin
  perform bgt.sess(p_token, 'admin');
  select status into st from bgt.settings where year = p_year;
  if st = 'finalized' then raise exception 'FINALIZED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'LINES_REQUIRED'; end if;
  if jsonb_array_length(p_items) > 2000 then raise exception 'TOO_MANY_LINES'; end if;

  for it in select x from jsonb_array_elements(p_items) x loop
    if nullif(it->>'id', '') is not null then
      select * into l from bgt.lines where id = (it->>'id')::uuid and year = p_year;
      if not found then raise exception 'NOT_FOUND'; end if;
      new_amt := bgt.num(it->>'amount');
      if (new_amt is null or new_amt = l.amount)
         and (not it ? 'calc' or l.calc = coalesce(it->>'calc', ''))
         and (not it ? 'reason' or l.reason = coalesce(it->>'reason', ''))
         and (not it ? 'forecast' or l.forecast is not distinct from bgt.num(it->>'forecast')) then
        n_same := n_same + 1; continue;
      end if;
      perform bgt.line_upsert(p_year, null, jsonb_build_object('id', l.id) || (it - 'id' - 'dept' - 'type' - 'mok' - 'name' - 'base_amount' - 'base_calc'), true, '관리자(엑셀)');
      changed := changed || jsonb_build_array(jsonb_build_object('id', l.id, 'dept', l.dept, 'mok', l.mok, 'name', l.name, 'old', l.amount, 'new', coalesce(new_amt, l.amount)));
      n_upd := n_upd + 1;
    else
      perform bgt.line_upsert(p_year, null, jsonb_build_object('type', it->>'type', 'dept', it->>'dept', 'mok', it->>'mok', 'name', it->>'name',
              'amount', it->>'amount', 'calc', coalesce(it->>'calc', ''), 'reason', coalesce(it->>'reason', ''), 'forecast', it->>'forecast',
              'base_amount', it->>'base_amount', 'base_calc', coalesce(it->>'base_calc', '')), true, '관리자(엑셀)');
      changed := changed || jsonb_build_array(jsonb_build_object('id', null, 'dept', it->>'dept', 'mok', it->>'mok', 'name', it->>'name', 'old', null, 'new', bgt.num(it->>'amount')));
      n_new := n_new + 1;
    end if;
  end loop;
  perform bgt.log_add('admin', 'xlsx_import', p_year::text, jsonb_build_object('updated', n_upd, 'created', n_new, 'unchanged', n_same, 'changes', changed));
  return jsonb_build_object('ok', true, 'updated', n_upd, 'created', n_new, 'unchanged', n_same);
end $f$;

create or replace function public.bgt_a_spend_import(p_token text, p_year int, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare
  it jsonb; l bgt.lines; entry jsonb; n_new int := 0; n_upd int := 0;
begin
  perform bgt.sess(p_token, 'admin');
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'LINES_REQUIRED'; end if;
  if jsonb_array_length(p_items) > 5000 then raise exception 'TOO_MANY_LINES'; end if;
  for it in select x from jsonb_array_elements(p_items) x loop
    select * into l from bgt.lines where id = nullif(it->>'line_id', '')::uuid and year = p_year;
    if not found then raise exception 'NOT_FOUND'; end if;
    if bgt.num(it->>'amount') is null or bgt.num(it->>'amount') < 0 then raise exception 'AMOUNT_INVALID'; end if;
    entry := jsonb_build_object('spent_on', it->>'spent_on', 'memo', coalesce(it->>'memo', ''), 'vendor', coalesce(it->>'vendor', ''), 'amount', it->>'amount');
    if nullif(it->>'id', '') is not null then
      entry := entry || jsonb_build_object('id', it->>'id'); n_upd := n_upd + 1;
    else
      n_new := n_new + 1;
    end if;
    perform bgt.spend_upsert(l.id, entry, null, true, '관리자(엑셀)');
  end loop;
  perform bgt.log_add('admin', 'xlsx_spend_import', p_year::text, jsonb_build_object('created', n_new, 'updated', n_upd));
  return jsonb_build_object('ok', true, 'created', n_new, 'updated', n_upd);
end $f$;

revoke all on function public.bgt_a_lines_import(text,integer,jsonb) from public;
revoke all on function public.bgt_a_spend_import(text,integer,jsonb) from public;
grant execute on function public.bgt_a_lines_import(text,integer,jsonb) to anon, authenticated;
grant execute on function public.bgt_a_spend_import(text,integer,jsonb) to anon, authenticated;
