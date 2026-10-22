-- ============================================================
-- 아세아 생활관 통합 관리 시스템 — DB 스키마 v4
-- 직원 계정·디자인 설정·부동산계약·OT·벌점·공과금·알림
-- ============================================================
-- 설치: Supabase SQL Editor > New Query > 실행

-- ── 직원 계정 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.staff_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     text NOT NULL UNIQUE,
  email        text,
  display_name text NOT NULL,
  affiliation  text,
  phone        text,
  password_hash text NOT NULL,
  role         text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  is_approved  bool NOT NULL DEFAULT false,
  last_login   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_username ON dorm.staff_accounts(username);

-- 관리자 계정 사전 등록 (bangdw@gmail.com / qkdtldnjs82!@)
-- 비밀번호 해시: sha256('qkdtldnjs82!@' + 'asea-dorm-v1')
-- sha256('qkdtldnjs82!@' + 'asea-dorm-v1')
INSERT INTO dorm.staff_accounts (username, email, display_name, affiliation, password_hash, role, is_approved)
VALUES ('bangdw', 'bangdw@gmail.com', '방대원', '시스템 관리', 'b9c624611999e508532e137b2c01cf15f27e7b0e38760d853aa37e838b7779fb', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- ── 직원 세션 토큰 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.staff_sessions (
  token       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id    uuid NOT NULL REFERENCES dorm.staff_accounts(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 디자인 설정 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.design_settings (
  id         int PRIMARY KEY DEFAULT 1,
  accent     text NOT NULL DEFAULT '#0EA5E9',
  accent_dk  text NOT NULL DEFAULT '#0284C7',
  accent_lt  text NOT NULL DEFAULT '#E0F2FE',
  bg         text NOT NULL DEFAULT '#F0F9FF',
  sidebar_style text NOT NULL DEFAULT 'light',
  font_size  int  NOT NULL DEFAULT 14,
  border_r   int  NOT NULL DEFAULT 6,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES dorm.staff_accounts(id)
);
INSERT INTO dorm.design_settings DEFAULT VALUES ON CONFLICT DO NOTHING;

-- ── 부동산 계약 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.real_estate_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     int REFERENCES dorm.buildings(id),
  building_name   text NOT NULL,
  address         text,
  landlord_name   text,
  tenant_name     text DEFAULT '(재)아세아항공직업전문학교',
  deposit         bigint DEFAULT 0,
  monthly_rent    bigint DEFAULT 0,
  extra_fees      jsonb DEFAULT '{}',
  area_sqm        numeric(10,2),
  contract_start  date,
  contract_end    date,
  special_terms   text,
  alert_6m_sent   bool DEFAULT false,
  alert_3m_sent   bool DEFAULT false,
  ai_extracted    bool DEFAULT false,
  pdf_url         text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 부동산 계약 이력
CREATE TABLE IF NOT EXISTS dorm.real_estate_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES dorm.real_estate_contracts(id) ON DELETE CASCADE,
  changed_by  uuid REFERENCES dorm.staff_accounts(id),
  diff        jsonb NOT NULL DEFAULT '{}',
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── OT 세션 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.ot_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id int REFERENCES dorm.semesters(id),
  title       text NOT NULL,
  description text,
  file_url    text,
  created_by  uuid REFERENCES dorm.staff_accounts(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- OT 확인 기록
CREATE TABLE IF NOT EXISTS dorm.ot_acknowledgments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id       uuid NOT NULL REFERENCES dorm.ot_sessions(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES dorm.residents(id) ON DELETE CASCADE,
  ack_at      timestamptz,
  pledge_at   timestamptz,
  notif_sent  int NOT NULL DEFAULT 0,
  last_notif  timestamptz,
  UNIQUE(ot_id, resident_id)
);

-- ── 벌점 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.penalties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES dorm.residents(id) ON DELETE CASCADE,
  semester_id int REFERENCES dorm.semesters(id),
  score       int NOT NULL DEFAULT 1,
  reason      text NOT NULL,
  noted_by    uuid REFERENCES dorm.staff_accounts(id),
  notified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 입소 계약서·서약서 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.resident_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id     uuid NOT NULL REFERENCES dorm.residents(id) ON DELETE CASCADE,
  semester_id     int REFERENCES dorm.semesters(id),
  contract_type   text NOT NULL DEFAULT 'contract'
                    CHECK (contract_type IN ('contract','pledge','privacy')),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','signed','rejected')),
  sent_at         timestamptz,
  signed_at       timestamptz,
  signature_data  text,
  checkboxes      jsonb DEFAULT '{}',
  ip_addr         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rc_resident ON dorm.resident_contracts(resident_id, contract_type);

-- 계약서 서식 (관리자 편집 가능)
CREATE TABLE IF NOT EXISTS dorm.contract_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('contract','pledge','privacy')),
  title       text NOT NULL,
  body_html   text NOT NULL,
  checkboxes  jsonb DEFAULT '[]',
  is_active   bool NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES dorm.staff_accounts(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 공과금 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.utility_bills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id int NOT NULL REFERENCES dorm.buildings(id) ON DELETE CASCADE,
  year        int NOT NULL,
  month       int NOT NULL CHECK (month BETWEEN 1 AND 12),
  electricity bigint NOT NULL DEFAULT 0,
  water       bigint NOT NULL DEFAULT 0,
  gas         bigint NOT NULL DEFAULT 0,
  etc         bigint NOT NULL DEFAULT 0,
  notes       text,
  entered_by  uuid REFERENCES dorm.staff_accounts(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(building_id, year, month)
);

-- ── 알림 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid REFERENCES dorm.staff_accounts(id),
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  is_read     bool NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_staff ON dorm.notifications(staff_id, is_read);

-- ── SMS 발송 이력 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.sms_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid REFERENCES dorm.residents(id),
  phone       text NOT NULL,
  message     text NOT NULL,
  type        text,
  status      text DEFAULT 'pending',
  sent_by     uuid REFERENCES dorm.staff_accounts(id),
  sent_at     timestamptz NOT NULL DEFAULT now()
);

-- ── RPC: 직원 로그인 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_staff_login(p_username text, p_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_staff dorm.staff_accounts; v_token text;
BEGIN
  SELECT * INTO v_staff FROM dorm.staff_accounts
  WHERE username = p_username AND password_hash = p_hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'msg','아이디 또는 비밀번호가 올바르지 않습니다.'); END IF;
  IF NOT v_staff.is_approved THEN RETURN jsonb_build_object('ok',false,'msg','승인 대기 중입니다. 관리자에게 문의하세요.'); END IF;
  v_token := gen_random_uuid()::text;
  INSERT INTO dorm.staff_sessions(token,staff_id) VALUES(v_token, v_staff.id);
  UPDATE dorm.staff_accounts SET last_login = now() WHERE id = v_staff.id;
  RETURN jsonb_build_object('ok',true,'token',v_token,'staff',
    jsonb_build_object('id',v_staff.id,'username',v_staff.username,'display_name',v_staff.display_name,
      'role',v_staff.role,'affiliation',v_staff.affiliation,'phone',v_staff.phone));
END$$;

-- ── RPC: 직원 계정 만들기 ────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_staff_register(p_username text, p_display_name text, p_affiliation text, p_phone text, p_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM dorm.staff_accounts WHERE username = p_username) THEN
    RETURN jsonb_build_object('ok',false,'msg','이미 사용 중인 아이디입니다.');
  END IF;
  INSERT INTO dorm.staff_accounts(username,display_name,affiliation,phone,password_hash,is_approved)
  VALUES(p_username,p_display_name,p_affiliation,p_phone,p_hash,false);
  RETURN jsonb_build_object('ok',true,'msg','계정이 생성되었습니다. 관리자 승인 후 로그인 가능합니다.');
END$$;

-- ── RPC: 세션 검증 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_verify_session(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sess dorm.staff_sessions; v_staff dorm.staff_accounts;
BEGIN
  SELECT * INTO v_sess FROM dorm.staff_sessions
  WHERE token = p_token AND expires_at > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT * INTO v_staff FROM dorm.staff_accounts WHERE id = v_sess.staff_id;
  RETURN jsonb_build_object('ok',true,'staff',
    jsonb_build_object('id',v_staff.id,'username',v_staff.username,'display_name',v_staff.display_name,
      'role',v_staff.role,'affiliation',v_staff.affiliation,'phone',v_staff.phone));
END$$;

-- ── RPC: 알림 목록 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_get_notifications(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_staff_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now();
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT jsonb_agg(n ORDER BY created_at DESC)
    FROM (SELECT id,type,title,body,link,is_read,created_at FROM dorm.notifications
      WHERE staff_id=v_staff_id OR staff_id IS NULL ORDER BY created_at DESC LIMIT 30) n);
END$$;

-- ── RPC: 디자인 설정 저장 ───────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_save_design(p_token text, p_accent text, p_accent_dk text, p_accent_lt text,
  p_bg text, p_sidebar_style text, p_font_size int, p_border_r int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_staff_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  UPDATE dorm.design_settings SET accent=p_accent,accent_dk=p_accent_dk,accent_lt=p_accent_lt,
    bg=p_bg,sidebar_style=p_sidebar_style,font_size=p_font_size,border_r=p_border_r,
    updated_at=now(),updated_by=v_staff_id WHERE id=1;
  RETURN jsonb_build_object('ok',true);
END$$;

-- ── RPC: 입소자 목록 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_list_residents(p_token text, p_semester_id int DEFAULT NULL, p_building_id int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now()) THEN
    RETURN '[]'::jsonb; END IF;
  RETURN (SELECT jsonb_agg(r) FROM (
    SELECT r.id,r.student_no,r.name,r.phone,r.parent_phone,r.class_name,r.type,
      r.status,r.entry_date,r.exit_date,r.unit_price,r.penalty_total,r.notes,
      b.name AS building_name, b.short_name AS building_short,
      rm.room_no,
      (SELECT SUM(amount) FROM dorm.payments WHERE resident_id=r.id AND status='paid') AS paid_total,
      (SELECT COUNT(*) FROM dorm.penalties WHERE resident_id=r.id) AS penalty_count,
      (SELECT COUNT(*) FROM dorm.resident_contracts WHERE resident_id=r.id AND status='signed') AS signed_contracts
    FROM dorm.residents r
    LEFT JOIN dorm.buildings b ON b.id=r.building_id
    LEFT JOIN dorm.rooms rm ON rm.id=r.room_id
    WHERE r.status IN ('active','applied')
      AND (p_semester_id IS NULL OR r.semester_id=p_semester_id)
      AND (p_building_id IS NULL OR r.building_id=p_building_id)
    ORDER BY b.name, rm.room_no, r.name
  ) r);
END$$;

-- ── RPC: 납부 목록 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_list_payments(p_token text, p_semester_id int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now()) THEN
    RETURN '[]'::jsonb; END IF;
  RETURN (SELECT jsonb_agg(p) FROM (
    SELECT p.*,r.name AS resident_name,r.student_no,r.type AS resident_type,
      b.short_name AS building_short, rm.room_no
    FROM dorm.payments p
    JOIN dorm.residents r ON r.id=p.resident_id
    LEFT JOIN dorm.buildings b ON b.id=r.building_id
    LEFT JOIN dorm.rooms rm ON rm.id=r.room_id
    WHERE (p_semester_id IS NULL OR p.semester_id=p_semester_id)
    ORDER BY p.created_at DESC
  ) p);
END$$;

-- ── RPC: 부동산 계약 목록 ───────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_list_real_estate(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now()) THEN
    RETURN '[]'::jsonb; END IF;
  RETURN (SELECT jsonb_agg(c ORDER BY c.contract_end) FROM dorm.real_estate_contracts c);
END$$;

-- ── RPC: 공과금 저장 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_upsert_utility(p_token text, p_building_id int, p_year int, p_month int,
  p_electricity bigint, p_water bigint, p_gas bigint, p_etc bigint DEFAULT 0, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_staff_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  INSERT INTO dorm.utility_bills(building_id,year,month,electricity,water,gas,etc,notes,entered_by)
  VALUES(p_building_id,p_year,p_month,p_electricity,p_water,p_gas,p_etc,p_notes,v_staff_id)
  ON CONFLICT(building_id,year,month) DO UPDATE SET
    electricity=EXCLUDED.electricity,water=EXCLUDED.water,gas=EXCLUDED.gas,
    etc=EXCLUDED.etc,notes=EXCLUDED.notes,entered_by=EXCLUDED.entered_by,updated_at=now();
  RETURN jsonb_build_object('ok',true);
END$$;

-- ── RPC: 벌점 추가 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_add_penalty(p_token text, p_resident_id uuid, p_score int, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_staff_id uuid; v_total int;
BEGIN
  SELECT staff_id INTO v_staff_id FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  INSERT INTO dorm.penalties(resident_id,score,reason,noted_by) VALUES(p_resident_id,p_score,p_reason,v_staff_id);
  UPDATE dorm.residents SET penalty_total = (SELECT COALESCE(SUM(score),0) FROM dorm.penalties WHERE resident_id=p_resident_id)
  WHERE id=p_resident_id;
  SELECT penalty_total INTO v_total FROM dorm.residents WHERE id=p_resident_id;
  RETURN jsonb_build_object('ok',true,'penalty_total',v_total);
END$$;

-- ── RPC: 직원 계정 승인 (관리자) ────────────────────────────
CREATE OR REPLACE FUNCTION dorm_approve_staff(p_token text, p_staff_id uuid, p_approve bool)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text;
BEGIN
  SELECT sa.role INTO v_role FROM dorm.staff_sessions ss
  JOIN dorm.staff_accounts sa ON sa.id=ss.staff_id
  WHERE ss.token=p_token AND ss.expires_at>now();
  IF v_role<>'admin' THEN RETURN jsonb_build_object('ok',false,'msg','권한이 없습니다.'); END IF;
  UPDATE dorm.staff_accounts SET is_approved=p_approve WHERE id=p_staff_id;
  RETURN jsonb_build_object('ok',true);
END$$;

-- ── RPC: 납부 등록 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_add_payment(p_token text, p_resident_id uuid, p_semester_id int,
  p_period text, p_amount int, p_method text, p_paid_at date DEFAULT NULL, p_notes text DEFAULT NULL,
  p_installment bool DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_staff_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  INSERT INTO dorm.payments(resident_id,semester_id,period,amount,method,status,paid_at,notes,is_installment)
  VALUES(p_resident_id,p_semester_id,p_period,p_amount,p_method,
    CASE WHEN p_paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END,
    p_paid_at,p_notes,p_installment);
  RETURN jsonb_build_object('ok',true);
END$$;

-- ── RPC: 부동산 계약 저장 ───────────────────────────────────
CREATE OR REPLACE FUNCTION dorm_upsert_real_estate(p_token text, p_id uuid DEFAULT NULL,
  p_building_name text DEFAULT NULL, p_address text DEFAULT NULL, p_landlord_name text DEFAULT NULL,
  p_deposit bigint DEFAULT 0, p_monthly_rent bigint DEFAULT 0, p_area_sqm numeric DEFAULT NULL,
  p_contract_start date DEFAULT NULL, p_contract_end date DEFAULT NULL,
  p_special_terms text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM dorm.staff_sessions WHERE token=p_token AND expires_at>now()) THEN
    RETURN jsonb_build_object('ok',false); END IF;
  IF p_id IS NULL THEN
    INSERT INTO dorm.real_estate_contracts(building_name,address,landlord_name,deposit,monthly_rent,
      area_sqm,contract_start,contract_end,special_terms,notes)
    VALUES(p_building_name,p_address,p_landlord_name,p_deposit,p_monthly_rent,
      p_area_sqm,p_contract_start,p_contract_end,p_special_terms,p_notes)
    RETURNING id INTO v_id;
  ELSE
    UPDATE dorm.real_estate_contracts SET building_name=COALESCE(p_building_name,building_name),
      address=COALESCE(p_address,address),landlord_name=COALESCE(p_landlord_name,landlord_name),
      deposit=p_deposit,monthly_rent=p_monthly_rent,area_sqm=COALESCE(p_area_sqm,area_sqm),
      contract_start=COALESCE(p_contract_start,contract_start),
      contract_end=COALESCE(p_contract_end,contract_end),
      special_terms=COALESCE(p_special_terms,special_terms),notes=COALESCE(p_notes,notes),
      updated_at=now()
    WHERE id=p_id;
    v_id := p_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',v_id);
END$$;

-- ── 초기 부동산 계약 데이터 ─────────────────────────────────
INSERT INTO dorm.real_estate_contracts (building_name,address,landlord_name,deposit,monthly_rent,area_sqm,contract_start,contract_end,special_terms,ai_extracted)
VALUES
('부경기숙사','서울 구로구 구로동 1127-6 1~5층','이해경',100000000,12000000,561.18,'2025-01-31','2027-01-31','건물 외관 및 내부 구조 변경 시 임차인 비용 원상복구. 임대차 기간 중 임대료 인상 없음.',true),
('진수빌딩(여자기숙사)','서울 영등포구 당산동3가 180','진수빌딩 임대인',0,7500000,NULL,'2025-02-28','2027-02-28','호실 5개 개별 계약(601-1~4, 501호). 각 50만원/월.',true),
('비버하우스','서울 영등포구 국회대로38길 8 3층','비버하우스 임대인',0,13000000,NULL,'2025-02-01','2028-01-31','VAT 별도. 인건비 2,640,000원/월, 청소용역비 360,000원/월. 공과금 연평균 161만원 초과분 6개월마다 정산.',true),
('소호모텔(구디)','서울 영등포구 당산동3가 61-1','소호모텔 임대인',10000000,16500000,NULL,'2026-03-01','2028-02-29','2개 계약 합산. 임대료 인상 협의 조건 포함.',true),
('한주빌딩(위탁)','서울 영등포구 당산로27길 19-2','한주빌딩 임대인',1350000000,13800000,1244.7,'2023-12-29','2029-12-31','고시원+단독주택 복합. 위탁 운영 계약. 보증금 13.5억.',true)
ON CONFLICT DO NOTHING;

-- ── payments 테이블에 is_installment 컬럼 추가 ──────────────
ALTER TABLE dorm.payments ADD COLUMN IF NOT EXISTS is_installment bool NOT NULL DEFAULT false;
ALTER TABLE dorm.payments ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE dorm.payments ADD COLUMN IF NOT EXISTS paid_at date;
ALTER TABLE dorm.payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','partial','waived'));

-- ── residents 에 추가 컬럼 ──────────────────────────────────
ALTER TABLE dorm.residents ADD COLUMN IF NOT EXISTS is_installment bool NOT NULL DEFAULT false;
ALTER TABLE dorm.residents ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE dorm.residents ADD COLUMN IF NOT EXISTS birthdate date;
ALTER TABLE dorm.residents ADD COLUMN IF NOT EXISTS smoker bool DEFAULT false;
ALTER TABLE dorm.residents ADD COLUMN IF NOT EXISTS emergency_contact text;

GRANT USAGE ON SCHEMA dorm TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA dorm TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
