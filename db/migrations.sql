-- ============================================================================
-- ASEA 업무관리 PWA — 클라우드화 마이그레이션 (Supabase)
-- 프로젝트: zbpeyklwpotjyveipzxd
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
-- 안전: 모두 IF NOT EXISTS / idempotent. 여러 번 실행해도 안전합니다.
-- ============================================================================

-- 0) 공통: updated_at 자동 갱신 함수 -----------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ============================================================================
-- 1) app_submissions — (이미 사용 중) 신청서/이력 범용 저장소
--    여러 기능이 kind 로 구분해 공유합니다. 없으면 생성.
--    사용 kind 예: retire, hr_onboard, facility_request, survey_draft,
--                  tasks_imported, tasks_order, extract_history(신규),
--                  dept_mapping(신규), view_settings(신규)
-- ============================================================================
create table if not exists app_submissions (
  id          bigint generated always as identity primary key,
  kind        text not null,
  ref         text not null,
  name        text default '',
  status      text default 'submitted',
  data        jsonb default '{}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (kind, ref)
);
create index if not exists idx_app_sub_kind on app_submissions(kind);
create index if not exists idx_app_sub_updated on app_submissions(updated_at desc);
drop trigger if exists trg_app_sub_updated on app_submissions;
create trigger trg_app_sub_updated before update on app_submissions
  for each row execute function set_updated_at();

-- ============================================================================
-- 2) account_settings — 계정 단위 보기설정/구독/매핑 동기화 (항목 13)
--    캘린더 범례 on/off, 구독 캘린더, 부서·업무종류 매핑(항목 15) 등
-- ============================================================================
create table if not exists account_settings (
  email       text not null,
  scope       text not null,                 -- 'calendar_view' | 'dept_mapping' | 'ui_prefs' ...
  data        jsonb default '{}'::jsonb,
  updated_at  timestamptz default now(),
  primary key (email, scope)
);
drop trigger if exists trg_acct_set_updated on account_settings;
create trigger trg_acct_set_updated before update on account_settings
  for each row execute function set_updated_at();

-- ============================================================================
-- 3) audit_log — 감사 로그 (항목 19, 31)
--    권한변경/삭제/일괄작업/승인 등 민감 액션 기록
-- ============================================================================
create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  actor       text,                          -- 수행자 이메일
  area        text,                          -- budget|admin|facility|hr ...
  action      text,                          -- create|update|delete|approve|role_change
  target_ref  text,
  detail      jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);
create index if not exists idx_audit_area on audit_log(area, created_at desc);
create index if not exists idx_audit_actor on audit_log(actor, created_at desc);

-- ============================================================================
-- 4) snapshots — 자동저장 버전/스냅샷 (항목 20)
--    업무/보고/예산 문서의 주기 스냅샷, 버전 복구용
-- ============================================================================
create table if not exists snapshots (
  id          bigint generated always as identity primary key,
  doc_kind    text not null,                 -- 'budget' | 'report' | 'work' ...
  doc_ref     text not null,                 -- 문서 식별자
  email       text,
  data        jsonb not null,
  created_at  timestamptz default now()
);
create index if not exists idx_snap_doc on snapshots(doc_kind, doc_ref, created_at desc);

-- ============================================================================
-- 5) wayfind_data 구조화 (항목 24) — 안내도 지점 정보
--    기존 안내도 데이터를 app_submissions(kind='wayfind')로 쓰는 경우,
--    아래 보조 테이블로 지점을 정규화해 검색/QR 일괄출력에 활용 가능.
-- ============================================================================
create table if not exists wayfind_points (
  id          bigint generated always as identity primary key,
  map_ref     text not null,                 -- 도면 식별자
  floor       text,                          -- 층
  room_no     text,                          -- 호실
  name        text,                          -- 목적지/호실명
  point_type  text,                          -- destination|waypoint|exit|qr
  x           numeric,
  y           numeric,
  meta        jsonb default '{}'::jsonb,
  updated_at  timestamptz default now()
);
create index if not exists idx_wf_map on wayfind_points(map_ref);
drop trigger if exists trg_wf_updated on wayfind_points;
create trigger trg_wf_updated before update on wayfind_points
  for each row execute function set_updated_at();

-- ============================================================================
-- RLS (Row Level Security)
--   현 단계: 사내 익명 키(anon) 기반으로 동작하므로 '읽기/쓰기 허용' 정책을
--   적용합니다. 추후 Supabase Auth(구글 로그인) 도입 시 email = auth.jwt()->>'email'
--   조건으로 강화하세요(주석 참고).
-- ============================================================================
alter table app_submissions  enable row level security;
alter table account_settings enable row level security;
alter table audit_log        enable row level security;
alter table snapshots        enable row level security;
alter table wayfind_points   enable row level security;

-- 익명 허용 정책(사내 사용 단계). 존재하면 건너뜀.
do $$
declare t text;
begin
  foreach t in array array['app_submissions','account_settings','audit_log','snapshots','wayfind_points']
  loop
    execute format('drop policy if exists %I_all on %I;', t, t);
    execute format('create policy %I_all on %I for all using (true) with check (true);', t, t);
  end loop;
end $$;

-- ▶ 추후 강화 예시(계정 본인 데이터만):
-- create policy account_settings_self on account_settings
--   for all using (email = auth.jwt()->>'email') with check (email = auth.jwt()->>'email');

-- ============================================================================
-- 6) Storage 버킷 — 모바일 자필 서명/첨부 (항목 27, 28)
--    SQL로도 생성 가능하나, 대시보드 Storage에서 버킷 'signatures'(private)
--    'attachments'(private) 생성 권장. 아래는 SQL 생성 예시.
-- ============================================================================
insert into storage.buckets (id, name, public)
  values ('signatures','signatures', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('attachments','attachments', false)
  on conflict (id) do nothing;

-- 끝. 'Success. No rows returned' 가 나오면 정상입니다.
