-- ============================================================
-- 아세아 생활관 통합 관리 시스템 — DB 스키마 v1
-- ============================================================
-- 설치 방법 (Supabase SQL Editor):
--   1. 이 파일 전체를 Supabase > SQL Editor > New Query 에 붙여넣고 실행
--   2. 성공 후 master_tokens 테이블에서 token 값 확인:
--        SELECT token, label, created_at FROM dorm.master_tokens;
--   3. 해당 token 으로 마스터 링크 생성:
--        https://bangdw-hash.github.io/asea-calendar-management/dormitory/staff.html?master=<token>
--   4. Google OAuth 설정:
--        Supabase > Authentication > Providers > Google 활성화
--        Google Cloud Console > OAuth > Authorized JavaScript Origins 에 추가:
--          https://bangdw-hash.github.io
--
-- 입소자 포털 링크:
--   학번+이름 로그인: dormitory/resident-portal.html
--   개인 토큰 링크:  dormitory/resident-portal.html?rt=<portal_token>
--   (portal_token 은 dorm.residents.portal_token 컬럼 값)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS dorm;

-- ── 학기 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.semesters (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  year       int  NOT NULL,
  term       int  NOT NULL CHECK (term IN (1,2)),
  start_date date,
  end_date   date,
  is_active  bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 건물 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.buildings (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  short_name  text,
  capacity    int  NOT NULL DEFAULT 0,
  floor_count int  NOT NULL DEFAULT 1,
  is_active   bool NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 호실 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.rooms (
  id          serial PRIMARY KEY,
  building_id int  NOT NULL REFERENCES dorm.buildings(id) ON DELETE CASCADE,
  room_no     text NOT NULL,
  floor       int  NOT NULL DEFAULT 1,
  capacity    int  NOT NULL DEFAULT 1,
  room_type   text NOT NULL DEFAULT 'standard',
  position_x  real,
  position_y  real,
  notes       text,
  UNIQUE (building_id, room_no)
);

-- ── 입소자 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.residents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_no    text,
  name          text NOT NULL,
  phone         text,
  parent_phone  text,
  parent_name   text,
  class_name    text,
  type          text NOT NULL DEFAULT 'regular'
                  CHECK (type IN ('regular','consign','staff')),
  building_id   int  REFERENCES dorm.buildings(id),
  room_id       int  REFERENCES dorm.rooms(id),
  semester_id   int  REFERENCES dorm.semesters(id),
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('applied','active','moveout','expelled')),
  entry_date    date,
  exit_date     date,
  exit_reason   text,
  unit_price    int  NOT NULL DEFAULT 0,
  deposit       int  NOT NULL DEFAULT 0,
  penalty_total int  NOT NULL DEFAULT 0,
  notes         text,
  portal_token  text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_residents_student_no ON dorm.residents(student_no);
CREATE INDEX IF NOT EXISTS idx_residents_portal_token ON dorm.residents(portal_token);
CREATE INDEX IF NOT EXISTS idx_residents_semester ON dorm.residents(semester_id, status);

-- ── 납부 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES dorm.residents(id) ON DELETE CASCADE,
  semester_id int  REFERENCES dorm.semesters(id),
  period      text NOT NULL,
  amount      int  NOT NULL DEFAULT 0,
  due_date    date,
  paid_date   date,
  paid_amount int  NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'unpaid'
                CHECK (status IN ('unpaid','paid','partial','overpaid','waived')),
  method      text,
  sender_name text,
  bank_sms    text,
  memo        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_resident ON dorm.payments(resident_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON dorm.payments(status, due_date);

-- ── 납부 이벤트 로그 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.payment_events (
  id          serial PRIMARY KEY,
  payment_id  uuid NOT NULL REFERENCES dorm.payments(id) ON DELETE CASCADE,
  action      text NOT NULL,
  before_json jsonb,
  after_json  jsonb,
  memo        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 서류 템플릿 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.doc_templates (
  id             serial PRIMARY KEY,
  type           text NOT NULL CHECK (type IN ('contract','pledge')),
  title          text NOT NULL,
  content        text NOT NULL DEFAULT '',
  version        int  NOT NULL DEFAULT 1,
  is_active      bool NOT NULL DEFAULT false,
  semester_start text,
  semester_end   text,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 서류 서명 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.doc_signs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id   uuid NOT NULL REFERENCES dorm.residents(id) ON DELETE CASCADE,
  template_id   int  REFERENCES dorm.doc_templates(id),
  type          text NOT NULL CHECK (type IN ('contract','pledge')),
  token         text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','signed','expired')),
  student_sig   text,
  guardian_name text,
  guardian_sig  text,
  agreed        bool NOT NULL DEFAULT false,
  signed_at     timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_signs_token ON dorm.doc_signs(token);
CREATE INDEX IF NOT EXISTS idx_doc_signs_resident ON dorm.doc_signs(resident_id, type);

-- ── 민원 ──────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS dorm.complaint_seq START 1000;

CREATE TABLE IF NOT EXISTS dorm.complaints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid REFERENCES dorm.residents(id),
  room_label  text,
  category    text NOT NULL DEFAULT '기타',
  title       text NOT NULL,
  content     text NOT NULL,
  images      text[] NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'received'
                CHECK (status IN ('received','processing','resolved','closed')),
  reply       text,
  replied_at  timestamptz,
  ticket_no   text UNIQUE,
  priority    text NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high','urgent')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON dorm.complaints(status, created_at DESC);

-- ── 벌점 규정 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.penalty_rules (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  description text,
  point       int  NOT NULL DEFAULT 0,
  category    text NOT NULL DEFAULT 'general',
  is_active   bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 벌점 기록 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.penalties (
  id          serial PRIMARY KEY,
  resident_id uuid NOT NULL REFERENCES dorm.residents(id) ON DELETE CASCADE,
  rule_id     int  REFERENCES dorm.penalty_rules(id),
  point       int  NOT NULL DEFAULT 0,
  memo        text,
  building_id int  REFERENCES dorm.buildings(id),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 공지 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.notices (
  id           serial PRIMARY KEY,
  title        text NOT NULL,
  content      text NOT NULL DEFAULT '',
  building_ids int[] NOT NULL DEFAULT '{}',
  push_sent    bool NOT NULL DEFAULT false,
  is_pinned    bool NOT NULL DEFAULT false,
  attachments  jsonb NOT NULL DEFAULT '[]',
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   date
);

-- ── OT 자료 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.ot_materials (
  id          serial PRIMARY KEY,
  semester_id int  REFERENCES dorm.semesters(id),
  title       text NOT NULL,
  description text,
  file_url    text,
  order_num   int  NOT NULL DEFAULT 0,
  is_active   bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 공과금 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.utility_bills (
  id           serial PRIMARY KEY,
  building_id  int  NOT NULL REFERENCES dorm.buildings(id),
  semester_id  int  REFERENCES dorm.semesters(id),
  year_month   text NOT NULL,
  electricity  int  NOT NULL DEFAULT 0,
  water        int  NOT NULL DEFAULT 0,
  gas          int  NOT NULL DEFAULT 0,
  internet     int  NOT NULL DEFAULT 0,
  other        int  NOT NULL DEFAULT 0,
  other_label  text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, year_month)
);

-- ── 환불 정책 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.refund_policies (
  id           serial PRIMARY KEY,
  title        text NOT NULL,
  content_text text NOT NULL DEFAULT '',
  content_json jsonb,
  version      int  NOT NULL DEFAULT 1,
  is_active    bool NOT NULL DEFAULT false,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 손익 항목 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.pl_items (
  id          serial PRIMARY KEY,
  semester_id int  REFERENCES dorm.semesters(id),
  building_id int  REFERENCES dorm.buildings(id),
  type        text NOT NULL CHECK (type IN ('income','expense')),
  category    text NOT NULL DEFAULT '기타',
  subcategory text,
  amount      int  NOT NULL DEFAULT 0,
  description text,
  month       text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 임대차 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.leases (
  id           serial PRIMARY KEY,
  building_id  int  NOT NULL REFERENCES dorm.buildings(id),
  owner_name   text,
  owner_contact text,
  amount       int  NOT NULL DEFAULT 0,
  deposit      int  NOT NULL DEFAULT 0,
  start_date   date,
  end_date     date,
  auto_renew   bool NOT NULL DEFAULT false,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 마스터 토큰 (경영자 링크) ────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.master_tokens (
  id          serial PRIMARY KEY,
  token       text NOT NULL UNIQUE,
  label       text NOT NULL DEFAULT '경영자 링크',
  is_active   bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- ── 입소 신청 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dorm.applications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id        int  REFERENCES dorm.semesters(id),
  name               text NOT NULL,
  student_no         text,
  phone              text,
  parent_phone       text,
  class_name         text,
  preferred_building text,
  type               text NOT NULL DEFAULT 'regular',
  notes              text,
  status             text NOT NULL DEFAULT 'submitted'
                       CHECK (status IN ('submitted','reviewing','accepted','rejected','waitlist')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_at        timestamptz,
  reviewed_by        text
);

-- ============================================================
-- RLS 설정
-- ============================================================

ALTER TABLE dorm.semesters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.buildings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.residents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.doc_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.doc_signs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.complaints    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.penalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.penalties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.notices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.ot_materials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.utility_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.refund_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.pl_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.leases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.master_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm.applications  ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (건물·호실·공지는 누구나)
CREATE POLICY buildings_select  ON dorm.buildings     FOR SELECT USING (true);
CREATE POLICY rooms_select      ON dorm.rooms         FOR SELECT USING (true);
CREATE POLICY notices_select    ON dorm.notices       FOR SELECT USING (true);
CREATE POLICY semesters_select  ON dorm.semesters     FOR SELECT USING (true);
CREATE POLICY penalty_rules_sel ON dorm.penalty_rules FOR SELECT USING (true);
CREATE POLICY ot_materials_sel  ON dorm.ot_materials  FOR SELECT USING (true);

-- 나머지: RPC를 통해서만 접근 (anon direct access 차단)
CREATE POLICY residents_deny     ON dorm.residents       FOR ALL USING (false);
CREATE POLICY payments_deny      ON dorm.payments        FOR ALL USING (false);
CREATE POLICY pevents_deny       ON dorm.payment_events  FOR ALL USING (false);
CREATE POLICY doc_tmpl_deny      ON dorm.doc_templates   FOR ALL USING (false);
CREATE POLICY doc_signs_deny     ON dorm.doc_signs       FOR ALL USING (false);
CREATE POLICY complaints_deny    ON dorm.complaints      FOR ALL USING (false);
CREATE POLICY penalties_deny     ON dorm.penalties       FOR ALL USING (false);
CREATE POLICY utility_deny       ON dorm.utility_bills   FOR ALL USING (false);
CREATE POLICY refund_deny        ON dorm.refund_policies FOR ALL USING (false);
CREATE POLICY pl_deny            ON dorm.pl_items        FOR ALL USING (false);
CREATE POLICY leases_deny        ON dorm.leases          FOR ALL USING (false);
CREATE POLICY master_deny        ON dorm.master_tokens   FOR ALL USING (false);
CREATE POLICY apps_deny          ON dorm.applications    FOR ALL USING (false);

-- ============================================================
-- RPC 함수들
-- ============================================================

-- 1. 입소자 전체 데이터 조회 (학번+이름)
CREATE OR REPLACE FUNCTION public.dorm_resident_lookup_v2(
  p_student_no text,
  p_name       text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_res dorm.residents%ROWTYPE;
  v_building dorm.buildings%ROWTYPE;
  v_out jsonb;
BEGIN
  SELECT r.* INTO v_res
  FROM dorm.residents r
  WHERE r.student_no = p_student_no
    AND r.name = p_name
    AND r.status IN ('active','applied')
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT b.* INTO v_building FROM dorm.buildings b WHERE b.id = v_res.building_id;

  SELECT jsonb_build_object(
    'resident', row_to_json(v_res),
    'building_name', v_building.name,
    'building_short', v_building.short_name,
    'payments', (
      SELECT coalesce(jsonb_agg(row_to_json(p) ORDER BY p.period DESC), '[]')
      FROM dorm.payments p WHERE p.resident_id = v_res.id
    ),
    'doc_signs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', ds.id, 'type', ds.type, 'status', ds.status,
        'token', ds.token, 'signed_at', ds.signed_at,
        'student_sig', CASE WHEN ds.status='signed' THEN ds.student_sig ELSE NULL END
      ) ORDER BY ds.created_at DESC), '[]')
      FROM dorm.doc_signs ds WHERE ds.resident_id = v_res.id
    ),
    'complaints', (
      SELECT coalesce(jsonb_agg(row_to_json(c) ORDER BY c.created_at DESC), '[]')
      FROM dorm.complaints c WHERE c.resident_id = v_res.id
    ),
    'notices', (
      SELECT coalesce(jsonb_agg(row_to_json(n) ORDER BY n.is_pinned DESC, n.created_at DESC), '[]')
      FROM dorm.notices n
      WHERE (n.building_ids = '{}' OR v_res.building_id = ANY(n.building_ids))
        AND (n.expires_at IS NULL OR n.expires_at >= CURRENT_DATE)
      LIMIT 10
    ),
    'ot_materials', (
      SELECT coalesce(jsonb_agg(row_to_json(o) ORDER BY o.order_num), '[]')
      FROM dorm.ot_materials o
      WHERE o.is_active = true
        AND (o.semester_id IS NULL OR o.semester_id = v_res.semester_id)
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- 2. 토큰으로 입소자 로그인
CREATE OR REPLACE FUNCTION public.dorm_resident_token_login(
  p_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sno text;
  v_name text;
BEGIN
  SELECT student_no, name INTO v_sno, v_name
  FROM dorm.residents
  WHERE portal_token = p_token AND status IN ('active','applied')
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN public.dorm_resident_lookup_v2(v_sno, v_name);
END;
$$;

-- 3. 마스터 토큰 검증
CREATE OR REPLACE FUNCTION public.dorm_verify_master_token(
  p_token text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_found boolean := false;
BEGIN
  UPDATE dorm.master_tokens
  SET last_used_at = now()
  WHERE token = p_token AND is_active = true
  RETURNING true INTO v_found;

  RETURN COALESCE(v_found, false);
END;
$$;

-- 4. 민원 접수
CREATE OR REPLACE FUNCTION public.dorm_complaint_submit(
  p_resident_id uuid,
  p_room_label  text,
  p_category    text,
  p_title       text,
  p_content     text,
  p_images      text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seq    bigint;
  v_ticket text;
  v_id     uuid;
BEGIN
  v_seq    := nextval('dorm.complaint_seq');
  v_ticket := 'DC' || to_char(now(), 'YYYYMMDD') || lpad(v_seq::text, 4, '0');

  INSERT INTO dorm.complaints (resident_id, room_label, category, title, content, images, ticket_no)
  VALUES (p_resident_id, p_room_label, p_category, p_title, p_content, COALESCE(p_images,'{}'), v_ticket)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'ticket_no', v_ticket, 'ok', true);
END;
$$;

-- 5. 직원 대시보드
CREATE OR REPLACE FUNCTION public.dorm_staff_dashboard(
  p_semester_id int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sid int;
BEGIN
  IF p_semester_id IS NULL THEN
    SELECT id INTO v_sid FROM dorm.semesters WHERE is_active = true ORDER BY id DESC LIMIT 1;
  ELSE
    v_sid := p_semester_id;
  END IF;

  RETURN jsonb_build_object(
    'semester_id', v_sid,
    'total_residents', (
      SELECT count(*) FROM dorm.residents
      WHERE semester_id = v_sid AND status = 'active'
    ),
    'unpaid_count', (
      SELECT count(DISTINCT p.resident_id)
      FROM dorm.payments p
      JOIN dorm.residents r ON r.id = p.resident_id
      WHERE r.semester_id = v_sid AND r.status = 'active'
        AND p.status IN ('unpaid','partial')
        AND p.period = to_char(now(),'YYYY-MM')
    ),
    'pending_complaints', (
      SELECT count(*) FROM dorm.complaints WHERE status IN ('received','processing')
    ),
    'pending_contracts', (
      SELECT count(*) FROM dorm.doc_signs ds
      JOIN dorm.residents r ON r.id = ds.resident_id
      WHERE ds.type = 'contract' AND ds.status = 'pending' AND r.status = 'active'
        AND (v_sid IS NULL OR r.semester_id = v_sid)
    ),
    'pending_pledges', (
      SELECT count(*) FROM dorm.doc_signs ds
      JOIN dorm.residents r ON r.id = ds.resident_id
      WHERE ds.type = 'pledge' AND ds.status = 'pending' AND r.status = 'active'
        AND (v_sid IS NULL OR r.semester_id = v_sid)
    ),
    'buildings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'short_name', b.short_name,
        'capacity', b.capacity,
        'resident_count', (
          SELECT count(*) FROM dorm.residents
          WHERE building_id = b.id AND semester_id = v_sid AND status = 'active'
        ),
        'lease_end', (
          SELECT end_date FROM dorm.leases WHERE building_id = b.id ORDER BY end_date DESC LIMIT 1
        )
      ) ORDER BY b.id), '[]')
      FROM dorm.buildings b WHERE b.is_active = true
    ),
    'semesters', (
      SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.year DESC, s.term DESC), '[]')
      FROM dorm.semesters s
    )
  );
END;
$$;

-- 6. 직원 입소자 목록
CREATE OR REPLACE FUNCTION public.dorm_staff_residents(
  p_semester_id int  DEFAULT NULL,
  p_building_id int  DEFAULT NULL,
  p_status      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sid int;
BEGIN
  IF p_semester_id IS NULL THEN
    SELECT id INTO v_sid FROM dorm.semesters WHERE is_active = true ORDER BY id DESC LIMIT 1;
  ELSE
    v_sid := p_semester_id;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'student_no', r.student_no,
      'name', r.name,
      'phone', r.phone,
      'parent_phone', r.parent_phone,
      'parent_name', r.parent_name,
      'class_name', r.class_name,
      'type', r.type,
      'building_id', r.building_id,
      'building_name', b.name,
      'building_short', b.short_name,
      'room_id', r.room_id,
      'room_no', rm.room_no,
      'semester_id', r.semester_id,
      'status', r.status,
      'entry_date', r.entry_date,
      'exit_date', r.exit_date,
      'unit_price', r.unit_price,
      'deposit', r.deposit,
      'penalty_total', r.penalty_total,
      'notes', r.notes,
      'portal_token', r.portal_token,
      'portal_link', '?rt=' || r.portal_token,
      'created_at', r.created_at,
      'payment_status', (
        SELECT p.status FROM dorm.payments p
        WHERE p.resident_id = r.id
          AND p.period = to_char(now(),'YYYY-MM')
        ORDER BY p.created_at DESC LIMIT 1
      ),
      'contract_status', (
        SELECT ds.status FROM dorm.doc_signs ds
        WHERE ds.resident_id = r.id AND ds.type = 'contract'
        ORDER BY ds.created_at DESC LIMIT 1
      ),
      'pledge_status', (
        SELECT ds.status FROM dorm.doc_signs ds
        WHERE ds.resident_id = r.id AND ds.type = 'pledge'
        ORDER BY ds.created_at DESC LIMIT 1
      )
    ) ORDER BY b.name, rm.room_no, r.name), '[]')
    FROM dorm.residents r
    LEFT JOIN dorm.buildings b ON b.id = r.building_id
    LEFT JOIN dorm.rooms rm   ON rm.id = r.room_id
    WHERE (v_sid IS NULL OR r.semester_id = v_sid)
      AND (p_building_id IS NULL OR r.building_id = p_building_id)
      AND (p_status IS NULL OR r.status = p_status)
  );
END;
$$;

-- 7. 입소자 추가/수정
CREATE OR REPLACE FUNCTION public.dorm_staff_upsert_resident(
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_data->>'id' IS NOT NULL THEN
    v_id := (p_data->>'id')::uuid;
    UPDATE dorm.residents SET
      student_no   = COALESCE(p_data->>'student_no', student_no),
      name         = COALESCE(p_data->>'name', name),
      phone        = COALESCE(p_data->>'phone', phone),
      parent_phone = COALESCE(p_data->>'parent_phone', parent_phone),
      parent_name  = COALESCE(p_data->>'parent_name', parent_name),
      class_name   = COALESCE(p_data->>'class_name', class_name),
      type         = COALESCE(p_data->>'type', type),
      building_id  = COALESCE((p_data->>'building_id')::int, building_id),
      room_id      = (p_data->>'room_id')::int,
      semester_id  = COALESCE((p_data->>'semester_id')::int, semester_id),
      status       = COALESCE(p_data->>'status', status),
      entry_date   = COALESCE((p_data->>'entry_date')::date, entry_date),
      exit_date    = (p_data->>'exit_date')::date,
      exit_reason  = p_data->>'exit_reason',
      unit_price   = COALESCE((p_data->>'unit_price')::int, unit_price),
      deposit      = COALESCE((p_data->>'deposit')::int, deposit),
      notes        = COALESCE(p_data->>'notes', notes),
      updated_at   = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO dorm.residents (
      student_no, name, phone, parent_phone, parent_name, class_name, type,
      building_id, room_id, semester_id, status, entry_date, unit_price, deposit, notes
    ) VALUES (
      p_data->>'student_no', p_data->>'name', p_data->>'phone',
      p_data->>'parent_phone', p_data->>'parent_name', p_data->>'class_name',
      COALESCE(p_data->>'type','regular'),
      (p_data->>'building_id')::int, (p_data->>'room_id')::int,
      (p_data->>'semester_id')::int,
      COALESCE(p_data->>'status','active'),
      (p_data->>'entry_date')::date,
      COALESCE((p_data->>'unit_price')::int, 0),
      COALESCE((p_data->>'deposit')::int, 0),
      p_data->>'notes'
    ) RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'ok', true);
END;
$$;

-- 8. 납부 추가/수정
CREATE OR REPLACE FUNCTION public.dorm_staff_upsert_payment(
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id       uuid;
  v_before   jsonb;
BEGIN
  IF p_data->>'id' IS NOT NULL THEN
    v_id := (p_data->>'id')::uuid;
    SELECT row_to_json(p)::jsonb INTO v_before FROM dorm.payments p WHERE p.id = v_id;

    UPDATE dorm.payments SET
      amount      = COALESCE((p_data->>'amount')::int, amount),
      due_date    = COALESCE((p_data->>'due_date')::date, due_date),
      paid_date   = COALESCE((p_data->>'paid_date')::date, paid_date),
      paid_amount = COALESCE((p_data->>'paid_amount')::int, paid_amount),
      status      = COALESCE(p_data->>'status', status),
      method      = COALESCE(p_data->>'method', method),
      sender_name = COALESCE(p_data->>'sender_name', sender_name),
      bank_sms    = COALESCE(p_data->>'bank_sms', bank_sms),
      memo        = COALESCE(p_data->>'memo', memo),
      updated_at  = now()
    WHERE id = v_id;

    INSERT INTO dorm.payment_events (payment_id, action, before_json, after_json, memo, created_by)
    VALUES (v_id, 'update', v_before, p_data, p_data->>'memo', p_data->>'created_by');
  ELSE
    INSERT INTO dorm.payments (
      resident_id, semester_id, period, amount, due_date, paid_date,
      paid_amount, status, method, sender_name, bank_sms, memo, created_by
    ) VALUES (
      (p_data->>'resident_id')::uuid,
      (p_data->>'semester_id')::int,
      p_data->>'period',
      COALESCE((p_data->>'amount')::int, 0),
      (p_data->>'due_date')::date,
      (p_data->>'paid_date')::date,
      COALESCE((p_data->>'paid_amount')::int, 0),
      COALESCE(p_data->>'status','unpaid'),
      p_data->>'method',
      p_data->>'sender_name',
      p_data->>'bank_sms',
      p_data->>'memo',
      p_data->>'created_by'
    ) RETURNING id INTO v_id;

    INSERT INTO dorm.payment_events (payment_id, action, after_json, created_by)
    VALUES (v_id, 'insert', p_data, p_data->>'created_by');
  END IF;

  UPDATE dorm.residents SET updated_at = now()
  WHERE id = (p_data->>'resident_id')::uuid;

  RETURN jsonb_build_object('id', v_id, 'ok', true);
END;
$$;

-- 9. 직원 민원 목록
CREATE OR REPLACE FUNCTION public.dorm_staff_complaints(
  p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'ticket_no', c.ticket_no,
      'resident_name', r.name,
      'room_label', COALESCE(c.room_label, b.short_name || ' ' || rm.room_no),
      'category', c.category,
      'title', c.title,
      'content', c.content,
      'images', c.images,
      'status', c.status,
      'priority', c.priority,
      'reply', c.reply,
      'replied_at', c.replied_at,
      'created_at', c.created_at
    ) ORDER BY
      CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      c.created_at DESC
    ), '[]')
    FROM dorm.complaints c
    LEFT JOIN dorm.residents r ON r.id = c.resident_id
    LEFT JOIN dorm.buildings b ON b.id = r.building_id
    LEFT JOIN dorm.rooms rm    ON rm.id = r.room_id
    WHERE p_status IS NULL OR c.status = p_status
  );
END;
$$;

-- 10. 민원 답변
CREATE OR REPLACE FUNCTION public.dorm_staff_reply_complaint(
  p_id     uuid,
  p_reply  text,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE dorm.complaints
  SET reply      = p_reply,
      status     = COALESCE(p_status, status),
      replied_at = now(),
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 11. 서명 링크 생성
CREATE OR REPLACE FUNCTION public.dorm_generate_sign_link(
  p_resident_id uuid,
  p_type        text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token    text;
  v_sign_id  uuid;
  v_tmpl_id  int;
BEGIN
  SELECT id INTO v_tmpl_id
  FROM dorm.doc_templates
  WHERE type = p_type AND is_active = true
  ORDER BY version DESC LIMIT 1;

  SELECT id, token INTO v_sign_id, v_token
  FROM dorm.doc_signs
  WHERE resident_id = p_resident_id AND type = p_type AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO dorm.doc_signs (resident_id, template_id, type)
    VALUES (p_resident_id, v_tmpl_id, p_type)
    RETURNING id, token INTO v_sign_id, v_token;
  END IF;

  RETURN jsonb_build_object(
    'token', v_token,
    'sign_id', v_sign_id,
    'url_path', 'dormitory/contract-sign-v2.html?t=' || v_token
  );
END;
$$;

-- 12. 서명 페이지 데이터
CREATE OR REPLACE FUNCTION public.dorm_sign_get_v2(
  p_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ds dorm.doc_signs%ROWTYPE;
  v_r  dorm.residents%ROWTYPE;
  v_t  dorm.doc_templates%ROWTYPE;
  v_b  dorm.buildings%ROWTYPE;
BEGIN
  SELECT * INTO v_ds FROM dorm.doc_signs WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_r FROM dorm.residents WHERE id = v_ds.resident_id;
  IF v_ds.template_id IS NOT NULL THEN
    SELECT * INTO v_t FROM dorm.doc_templates WHERE id = v_ds.template_id;
  END IF;
  SELECT * INTO v_b FROM dorm.buildings WHERE id = v_r.building_id;

  RETURN jsonb_build_object(
    'sign_id', v_ds.id,
    'type', v_ds.type,
    'status', v_ds.status,
    'expires_at', v_ds.expires_at,
    'name', v_r.name,
    'student_no', v_r.student_no,
    'building', v_b.name,
    'room', (SELECT room_no FROM dorm.rooms WHERE id = v_r.room_id),
    'start', v_r.entry_date,
    'end', v_r.exit_date,
    'unit_price', v_r.unit_price,
    'deposit', v_r.deposit,
    'template', COALESCE(v_t.content, ''),
    'template_title', COALESCE(v_t.title, '기숙사 ' || CASE v_ds.type WHEN 'contract' THEN '입소계약서' ELSE '생활서약서' END)
  );
END;
$$;

-- 13. 서명 제출
CREATE OR REPLACE FUNCTION public.dorm_sign_submit_v2(
  p_token       text,
  p_student_sig text,
  p_agree       bool,
  p_gname       text,
  p_gsign       text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ds dorm.doc_signs%ROWTYPE;
BEGIN
  SELECT * INTO v_ds FROM dorm.doc_signs WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', '링크를 찾을 수 없습니다'); END IF;
  IF v_ds.status = 'signed' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_signed'); END IF;
  IF v_ds.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'error', 'expired'); END IF;
  IF NOT p_agree THEN RETURN jsonb_build_object('ok', false, 'error', '동의가 필요합니다'); END IF;

  UPDATE dorm.doc_signs SET
    status        = 'signed',
    student_sig   = p_student_sig,
    guardian_name = p_gname,
    guardian_sig  = p_gsign,
    agreed        = true,
    signed_at     = now()
  WHERE token = p_token;

  RETURN jsonb_build_object('ok', true, 'signed_at', now());
END;
$$;

-- ============================================================
-- 초기 데이터
-- ============================================================

-- 건물 4개
INSERT INTO dorm.buildings (code, name, short_name, capacity, floor_count) VALUES
  ('bukkyung', '제2생활관 부경', '부경', 60, 5),
  ('beaver',   '제3생활관 비버', '비버', 50, 5),
  ('jinsoo',   '제4생활관 진수', '진수', 40, 4),
  ('goodi',    '제5생활관 구디', '구디', 44, 4)
ON CONFLICT (code) DO NOTHING;

-- 벌점 규정 (PPT 12쪽)
INSERT INTO dorm.penalty_rules (name, description, point, category) VALUES
  ('세탁물 장기 방치', '세탁물을 1주일 이상 방치한 경우', 1, '생활질서'),
  ('쓰레기 미분리', '쓰레기를 분리수거하지 않은 경우', 2, '생활질서'),
  ('소음·질서 위반', '소음 및 생활 질서를 위반한 경우', 2, '생활질서'),
  ('택배 장기 방치', '택배를 장기간 방치한 경우', 2, '생활질서'),
  ('전열기구 사용', '허가되지 않은 전열기구를 사용한 경우', 3, '안전'),
  ('공공요금 낭비', '전기·수도 등 공공요금을 낭비한 경우', 3, '안전'),
  ('외부인 무단출입', '외부인을 무단으로 출입시킨 경우', 5, '규정위반'),
  ('음주', '기숙사 내·외부에서 음주한 경우', 5, '규정위반'),
  ('흡연', '기숙사 내·외부에서 흡연한 경우', 5, '규정위반'),
  ('반려동물 반입', '반려동물을 기숙사에 반입한 경우', 5, '규정위반'),
  ('시설물 오염·파손', '기숙사 시설물을 오염 또는 파손한 경우 (변상 별도)', 5, '시설'),
  ('비품 절취', '기숙사 비품을 절취한 경우', 5, '시설')
ON CONFLICT DO NOTHING;

-- 마스터 토큰 1개 (설치 후 SELECT token FROM dorm.master_tokens; 로 확인)
INSERT INTO dorm.master_tokens (token, label) VALUES
  (gen_random_uuid()::text, '경영자 마스터 링크')
ON CONFLICT DO NOTHING;

-- 활성 학기 (2025년 2학기 예시)
INSERT INTO dorm.semesters (name, year, term, start_date, end_date, is_active) VALUES
  ('2025년 2학기', 2025, 2, '2025-07-01', '2025-12-31', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 설치 완료 확인
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'dorm' ORDER BY 1;
-- SELECT token, label, created_at FROM dorm.master_tokens;
-- ============================================================
