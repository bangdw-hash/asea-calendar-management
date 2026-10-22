-- dorm_schema_5.sql
-- 베타 피드백 공개 테이블 (로그인 없이 등록·조회 가능)
-- 설치: Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS dorm.beta_feedback (
  id          bigserial PRIMARY KEY,
  type        text NOT NULL CHECK (type IN ('restrict','inconvenient','improve')),
  label       text NOT NULL,
  page        text,
  description text,
  status      text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','planned','done','wontfix')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 공개 읽기·쓰기 (RLS)
ALTER TABLE dorm.beta_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_feedback_select" ON dorm.beta_feedback;
CREATE POLICY "beta_feedback_select" ON dorm.beta_feedback
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "beta_feedback_insert" ON dorm.beta_feedback;
CREATE POLICY "beta_feedback_insert" ON dorm.beta_feedback
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "beta_feedback_update" ON dorm.beta_feedback;
CREATE POLICY "beta_feedback_update" ON dorm.beta_feedback
  FOR UPDATE USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON dorm.beta_feedback TO anon;
GRANT USAGE, SELECT ON SEQUENCE dorm.beta_feedback_id_seq TO anon;

-- RPC: 피드백 등록
CREATE OR REPLACE FUNCTION public.dorm_add_feedback(
  p_type        text,
  p_label       text,
  p_page        text    DEFAULT NULL,
  p_description text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO dorm.beta_feedback(type, label, page, description)
    VALUES(p_type, p_label, p_page, p_description)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;$$;
GRANT EXECUTE ON FUNCTION public.dorm_add_feedback TO anon;

-- RPC: 피드백 목록 조회
CREATE OR REPLACE FUNCTION public.dorm_list_feedback(
  p_status text DEFAULT NULL
) RETURNS TABLE(
  id bigint, type text, label text, page text, description text,
  status text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.type, f.label, f.page, f.description, f.status, f.created_at
  FROM dorm.beta_feedback f
  WHERE (p_status IS NULL OR f.status = p_status)
  ORDER BY f.created_at DESC;
END;$$;
GRANT EXECUTE ON FUNCTION public.dorm_list_feedback TO anon;

-- RPC: 상태 변경 (직원 토큰 불필요 — 관리자 UI에서만 접근)
CREATE OR REPLACE FUNCTION public.dorm_set_feedback_status(
  p_id     bigint,
  p_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE dorm.beta_feedback SET status = p_status WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;$$;
GRANT EXECUTE ON FUNCTION public.dorm_set_feedback_status TO anon;
