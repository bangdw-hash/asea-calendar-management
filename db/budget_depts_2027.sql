-- 2027 조직 구성 반영 (한 번 실행). 선행: budget_schema_11.sql
--  공통 · 기획처 · 교육처(교육운영팀/직업훈련팀/온라인평생교육원) · 입학처
--  항공정비계열 · 스마트안전진단계열 · 국방경찰계열 · 항공보안계열
--  기종교육원 · 무인항공교육원 · 군사교육단
-- 목록에 없는 부서 중 데이터(항목)가 있는 부서는 지우지 않고 순서만 뒤로 보냅니다(관리자 「조직 개편」에서 통합·이동).
-- 데이터가 없는 부서(행정관리처·평생교육원·설비교육원)는 사용 안 함으로 둡니다(되돌릴 수 있음).

do $f$
begin
  if exists (select 1 from bgt.depts where dept = '교육지원처') and not exists (select 1 from bgt.depts where dept = '교육처') then
    perform bgt.dept_rename('교육지원처', '교육처', '조직 설정');
  end if;
end $f$;

insert into bgt.depts(dept, sort, active) values ('교육처', 2, true), ('군사교육단', 22, true) on conflict (dept) do nothing;

update bgt.depts set active = true, sort = v.s from (values
  ('공통', 0), ('기획처', 1), ('교육처', 2), ('입학처', 3),
  ('항공정비계열', 10), ('스마트안전진단계열', 11), ('국방경찰계열', 12), ('항공보안계열', 13),
  ('기종교육원', 20), ('무인항공교육원', 21), ('군사교육단', 22)) as v(d, s) where dept = v.d;

update bgt.depts set sub_units = array['교육운영팀', '직업훈련팀', '온라인평생교육원'] where dept = '교육처';

update bgt.depts set sort = v.s from (values ('아세아직업전문학교', 90), ('항공관광계열', 91), ('비행교육원', 92), ('온라인평생교육원', 93)) as v(d, s) where dept = v.d;
update bgt.depts set active = false, sort = 99 where dept in ('행정관리처', '평생교육원', '설비교육원')
  and not exists (select 1 from bgt.lines l where l.dept = depts.dept) and not exists (select 1 from bgt.entries e where e.dept = depts.dept);

-- 2027 조직 개편 예정: 스마트안전진단계열·국방경찰계열이 항공정비계열 아래로 (적용일은 「조직 개편」 탭에서 바꿀 수 있음)
insert into bgt.reorg(kind, src, dst, effective_on, note)
select 'under', s, '항공정비계열', date '2027-01-01', '2027 조직 개편 예정: 항공정비계열 하위로 편입'
  from (values ('스마트안전진단계열'), ('국방경찰계열')) as t(s)
 where not exists (select 1 from bgt.reorg r where r.src = t.s and r.kind = 'under' and r.status = 'planned');
