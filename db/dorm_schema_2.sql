-- dorm_schema_2.sql
-- 전화번호+이름 로그인 RPC 추가
-- 실행: Supabase SQL 에디터에서 전체 붙여넣기

-- 전화번호 정규화 헬퍼 (하이픈·공백 제거)
CREATE OR REPLACE FUNCTION dorm._normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(p,''), '[^0-9]', '', 'g');
$$;

-- 전화번호 + 이름으로 입소자 조회 (입소자 포털 로그인용)
CREATE OR REPLACE FUNCTION dorm_resident_phone_login(
  p_phone text,
  p_name  text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_res      dorm.residents%ROWTYPE;
  v_building dorm.buildings%ROWTYPE;
BEGIN
  SELECT r.* INTO v_res
  FROM dorm.residents r
  WHERE dorm._normalize_phone(r.phone) = dorm._normalize_phone(p_phone)
    AND r.name = p_name
    AND r.status IN ('active','applied')
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT b.* INTO v_building
  FROM dorm.buildings b WHERE b.id = v_res.building_id;

  RETURN jsonb_build_object(
    'resident_id',    v_res.id,
    'name',           v_res.name,
    'student_no',     v_res.student_no,
    'phone',          v_res.phone,
    'portal_token',   v_res.portal_token,
    'building_name',  v_building.name,
    'building_short', v_building.short_name,
    'room',           v_res.room_no,
    'status',         v_res.status,
    'contracts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'building', v_building.name, 'room', v_res.room_no,
        'start', l.start_date, 'end', l.end_date,
        'unit_price', l.unit_price, 'deposit', l.deposit,
        'type', l.type, 'status', l.status
      ) ORDER BY l.start_date DESC), '[]')
      FROM dorm.leases l WHERE l.resident_id = v_res.id
    ),
    'payments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'period', p.period, 'amount', p.amount,
        'due_date', p.due_date, 'status', p.status, 'paid_at', p.paid_at
      ) ORDER BY p.period DESC), '[]')
      FROM dorm.payments p WHERE p.resident_id = v_res.id
    ),
    'utility_bills', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'semester', u.semester, 'amount', u.amount,
        'due_date', u.due_date, 'status', u.status
      ) ORDER BY u.due_date DESC), '[]')
      FROM dorm.utility_bills u WHERE u.resident_id = v_res.id
    ),
    'penalties', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', pen.id, 'rule_name', pr.name, 'points', pr.points,
        'issued_at', pen.issued_at, 'note', pen.note
      ) ORDER BY pen.issued_at DESC), '[]')
      FROM dorm.penalties pen
      JOIN dorm.penalty_rules pr ON pr.id = pen.rule_id
      WHERE pen.resident_id = v_res.id
    ),
    'doc_signs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', ds.id, 'type', ds.type, 'status', ds.status,
        'token', ds.token, 'signed_at', ds.signed_at
      ) ORDER BY ds.created_at DESC), '[]')
      FROM dorm.doc_signs ds WHERE ds.resident_id = v_res.id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION dorm_resident_phone_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION dorm._normalize_phone(text) TO anon, authenticated;
