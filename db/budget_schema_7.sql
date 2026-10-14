-- 부서 예산안 스키마 7/7: 부서별 엑셀 양식 일괄 반영
-- 선행: budget_schema_1~4.sql. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
-- 관리자가 부서들이 엑셀로 작성해 온 요구액·산출 근거·증감 사유·연말 추정을 한 번에 반영합니다.
--  * 기존 항목(id 있음)은 amount/calc/reason/forecast 만 바뀝니다. 코드·명칭·전년 예산은 엑셀로 바꿀 수 없습니다.
--  * id 없는 줄은 부서가 추가한 신규 항목으로 만들어집니다(코드표에 있는 목만 허용).
--  * 한 건이라도 오류가 나면 전체가 취소됩니다(원자적). 변경 전후 금액은 bgt.log(xlsx_import)에 남습니다.

create or replace function public.bgt_a_lines_import(p_token text, p_year int, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
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
      perform bgt.line_upsert(p_year, null, jsonb_build_object('id', l.id) || (it - 'id' - 'dept' - 'type' - 'mok' - 'name'), true, '관리자(엑셀)');
      changed := changed || jsonb_build_array(jsonb_build_object('id', l.id, 'dept', l.dept, 'mok', l.mok, 'name', l.name, 'old', l.amount, 'new', coalesce(new_amt, l.amount)));
      n_upd := n_upd + 1;
    else
      perform bgt.line_upsert(p_year, null, jsonb_build_object('type', it->>'type', 'dept', it->>'dept', 'mok', it->>'mok', 'name', it->>'name',
              'amount', it->>'amount', 'calc', coalesce(it->>'calc', ''), 'reason', coalesce(it->>'reason', ''), 'forecast', it->>'forecast'), true, '관리자(엑셀)');
      changed := changed || jsonb_build_array(jsonb_build_object('id', null, 'dept', it->>'dept', 'mok', it->>'mok', 'name', it->>'name', 'old', null, 'new', bgt.num(it->>'amount')));
      n_new := n_new + 1;
    end if;
  end loop;
  perform bgt.log_add('admin', 'xlsx_import', p_year::text, jsonb_build_object('updated', n_upd, 'created', n_new, 'unchanged', n_same, 'changes', changed));
  return jsonb_build_object('ok', true, 'updated', n_upd, 'created', n_new, 'unchanged', n_same);
end $$;

revoke all on all functions in schema bgt from public, anon, authenticated;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'bgt\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
