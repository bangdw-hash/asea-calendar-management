-- =====================================================================
--  기숙사 전자계약(서명) 마이그레이션
--  Supabase → SQL Editor 에서 1회 실행
-- =====================================================================

-- 계약서 양식 문구 등 설정 저장(키-값)
create table if not exists dormitory_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);
alter table dormitory_settings enable row level security;
drop policy if exists dormitory_settings_admin on dormitory_settings;
create policy dormitory_settings_admin on dormitory_settings
  for all to authenticated using (true) with check (true);
-- 계약서 양식 문구는 서명 페이지(비로그인)에서 읽어야 하므로 anon 읽기 허용(개인정보 아님)
drop policy if exists dormitory_settings_anon_read on dormitory_settings;
create policy dormitory_settings_anon_read on dormitory_settings
  for select to anon using (true);

-- 계약에 전자서명 관련 컬럼 추가
alter table dormitory_contracts add column if not exists sign_token        text;
alter table dormitory_contracts add column if not exists sign_status       text default 'none';   -- none | pending | signed
alter table dormitory_contracts add column if not exists student_sign_b64  text;
alter table dormitory_contracts add column if not exists agree_privacy     boolean default false;
alter table dormitory_contracts add column if not exists guardian_name     text;
alter table dormitory_contracts add column if not exists guardian_sign_b64 text;
alter table dormitory_contracts add column if not exists signed_at         timestamptz;
create unique index if not exists idx_contracts_sign_token
  on dormitory_contracts(sign_token) where sign_token is not null;

-- 서명 페이지: 토큰으로 계약·양식 조회 (RLS 우회 SECURITY DEFINER)
create or replace function dorm_sign_get(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  select jsonb_build_object(
    'id', c.id, 'name', c.resident_name, 'student_no', c.student_no,
    'building', b.name, 'room', rm.room_number,
    'start', c.start_date, 'end', c.end_date, 'unit_price', c.unit_price, 'deposit', c.deposit,
    'status', c.sign_status,
    'template', coalesce((select value from dormitory_settings where key = 'contract_template'), '')
  ) into res
  from dormitory_contracts c
  left join dormitory_buildings b on b.id = c.building_id
  left join dormitory_rooms rm on rm.id = c.room_id
  where c.sign_token = p_token limit 1;
  return res;
end; $$;
grant execute on function dorm_sign_get(text) to anon, authenticated;

-- 서명 페이지: 서명 제출 (토큰 보유 = 본인)
create or replace function dorm_sign_submit(p_token text, p_student text, p_agree boolean, p_gname text, p_gsign text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  update dormitory_contracts
    set student_sign_b64 = p_student, agree_privacy = coalesce(p_agree, false),
        guardian_name = nullif(p_gname, ''), guardian_sign_b64 = nullif(p_gsign, ''),
        sign_status = 'signed', signed_at = now(), status = 'active'
    where sign_token = p_token and sign_status in ('pending', 'signed')
    returning id into cid;
  if cid is null then return jsonb_build_object('ok', false, 'error', '유효하지 않거나 만료된 링크입니다.'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function dorm_sign_submit(text, text, boolean, text, text) to anon, authenticated;
-- 끝
