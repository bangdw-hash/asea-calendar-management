-- =====================================================================
--  기숙사 추가 필드 마이그레이션 (계열/학년/학기/데모 구분)
--  이미 dormitory/schema.sql 을 실행한 기존 DB에서 1회 실행하세요.
--  (Supabase → SQL Editor → 붙여넣고 Run)
-- =====================================================================
alter table dormitory_buildings  add column if not exists is_demo boolean default false;
alter table dormitory_rooms      add column if not exists is_demo boolean default false;
alter table dormitory_residents  add column if not exists is_demo boolean default false;
alter table dormitory_residents  add column if not exists department text;
alter table dormitory_residents  add column if not exists grade int;
alter table dormitory_contracts  add column if not exists is_demo boolean default false;
alter table dormitory_contracts  add column if not exists department text;
alter table dormitory_contracts  add column if not exists grade int;
alter table dormitory_contracts  add column if not exists semester text;
alter table dormitory_expenses   add column if not exists is_demo boolean default false;

create index if not exists idx_contracts_demo     on dormitory_contracts(is_demo);
create index if not exists idx_contracts_dept      on dormitory_contracts(department);
create index if not exists idx_contracts_semester  on dormitory_contracts(semester);
-- 끝
