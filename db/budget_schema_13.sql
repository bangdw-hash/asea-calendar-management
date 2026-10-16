-- 부서 예산안 스키마 13: 시험 링크 2종 분리 — 작성용(1999) / 편성 완료 후 사용(집행·결재 QR)용(1998)
-- 선행: budget_schema_1~12.sql. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
--  * 1999 = 작성용 시험(입력판·예산안 작성), 1998 = 편성 완료 후 사용 시험(최종 확정 상태, 지출 요청 QR·집행 반영)
--  * 두 연도는 서로 독립이며 실제 연도의 합계·조회에 섞이지 않습니다.

insert into bgt.settings(year, base_year, status, note)
values (1998, 1997, 'finalized', '시험용 연도(편성 완료 후 사용): 결재 QR·집행 반영을 연습하는 공간입니다. 실제 예산과 분리됩니다.')
on conflict (year) do nothing;

-- p_year: 1999(작성용) 또는 1998(편성 완료 후 사용). 내 부서의 시험 자료를 비우고 실제 연도 항목을 복사합니다.
create or replace function public.bgt_e_test_reset2(p_token text, p_src_year int, p_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $f$
declare v bgt.sessions := bgt.try_sess(p_token); n int; r record;
begin
  if v is null or v.role <> 'dept' then raise exception 'AUTH_REQUIRED'; end if;
  if p_year not in (1998, 1999) or p_src_year is null or p_src_year <= 2000 then raise exception 'BAD_YEAR'; end if;
  for r in select id from bgt.tickets where year = p_year and dept = v.dept loop delete from bgt.tickets where id = r.id; end loop;
  for r in select id from bgt.entries where year = p_year and dept = v.dept loop delete from bgt.entries where id = r.id; end loop;
  for r in select s.id from bgt.spend s join bgt.lines l on l.id = s.line_id where l.year = p_year and l.dept = v.dept loop delete from bgt.spend where id = r.id; end loop;
  for r in select id from bgt.lines where year = p_year and dept = v.dept loop delete from bgt.lines where id = r.id; end loop;
  insert into bgt.lines(year, dept, type, mok, name, base_calc, base_amount, amount, sort, updated_by)
  select p_year, dept, type, mok, name, base_calc, base_amount, case when p_year = 1998 then base_amount else 0 end, sort, 'test' from bgt.lines where year = p_src_year and dept = v.dept;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'lines', n, 'year', p_year);
end $f$;

revoke all on function public.bgt_e_test_reset2(text, integer, integer) from public;
grant execute on function public.bgt_e_test_reset2(text, integer, integer) to anon, authenticated;
