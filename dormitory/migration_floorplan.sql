-- =====================================================================
--  기숙사 배치도(평면도) 마이그레이션 — Supabase SQL Editor 1회 실행
-- =====================================================================
alter table dormitory_rooms add column if not exists map_x numeric;  -- 0~100 (%)
alter table dormitory_rooms add column if not exists map_y numeric;  -- 0~100 (%)

create table if not exists dormitory_floorplans (
  building_id uuid references dormitory_buildings(id) on delete cascade,
  floor int not null,
  image text,                 -- base64 dataURL (평면도 이미지)
  updated_at timestamptz default now(),
  primary key (building_id, floor)
);
alter table dormitory_floorplans enable row level security;
drop policy if exists dormitory_floorplans_admin on dormitory_floorplans;
create policy dormitory_floorplans_admin on dormitory_floorplans
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
-- 끝
