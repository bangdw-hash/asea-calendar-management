-- =====================================================================
--  아세아항공직업전문학교 기숙사 관리 시스템 — Supabase 스키마
--  실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
--  대상 테이블 12개 + 인덱스 + RLS(Row Level Security)
--
--  [인증 모델]
--   · 관리자/회계  : Supabase Auth(이메일+비밀번호) 로그인 → role = authenticated
--                    → 모든 테이블 전체 CRUD 허용
--   · 입소자/민원 포털 : 비로그인(anon) → 민원 INSERT 등 최소 권한만
--                    → 개인정보(계약/입소자/납부 등)는 anon 직접 조회 불가.
--                       포털 조회는 추후 SECURITY DEFINER RPC로 안전하게 제공.
-- =====================================================================

-- 확장(난수 UUID)
create extension if not exists "pgcrypto";

-- ── 공통: updated_at 자동 갱신 트리거 함수 ───────────────────────────
create or replace function dorm_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- =====================================================================
-- 1) 건물 마스터
-- =====================================================================
create table if not exists dormitory_buildings (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  grade               text,                       -- 등급(A/B/C 또는 자유)
  total_rooms         integer default 0,
  cost_allocation_type text default 'equal',      -- equal(균등) | area(면적비례)
  base_price          integer default 0,          -- 기본 단가(월, 원)
  note                text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- =====================================================================
-- 2) 호실 마스터 (단가 포함)
-- =====================================================================
create table if not exists dormitory_rooms (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references dormitory_buildings(id) on delete cascade,
  room_number   text not null,
  room_type     text default '1인실',            -- 1인실 | 2인실 | 다인실
  area_sqm      numeric(6,2),
  floor         integer,
  grade         text default '일반',             -- 일반 | 프리미엄
  unit_price    integer default 0,               -- 개별 단가(월, 원)
  capacity      integer default 1,
  is_vacant     boolean default true,
  note          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (building_id, room_number)
);

-- =====================================================================
-- 3) 입소자 정보
-- =====================================================================
create table if not exists dormitory_residents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  student_no    text,                             -- 학번/사번
  phone         text,
  birth         date,                             -- 셀프포털 간단 인증용
  email         text,
  note          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 4) 계약 (개별 입력 / xlsx 일괄 / OCR 공통 저장)
-- =====================================================================
create table if not exists dormitory_contracts (
  id              uuid primary key default gen_random_uuid(),
  resident_id     uuid references dormitory_residents(id) on delete set null,
  building_id     uuid references dormitory_buildings(id) on delete set null,
  room_id         uuid references dormitory_rooms(id) on delete set null,
  resident_name   text not null,                  -- 비정규화(빠른 조회/이력 보존)
  student_no      text,
  phone           text,
  start_date      date not null,
  end_date        date not null,
  contract_type   text default '학기별',          -- 월별 | 학기별 | 연간
  unit_price      integer not null default 0,     -- 계약 단가(월, 원)
  deposit         integer default 0,
  attachment_url  text,                           -- 계약서 파일(Storage)
  source          text default 'manual',          -- manual | xlsx | ocr
  status          text default 'active',          -- active | expired | terminated | reserved
  note            text,
  created_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- =====================================================================
-- 5) 납부 이력
-- =====================================================================
create table if not exists dormitory_payments (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid references dormitory_contracts(id) on delete cascade,
  period        text,                             -- 예: 2025-09
  amount        integer not null default 0,
  due_date      date,
  paid_date     date,
  status        text default 'pending',           -- pending | paid | overdue | partial
  method        text,                             -- 수동 | 자동매칭
  note          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 6) 고지서 발행 이력
-- =====================================================================
create table if not exists dormitory_notices (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid references dormitory_contracts(id) on delete cascade,
  notice_no       text,                           -- DRM-YYYY-####
  semester        text,
  amount          integer not null default 0,
  fee_breakdown   jsonb,
  due_date        date,
  issue_date      date default current_date,
  issued_by       text,
  status          text default 'issued',          -- issued | viewed | paid
  sent_at         timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz default now()
);

-- =====================================================================
-- 7) 지출 이력
-- =====================================================================
create table if not exists dormitory_expenses (
  id              uuid primary key default gen_random_uuid(),
  expense_date    date not null default current_date,
  item_name       text not null,
  category        text not null,                  -- 유지보수/관리비/인건비/보험료/행정비용/기타
  amount          integer not null default 0,
  building_id     uuid references dormitory_buildings(id) on delete set null,  -- null=전체공통
  attachment_url  text,
  note            text,
  created_by      text,
  created_at      timestamptz default now()
);

-- =====================================================================
-- 8) 단가 변경 이력 (audit log)
-- =====================================================================
create table if not exists dormitory_price_history (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid references dormitory_rooms(id) on delete cascade,
  building_id   uuid references dormitory_buildings(id) on delete set null,
  old_price     integer,
  new_price     integer,
  semester      text,
  reason        text,
  changed_by    text,
  created_at    timestamptz default now()
);

