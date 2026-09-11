-- ============================================================================
-- reservation.html — 강의실 예약/대관예약/대관업체 관리/대관료 청구 관리
-- 프로젝트: zbpeyklwpotjyveipzxd
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
-- 안전: 모두 IF NOT EXISTS / create or replace — 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 0) 공통: updated_at 자동 갱신 함수 ------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ============================================================================
-- 1) classrooms — 강의실 목록
-- ============================================================================
create table if not exists classrooms (
  id         bigint generated always as identity primary key,
  name       text not null,
  floor      text default '1',
  color      text default '#1A73E8',
  active     boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_classrooms_active on classrooms(active, floor, name);
drop trigger if exists trg_classrooms_updated on classrooms;
create trigger trg_classrooms_updated before update on classrooms
  for each row execute function set_updated_at();

alter table classrooms enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='classrooms' and policyname='classrooms_all') then
    execute 'create policy classrooms_all on classrooms for all using (true) with check (true);';
  end if;
end $$;

-- ============================================================================
-- 2) reservations — 기본 테이블 (없으면 생성)
-- ============================================================================
create table if not exists reservations (
  id               bigint generated always as identity primary key,
  classroom_name   text not null,
  classroom_color  text default '#1A73E8',
  date_start       date not null,
  date_end         date not null,
  time_start       time not null,
  time_end         time not null,
  purpose          text,
  department       text,
  requester_name   text,
  contact          text,
  raw_input        text,
  formatted_label  text,
  password_hash    text,
  status           text default 'active',
  deleted_at       timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
drop trigger if exists trg_reservations_updated on reservations;
create trigger trg_reservations_updated before update on reservations
  for each row execute function set_updated_at();

alter table reservations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='reservations' and policyname='reservations_all') then
    execute 'create policy reservations_all on reservations for all using (true) with check (true);';
  end if;
end $$;

-- 2-b) 대관예약 확장 컬럼 추가 (기존 테이블에도 idempotent 적용) ---------------
--      ★ 인덱스 생성은 컬럼 추가 이후에 해야 하므로 아래에서 처리합니다.
alter table reservations add column if not exists classroom_color      text;
alter table reservations add column if not exists raw_input            text;
alter table reservations add column if not exists formatted_label      text;
alter table reservations add column if not exists contact              text;
alter table reservations add column if not exists deleted_at           timestamptz;
alter table reservations add column if not exists is_rental            boolean default false;
alter table reservations add column if not exists rental_company_id    bigint;
alter table reservations add column if not exists rental_company_name  text;
alter table reservations add column if not exists course_name          text;
alter table reservations add column if not exists daily_fee            numeric;
alter table reservations add column if not exists billing_status       text default 'pending';
alter table reservations add column if not exists billed_at            timestamptz;
alter table reservations add column if not exists schedule_event_id    text;

-- 인덱스는 컬럼 추가 후에 생성 ---------------------------------------------------
create index if not exists idx_reservations_dates  on reservations(date_start, date_end);
create index if not exists idx_reservations_status on reservations(status, deleted_at);
create index if not exists idx_reservations_rental on reservations(rental_company_id);

-- ============================================================================
-- 3) rental_companies — 대관업체(사업자) 정보
-- ============================================================================
create table if not exists rental_companies (
  id            bigint generated always as identity primary key,
  biz_name      text not null,
  biz_reg_no    text,
  corp_reg_no   text,
  contact_name  text,
  contact_phone text,
  invoice_email text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_rental_companies_name on rental_companies(biz_name);
drop trigger if exists trg_rental_companies_updated on rental_companies;
create trigger trg_rental_companies_updated before update on rental_companies
  for each row execute function set_updated_at();

alter table rental_companies enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='rental_companies' and policyname='rental_companies_all') then
    execute 'create policy rental_companies_all on rental_companies for all using (true) with check (true);';
  end if;
end $$;

-- ============================================================================
-- 4) RPC: 예약 충돌 확인
-- ============================================================================
create or replace function check_room_conflict(
  p_classroom_name text,
  p_date_start     date,
  p_date_end       date,
  p_time_start     time,
  p_time_end       time,
  p_exclude_id     bigint default null
) returns jsonb language plpgsql security definer as $$
declare v_conflicts jsonb; begin
  select jsonb_agg(jsonb_build_object(
    'id',             r.id,
    'date_start',     r.date_start,
    'date_end',       r.date_end,
    'time_start',     r.time_start,
    'time_end',       r.time_end,
    'requester_name', r.requester_name,
    'department',     r.department,
    'contact',        r.contact
  )) into v_conflicts
  from reservations r
  where r.classroom_name = p_classroom_name
    and r.status = 'active'
    and r.deleted_at is null
    and r.date_start <= p_date_end
    and r.date_end   >= p_date_start
    and r.time_start <  p_time_end
    and r.time_end   >  p_time_start
    and (p_exclude_id is null or r.id <> p_exclude_id);
  return jsonb_build_object('conflict', v_conflicts is not null, 'conflicts', coalesce(v_conflicts, '[]'::jsonb));
end; $$;

-- ============================================================================
-- 5) RPC: 비밀번호 확인 후 삭제 (일반 사용자)
-- ============================================================================
create or replace function delete_reservation(
  p_id bigint, p_password_hash text
) returns jsonb language plpgsql security definer as $$
declare v_hash text; begin
  select password_hash into v_hash from reservations where id = p_id and deleted_at is null;
  if not found then return jsonb_build_object('success', false, 'error', '예약을 찾을 수 없습니다'); end if;
  if v_hash is distinct from p_password_hash then
    return jsonb_build_object('success', false, 'error', '비밀번호가 일치하지 않습니다');
  end if;
  update reservations set deleted_at = now(), status = 'deleted' where id = p_id;
  return jsonb_build_object('success', true);
