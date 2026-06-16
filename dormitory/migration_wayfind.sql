-- =====================================================================
--  안내도(실내 길찾기) 마이그레이션 — Supabase(asea-dormitory) SQL Editor 1회 실행
-- =====================================================================
create table if not exists wayfind_data (
  id text primary key default 'main',
  data jsonb,
  updated_at timestamptz default now()
);
alter table wayfind_data enable row level security;
drop policy if exists wayfind_admin on wayfind_data;
create policy wayfind_admin on wayfind_data for all to authenticated using (true) with check (true);
drop policy if exists wayfind_anon_read on wayfind_data;
create policy wayfind_anon_read on wayfind_data for select to anon using (true);
notify pgrst, 'reload schema';
-- 끝