-- =====================================================================
-- 9) 민원 접수
-- =====================================================================
create table if not exists dormitory_complaints (
  id              uuid primary key default gen_random_uuid(),
  ticket_no       text unique,                    -- 접수번호
  resident_name   text,
  student_no      text,
  room_label      text,                           -- 예: A동 201호
  title           text not null,
  category        text,
  content         text,
  attachment_url  text,
  status          text default 'received',        -- received | in_progress | done
  assignee        text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- =====================================================================
-- 10) 민원 댓글
-- =====================================================================
create table if not exists dormitory_complaint_comments (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid references dormitory_complaints(id) on delete cascade,
  author        text,
  body          text,
  attachment_url text,
  created_at    timestamptz default now()
);

-- =====================================================================
-- 11) OCR 처리 로그
-- =====================================================================
create table if not exists dormitory_ocr_logs (
  id            uuid primary key default gen_random_uuid(),
  image_url     text,
  result_json   jsonb,
  success       boolean default false,
  error_message text,
  created_by    text,
  created_at    timestamptz default now()
);

-- =====================================================================
-- 12) 단가 역산 계산 이력
-- =====================================================================
create table if not exists dormitory_price_calc_logs (
  id            uuid primary key default gen_random_uuid(),
  semester      text,
  input_json    jsonb,                            -- 수입/지출/목표손익/예상인원 등
  result_json   jsonb,                            -- 평균단가/인상률/추천단가 등
  confirmed     boolean default false,
  created_by    text,
  created_at    timestamptz default now()
);

-- ── updated_at 트리거 부착 ──────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'dormitory_buildings','dormitory_rooms','dormitory_residents',
    'dormitory_contracts','dormitory_payments','dormitory_complaints'
  ] loop
    execute format('drop trigger if exists trg_%1$s_upd on %1$s;', t);
    execute format('create trigger trg_%1$s_upd before update on %1$s
                    for each row execute function dorm_set_updated_at();', t);
  end loop;
end $$;

-- ── 인덱스 ──────────────────────────────────────────────────────────
create index if not exists idx_rooms_building     on dormitory_rooms(building_id);
create index if not exists idx_rooms_vacant        on dormitory_rooms(is_vacant);
create index if not exists idx_contracts_building   on dormitory_contracts(building_id);
create index if not exists idx_contracts_room       on dormitory_contracts(room_id);
create index if not exists idx_contracts_status     on dormitory_contracts(status);
create index if not exists idx_contracts_dates      on dormitory_contracts(start_date, end_date);
create index if not exists idx_payments_contract    on dormitory_payments(contract_id);
create index if not exists idx_payments_status      on dormitory_payments(status, due_date);
create index if not exists idx_notices_contract     on dormitory_notices(contract_id);
create index if not exists idx_notices_semester     on dormitory_notices(semester);
create index if not exists idx_expenses_date        on dormitory_expenses(expense_date);
create index if not exists idx_expenses_category    on dormitory_expenses(category);
create index if not exists idx_pricehist_room       on dormitory_price_history(room_id);
create index if not exists idx_complaints_status    on dormitory_complaints(status);
create index if not exists idx_complaints_ticket    on dormitory_complaints(ticket_no);
create index if not exists idx_comments_complaint   on dormitory_complaint_comments(complaint_id);

-- =====================================================================
--  RLS (Row Level Security)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'dormitory_buildings','dormitory_rooms','dormitory_residents','dormitory_contracts',
    'dormitory_payments','dormitory_notices','dormitory_expenses','dormitory_price_history',
    'dormitory_complaints','dormitory_complaint_comments','dormitory_ocr_logs','dormitory_price_calc_logs'
  ] loop
    execute format('alter table %s enable row level security;', t);
    -- 관리자(Supabase Auth 로그인) = authenticated → 전체 CRUD
    execute format('drop policy if exists %1$s_admin_all on %1$s;', t);
    execute format($f$create policy %1$s_admin_all on %1$s
                      for all to authenticated using (true) with check (true);$f$, t);
  end loop;
end $$;

-- 입소자/민원 포털(비로그인 anon) — 최소 권한
--  · 민원 접수: anon INSERT 허용 (개인정보 조회는 불가)
drop policy if exists dormitory_complaints_anon_insert on dormitory_complaints;
create policy dormitory_complaints_anon_insert on dormitory_complaints
  for insert to anon with check (true);

--  ※ 입소자 셀프 조회(계약/납부/민원 현황)는 폼 입력값(학번+생년월일)을
--     검증하는 SECURITY DEFINER RPC로 안전하게 제공할 예정(포털 단계).
--     anon 에 직접 SELECT 권한을 주지 않아 개인정보 노출을 방지한다.

-- =====================================================================
--  Storage (수동 1회): 대시보드 → Storage 에서 버킷 생성 권장
--   · dorm-contracts (계약서)   · dorm-receipts (지출 증빙)
--   · dorm-ocr (OCR 원본)       · dorm-complaints (민원 첨부)
-- =====================================================================
-- 끝