end; $$;

-- ============================================================================
-- 6) RPC: 비밀번호 확인 후 수정 (일반 사용자)
-- ============================================================================
create or replace function modify_reservation(
  p_id bigint, p_password_hash text,
  p_date_start date, p_date_end date,
  p_time_start time, p_time_end time,
  p_purpose text, p_department text, p_requester_name text,
  p_contact text default null, p_formatted_label text default null
) returns jsonb language plpgsql security definer as $$
declare v_hash text; begin
  select password_hash into v_hash from reservations where id = p_id and deleted_at is null;
  if not found then return jsonb_build_object('success', false, 'error', '예약을 찾을 수 없습니다'); end if;
  if v_hash is distinct from p_password_hash then
    return jsonb_build_object('success', false, 'error', '비밀번호가 일치하지 않습니다');
  end if;
  update reservations set
    date_start = p_date_start, date_end = p_date_end,
    time_start = p_time_start, time_end = p_time_end,
    purpose = p_purpose, department = p_department, requester_name = p_requester_name,
    contact = p_contact, formatted_label = coalesce(p_formatted_label, formatted_label)
  where id = p_id;
  return jsonb_build_object('success', true);
end; $$;

-- ============================================================================
-- 7) RPC: 관리자 수정
-- ============================================================================
create or replace function admin_modify_reservation(
  p_id bigint, p_admin_email text,
  p_date_start date, p_date_end date,
  p_time_start time, p_time_end time,
  p_purpose text, p_department text, p_requester_name text,
  p_contact text default null, p_formatted_label text default null
) returns jsonb language plpgsql security definer as $$
begin
  if p_admin_email not in ('bangdw@gmail.com') then
    return jsonb_build_object('success', false, 'error', '관리자 권한이 없습니다');
  end if;
  update reservations set
    date_start = p_date_start, date_end = p_date_end,
    time_start = p_time_start, time_end = p_time_end,
    purpose = p_purpose, department = p_department, requester_name = p_requester_name,
    contact = p_contact, formatted_label = coalesce(p_formatted_label, formatted_label)
  where id = p_id and deleted_at is null;
  if not found then return jsonb_build_object('success', false, 'error', '예약을 찾을 수 없습니다'); end if;
  return jsonb_build_object('success', true);
end; $$;

-- ============================================================================
-- 8) RPC: 관리자 삭제
-- ============================================================================
create or replace function admin_delete_reservation(
  p_id bigint, p_admin_email text
) returns jsonb language plpgsql security definer as $$
begin
  if p_admin_email not in ('bangdw@gmail.com') then
    return jsonb_build_object('success', false, 'error', '관리자 권한이 없습니다');
  end if;
  update reservations set deleted_at = now(), status = 'deleted' where id = p_id;
  if not found then return jsonb_build_object('success', false, 'error', '예약을 찾을 수 없습니다'); end if;
  return jsonb_build_object('success', true);
end; $$;

-- ============================================================================
-- 9) RPC: 학교일정 연동 / 해제
-- ============================================================================
create or replace function link_to_schedule(
  p_reservation_id bigint, p_admin_email text
) returns jsonb language plpgsql security definer as $$
begin
  if p_admin_email not in ('bangdw@gmail.com') then
    return jsonb_build_object('success', false, 'error', '관리자 권한이 없습니다');
  end if;
  update reservations set schedule_event_id = 'linked-' || p_reservation_id::text
  where id = p_reservation_id and deleted_at is null;
  if not found then return jsonb_build_object('success', false, 'error', '예약을 찾을 수 없습니다'); end if;
  return jsonb_build_object('success', true);
end; $$;

create or replace function unlink_from_schedule(
  p_reservation_id bigint, p_admin_email text
) returns jsonb language plpgsql security definer as $$
begin
  if p_admin_email not in ('bangdw@gmail.com') then
    return jsonb_build_object('success', false, 'error', '관리자 권한이 없습니다');
  end if;
  update reservations set schedule_event_id = null
  where id = p_reservation_id and deleted_at is null;
  if not found then return jsonb_build_object('success', false, 'error', '예약을 찾을 수 없습니다'); end if;
  return jsonb_build_object('success', true);
end; $$;

-- ============================================================================
-- 10) rv_field_history — 사용 목적/과정명 히스토리 (크로스 디바이스)
-- ============================================================================
create table if not exists rv_field_history (
  id         bigint generated always as identity primary key,
  field_key  text not null,
  value      text not null,
  last_used  timestamptz default now(),
  constraint rv_field_history_unique unique (field_key, value)
);
create index if not exists idx_rv_field_history_key on rv_field_history(field_key, last_used desc);
alter table rv_field_history enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='rv_field_history' and policyname='rv_field_history_all') then
    execute 'create policy rv_field_history_all on rv_field_history for all using (true) with check (true);';
  end if;
end $$;

-- ============================================================================
-- 11) reservations — 비고란 컬럼 추가 (방문자 이름, 차량 번호, 비고)
-- ============================================================================
alter table reservations add column if not exists visitor_names    text;
alter table reservations add column if not exists vehicle_numbers  text;
alter table reservations add column if not exists notes            text;

-- ============================================================================
-- 12) classrooms — category 컬럼 추가 (기존 DB에 NOT NULL로 추가된 경우 대비)
-- ============================================================================
alter table classrooms add column if not exists category text default '강의실';
update classrooms set category = '강의실' where category is null;

-- 끝. 'Success. No rows returned' 가 나오면 정상입니다. ---------------------
-- 이후: Supabase 대시보드 → Settings → API → Reload Schema Cache 클릭.
