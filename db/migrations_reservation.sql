-- ============================================================================
-- reservation.html — 대관예약/대관업체 관리/대관료 청구 관리 마이그레이션 (Supabase)
-- 프로젝트: zbpeyklwpotjyveipzxd
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
-- 안전: 모두 IF NOT EXISTS / idempotent. 여러 번 실행해도 안전합니다.
--
-- 전제: classrooms(id, name, floor, color, active, ...), reservations(id, ...)
-- 테이블은 이미 운영 중인 Supabase 프로젝트에 존재합니다(이 저장소에는 최초
-- 생성 스크립트가 없어 여기서는 새로 만들지 않고 컬럼만 확장합니다).
-- ============================================================================

-- 0) 공통: updated_at 자동 갱신 함수 (이미 있으면 재사용) --------------------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- 1) rental_companies — 대관업체(사업자) 정보 ---------------------------------
create table if not exists rental_companies (
  id            bigint generated always as identity primary key,
  biz_name      text not null,             -- 사업자(법인)명
  biz_reg_no    text,                      -- 사업자등록번호
  corp_reg_no   text,                      -- 법인등록번호 (법인인 경우)
  contact_name  text,                      -- 담당자 이름
  contact_phone text,                      -- 담당자 연락처
  invoice_email text,                      -- 전자계산서 발행 이메일
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_rental_companies_name on rental_companies(biz_name);
drop trigger if exists trg_rental_companies_updated on rental_companies;
create trigger trg_rental_companies_updated before update on rental_companies
  for each row execute function set_updated_at();

-- 2) reservations — 대관예약 관련 컬럼 확장 -----------------------------------
alter table reservations add column if not exists is_rental boolean default false;
alter table reservations add column if not exists rental_company_id bigint references rental_companies(id);
alter table reservations add column if not exists rental_company_name text;
alter table reservations add column if not exists course_name text;
alter table reservations add column if not exists daily_fee numeric;
alter table reservations add column if not exists billing_status text default 'pending';
alter table reservations add column if not exists billed_at timestamptz;

create index if not exists idx_reservations_rental_company on reservations(rental_company_id);
create index if not exists idx_reservations_course_name on reservations(course_name);

-- 3) RLS — 기존 프로젝트와 동일한 사내 익명 키(anon) 기반 단계 정책 -----------
--    (reservations 자체의 관리자 삭제/수정은 기존 RPC가 담당하며, 여기서는
--    신규 테이블 rental_companies 에 대해서만 정책을 추가합니다. 관리자 화면
--    노출 여부는 프론트엔드의 adminEmail 검증으로 제어됩니다.)
alter table rental_companies enable row level security;

do $$
begin
  execute 'drop policy if exists rental_companies_all on rental_companies;';
  execute 'create policy rental_companies_all on rental_companies for all using (true) with check (true);';
end $$;

-- 끝. 'Success. No rows returned' 가 나오면 정상입니다.
