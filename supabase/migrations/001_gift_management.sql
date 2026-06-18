-- ============================================================
-- 기념품 관리 시스템 스키마
-- 생성일: 2026-06-18
-- 적용됨: Supabase MCP via apply_migration
-- ============================================================

-- 1. 관리자 계정 테이블
CREATE TABLE IF NOT EXISTS gift_admin_users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('master', 'admin')),
  department    text,
  telegram_id   text,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  created_by    uuid REFERENCES gift_admin_users(id)
);

-- 2. 물품 마스터 테이블
CREATE TABLE IF NOT EXISTS gift_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  category          text,
  description       text,
  image_url         text,
  stock_qty         int NOT NULL DEFAULT 0,
  min_stock_alert   int DEFAULT 10,
  max_per_request   int DEFAULT 3,
  storage_location  text DEFAULT '4층 기자재실',
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- 3. 신청 접수 테이블
CREATE TABLE IF NOT EXISTS gift_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid NOT NULL REFERENCES gift_items(id),
  requester_name   text NOT NULL,
  requester_org    text NOT NULL,
  requester_phone  text,
  purpose          text NOT NULL,
  qty              int NOT NULL CHECK (qty > 0),
  status           text DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','dispatched')),
  handled_by       uuid REFERENCES gift_admin_users(id),
  handled_at       timestamptz,
  reject_reason    text,
  note             text,
  created_at       timestamptz DEFAULT now()
);

-- 4. 불출 이력 테이블
CREATE TABLE IF NOT EXISTS gift_dispatch_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES gift_requests(id),
  dispatched_by   uuid NOT NULL REFERENCES gift_admin_users(id),
  dispatched_at   timestamptz DEFAULT now(),
  qty_dispatched  int NOT NULL,
  note            text
);

-- 5. 시스템 설정 테이블
CREATE TABLE IF NOT EXISTS gift_system_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz DEFAULT now()
);

INSERT INTO gift_system_config (key, value) VALUES
  ('telegram_bot_token', ''),
  ('telegram_chat_id', ''),
  ('telegram_notify_enabled', 'true'),
  ('min_stock_global_alert', '5')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE gift_admin_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_dispatch_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gift_master_manage_admins" ON gift_admin_users FOR ALL
  USING (EXISTS (SELECT 1 FROM gift_admin_users WHERE id = auth.uid() AND role = 'master' AND is_active = true));

CREATE POLICY "gift_admin_view_own" ON gift_admin_users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "gift_items_public_read" ON gift_items FOR SELECT USING (is_active = true);

CREATE POLICY "gift_master_manage_items" ON gift_items FOR ALL
  USING (EXISTS (SELECT 1 FROM gift_admin_users WHERE id = auth.uid() AND role = 'master' AND is_active = true));

CREATE POLICY "gift_requests_public_insert" ON gift_requests FOR INSERT WITH CHECK (true);

CREATE POLICY "gift_requests_admin_read" ON gift_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM gift_admin_users WHERE id = auth.uid() AND is_active = true));

CREATE POLICY "gift_requests_admin_update" ON gift_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM gift_admin_users WHERE id = auth.uid() AND is_active = true));

CREATE POLICY "gift_dispatch_admin_all" ON gift_dispatch_log FOR ALL
  USING (EXISTS (SELECT 1 FROM gift_admin_users WHERE id = auth.uid() AND is_active = true));

CREATE POLICY "gift_config_master_only" ON gift_system_config FOR ALL
  USING (EXISTS (SELECT 1 FROM gift_admin_users WHERE id = auth.uid() AND role = 'master' AND is_active = true));

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE gift_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE gift_items;

-- ============================================================
-- 초기 물품 데이터
-- ============================================================
INSERT INTO gift_items (name, category, stock_qty, min_stock_alert, max_per_request, storage_location)
VALUES
  ('꿀',         '직업계고',   5,    10,  3, '4층 기자재실'),
  ('소금',       '직업계고',   0,    10,  3, '4층 기자재실'),
  ('3개 SET',    '자민경',     9,     5,  1, '4층 기자재실'),
  ('달팽이크림', '자민경',     42,   15,  3, '4층 기자재실'),
  ('오일투폼',   '자민경',     126,  20,  3, '4층 기자재실'),
  ('머그컵 2P',  '머그컵',     400,  30,  2, '4층 기자재실'),
  ('머그컵 1P',  '머그컵',     56,   20,  2, '4층 기자재실')
ON CONFLICT DO NOTHING;
