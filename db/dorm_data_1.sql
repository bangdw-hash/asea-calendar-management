-- ============================================================
-- 아세아 생활관 초기 데이터 v1 — 2026학년도 1학기
-- 실행 전: dorm_schema_1.sql ~ dorm_schema_4.sql 모두 실행 완료 확인
-- 실행 방법: Supabase SQL Editor > New Query > 전체 붙여넣기 > Run
-- ============================================================

BEGIN;

-- ── 학기 ──────────────────────────────────────────────────
INSERT INTO dorm.semesters (id, name, year, term, start_date, end_date, is_active) VALUES
  (1, '2026학년도 1학기', 2026, 1, '2026-02-26', '2026-08-16', true)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, is_active=EXCLUDED.is_active;

-- ── 건물 ──────────────────────────────────────────────────
INSERT INTO dorm.buildings (id, code, name, short_name, capacity, is_active, notes) VALUES
  (1, 'bukkyung', '제2생활관(부경파크)', '부경파크', 80, true, '서울 영등포구 당산로27길 19-2'),
  (2, 'beaver',   '제3생활관(비버하우스)', '비버하우스', 44, true, '서울 영등포구 국회대로38길 8, 3층'),
  (3, 'jinsu',    '제4생활관(진수빌딩)', '진수빌딩', 20, true, '서울 영등포구 당산동3가 180 (여자 전용)'),
  (4, 'gudi',     '제5생활관(구디)', '구디', 40, true, '서울 구로구 구로동 1127-6')
ON CONFLICT (id) DO NOTHING;

-- ── 호실 ──────────────────────────────────────────────────
INSERT INTO dorm.rooms (building_id, room_no, capacity) VALUES
  (1, '121', 1),
  (1, '122', 2),
  (1, '123', 2),
  (1, '125', 2),
  (1, '126', 1),
  (1, '128', 2),
  (1, '131', 2),
  (1, '132', 2),
  (1, '133', 2),
  (1, '135', 2),
  (1, '136', 2),
  (1, '137', 2),
  (1, '138', 2),
  (1, '141', 1),
  (1, '142', 2),
  (1, '143', 2),
  (1, '144', 1),
  (1, '146', 2),
  (1, '147', 2),
  (1, '151', 2),
  (1, '155', 2),
  (1, '156', 2),
  (1, '158', 2),
  (1, '162', 2),
  (1, '163', 2),
  (1, '165', 2),
  (1, '166', 2),
  (1, '167', 2),
  (1, '168', 2),
  (1, '171', 2),
  (1, '172', 2),
  (1, '175', 2),
  (1, '176', 2),
  (1, '177', 2),
  (1, '178', 2),
  (1, '182', 2),
  (1, '334', 1),
  (1, '354', 2),
  (1, '374', 2),
  (1, '384', 2),
  (2, '03', 1),
  (2, '05', 1),
  (2, '06', 1),
  (2, '07', 1),
  (2, '08', 1),
  (2, '09', 1),
  (2, '10', 1),
  (2, '11', 1),
  (2, '12', 1),
  (2, '13', 1),
  (2, '14', 1),
  (2, '15', 1),
  (2, '16', 1),
  (2, '17', 1),
  (2, '18', 1),
  (2, '19', 1),
  (2, '20', 1),
  (2, '21', 1),
  (2, '22', 1),
  (2, '23', 1),
  (2, '24', 1),
  (2, '25', 1),
  (2, '26', 1),
  (2, '27', 1),
  (2, '28', 1),
  (2, '29', 1),
  (2, '30', 1),
  (2, '31', 1),
  (2, '32', 1),
  (2, '33', 1),
  (2, '34', 1),
  (2, '35', 1),
  (2, '36', 1),
  (2, '37', 1),
  (2, '38', 1),
  (2, '39', 1),
  (2, '40', 1),
  (2, '41', 1),
  (2, '42', 1),
  (2, '43', 1),
  (3, '201', 2),
  (3, '202', 2),
  (3, '204', 1),
  (3, '302', 2),
  (3, '304', 2),
  (3, '305', 2),
  (3, '401', 2),
  (3, '402', 2),
  (3, '404', 2),
  (3, '405', 1),
  (3, '504', 1),
  (3, '505', 2),
  (3, '601', 4),
  (3, '602', 2),
  (3, '603', 2),
  (4, '201', 2),
  (4, '202', 1),
  (4, '203', 2),
  (4, '205', 2),
  (4, '206', 2),
  (4, '301', 2),
  (4, '302', 2),
  (4, '303', 2),
  (4, '305', 2),
  (4, '306', 3),
  (4, '401', 2),
  (4, '402', 2),
  (4, '403', 2),
  (4, '405', 2),
  (4, '406', 3),
  (4, '501', 5),
  (4, '502', 3)
ON CONFLICT (building_id, room_no) DO NOTHING;

-- ── 입소자 + 납부 ──────────────────────────────────────────
DO $dorm$
DECLARE rid uuid;
BEGIN

  -- 위탁(12호) / 3생활관(비버) 12호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(12호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='12'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(13호) / 3생활관(비버) 13호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(13호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='13'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(14호) / 3생활관(비버) 14호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(14호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='14'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(15호) / 3생활관(비버) 15호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(15호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='15'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(16호) / 3생활관(비버) 16호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(16호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='16'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(17호) / 3생활관(비버) 17호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(17호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='17'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(18호) / 3생활관(비버) 18호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(18호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='18'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(19호) / 3생활관(비버) 19호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(19호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='19'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(20호) / 3생활관(비버) 20호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(20호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='20'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(27호) / 3생활관(비버) 27호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(27호)', NULL, NULL,
    NULL, 'consign', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='27'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 위탁(404호) / 4생활관(진수) 404호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(404호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='404'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(404호) / 4생활관(진수) 404호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(404호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='404'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(505호) / 4생활관(진수) 505호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(505호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='505'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(505호) / 4생활관(진수) 505호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(505호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='505'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(601호) / 4생활관(진수) 601호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(601호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='601'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(601호) / 4생활관(진수) 601호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(601호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='601'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(601호) / 4생활관(진수) 601호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(601호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='601'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(601호) / 4생활관(진수) 601호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(601호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='601'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(602호) / 4생활관(진수) 602호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(602호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='602'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(602호) / 4생활관(진수) 602호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(602호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='602'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(603호) / 4생활관(진수) 603호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(603호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='603'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 위탁(603호) / 4생활관(진수) 603호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '위탁(603호)', NULL, NULL,
    NULL, 'consign', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '고교위탁'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='603'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2330000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 김유진 / 2생활관(부경) 125호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610504', '김유진', '010-7603-7018', NULL,
    '항공정비계열 1학년 5반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='125'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 100000, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 송정현 / 2생활관(부경) 165호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610111', '송정현', '010-6349-7144', '010-8457-7707',
    '항공정비계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='165'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 100000, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 김진욱 / 2생활관(부경) 166호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610607', '김진욱', '010-8239-1982', NULL,
    '항공정비계열 1학년 6반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='166'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 0, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 이아솔 / 2생활관(부경) 168호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202694117', '이아솔', '010-4021-4502', '010-5311-5945',
    '국방경찰계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='168'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 100000, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 문수혁 / 2생활관(부경) 171호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682209', '문수혁', '010-6555-2371', NULL,
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='171'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 100000, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 장근호 / 2생활관(부경) 354호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202658114', '장근호', '010-2938-2070', NULL,
    '항공정비계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '미납_월분납(43만원)_청소비받아야함'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='354'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 100000, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 김태유 / 2생활관(부경) 374호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682207', '김태유', '010-8510-2965', '010-9077-2965',
    '항공보안계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='374'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 100000, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 박홍균 / 2생활관(부경) 374호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682114', '박홍균', '010-7249-9070', '010-4432-1254',
    '항공보안계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='374'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 100000, 'unpaid', '청소비 50,000원 포함');
  END IF;

  -- 함승훈 / 3생활관(비버) 32호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202649126', '함승훈', '010-4305-7266', '010-5758-7266',
    '스마트안전진단계열 1학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 450000, '미납_월분납(45만원)_청소비받아야함'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='32'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2770000, '2026-02-28', 100000, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 김태영 / 5생활관(구디) 201호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202582108', '김태영', '010-8550-2614', '010-8550-1828',
    '항공보안계열 2학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='201'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 0, 'unpaid', NULL);
  END IF;

  -- 김태종 / 5생활관(구디) 203호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510108', '김태종', '010-5256-9380', '010-5114-7695',
    '항공정비계열 2학년 3반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='203'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 0, 'unpaid', NULL);
  END IF;

  -- 이성민 / 5생활관(구디) 205호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610219', '이성민', '010-6684-6554', NULL,
    '항공정비계열 1학년 2반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='205'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 0, 'unpaid', NULL);
  END IF;

  -- 박준현 / 5생활관(구디) 205호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510216', '박준현', '010-4084-4738', '010-6377-4738',
    '항공정비계열 2학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='205'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 0, 'unpaid', NULL);
  END IF;

  -- 김왕준 / 5생활관(구디) 502호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510502', '김왕준', '010-5269-8781', '010-3318-8781',
    '항공정비계열 2학년 3반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='502'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 0, 'unpaid', NULL);
  END IF;

  -- 김동휘 / 2생활관(부경) 121호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682202', '김동휘', '010-4385-5770', NULL,
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 750000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='121'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 4570000, '2026-02-28', 4570000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 김준경 / 2생활관(부경) 122호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610407', '김준경', '010-9554-3172', '010-8555-3172',
    '항공정비계열 1학년 4반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='122'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 강요환 / 2생활관(부경) 122호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610401', '강요환', '010-6647-4023', NULL,
    '항공정비계열 1학년 4반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='122'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 장철훈 / 2생활관(부경) 126호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202694122', '장철훈', '010-2208-7019', '010-2440-7415',
    '국방경찰계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 750000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='126'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 4570000, '2026-02-28', 4570000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 김규민 / 2생활관(부경) 131호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610702', '김규민', '010-4573-6063', '010-2748-6063',
    '항공정비계열 1학년 7반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='131'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 허찬민 / 2생활관(부경) 131호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610428', '허찬민', '010-8970-3303', '82--',
    '항공정비계열 1학년 4반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='131'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 정훈희 / 2생활관(부경) 132호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610624', '정훈희', '010-7433-7217', '010-7713-7217',
    '항공정비계열 1학년 6반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='132'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 오승우 / 2생활관(부경) 133호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610512', '오승우', '010-5848-7112', '010-3798-7112',
    '항공정비계열 1학년 5반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='133'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 박금녕 / 2생활관(부경) 133호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610213', '박금녕', '010-9896-3559', '010-3422-3559',
    '항공정비계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='133'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이충현 / 2생활관(부경) 135호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682221', '이충현', '010-2476-5239', '010-2208-2486',
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='135'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김정원 / 2생활관(부경) 135호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682107', '김정원', '010-4981-2997', '010-4154-5914',
    '항공보안계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='135'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 박상우 / 2생활관(부경) 136호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610215', '박상우', '010-2402-4891', '010-7111-9658',
    '항공정비계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='136'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 권태완 / 2생활관(부경) 136호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610102', '권태완', '010-6341-5773', '010-8528-5773',
    '항공정비계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='136'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 임종민 / 2생활관(부경) 137호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610519', '임종민', '010-2395-5524', '010-4366-5524',
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='137'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김수용 / 2생활관(부경) 137호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610704', '김수용', '010-2145-8890', '010-6397-8890',
    '항공정비계열 1학년 7반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='137'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김태우 / 2생활관(부경) 138호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202649103', '김태우', '010-6684-2478', '010-3399-2478',
    '스마트안전진단계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='138'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 박영재 / 2생활관(부경) 142호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202649105', '박영재', '010-2061-8006', '010-7254-8006',
    '스마트안전진단계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='142'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 박건하 / 2생활관(부경) 142호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682210', '박건하', '010-8414-5292', '010-5658-5292',
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='142'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이상민 / 2생활관(부경) 143호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202649114', '이상민', '010-4643-8017', '010-4096-8017',
    '스마트안전진단계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='143'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 박건하 / 2생활관(부경) 143호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202649104', '박건하', '010-4289-7050', '010-4119-7050',
    '스마트안전진단계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '홍자영 5만추가입금확인(총268만원)'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='143'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 안기연 / 2생활관(부경) 146호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610616', '안기연', '010-5182-8789', '010-6892-8789',
    '항공정비계열 1학년 6반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='146'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 여지원 / 2생활관(부경) 146호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610415', '여지원', '010-2140-6341', '010-6434-6341',
    '항공정비계열 1학년 4반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='146'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 옥덕민 / 2생활관(부경) 147호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610417', '옥덕민', '010-6389-9198', NULL,
    '항공정비계열 1학년 4반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='147'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 양도원 / 2생활관(부경) 147호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682119', '양도원', '010-7538-4670', '010-2608-5450',
    '항공보안계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='147'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이태기 / 2생활관(부경) 151호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682124', '이태기', '010-3386-3663', '010-2675-7775',
    '항공보안계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='151'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 손민호 / 2생활관(부경) 151호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682116', '손민호', '010-7643-5653', '010-2255-0632',
    '항공보안계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='151'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 송시현 / 2생활관(부경) 155호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202410213', '송시현', '010-6546-2380', '010-4143-2380',
    '항공정비계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='155'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 임재성 / 2생활관(부경) 156호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202410222', '임재성', '010-4733-9843', '010-5438-9843',
    '항공정비계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='156'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 오승민 / 2생활관(부경) 156호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202410414', '오승민', '010-5805-0936', '010-2011-7766',
    '항공정비계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='156'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이승찬 / 2생활관(부경) 158호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682219', '이승찬', '010-7154-3672', '010-3477-2997',
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='158'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이우성 / 2생활관(부경) 162호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202453129', '이우성', '010-7207-7744', '010-2373-3223',
    '스마트안전진단계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='162'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 문주혁 / 2생활관(부경) 162호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202453110', '문주혁', '010-4002-5501', '010-6401-5501',
    '스마트안전진단계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='162'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 장세민 / 2생활관(부경) 163호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610321', '장세민', '010-4046-4254', NULL,
    '항공정비계열 1학년 3반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='163'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이찬민 / 2생활관(부경) 163호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202649119', '이찬민', '010-4080-1738', '010-3246-1738',
    '스마트안전진단계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='163'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 박성빈 / 2생활관(부경) 165호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202658105', '박성빈', '010-8664-2064', '010-5251-0112',
    '항공정비계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='165'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 백승훈 / 2생활관(부경) 166호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610710', '백승훈', '010-9389-1184', '010-8918-1184',
    '항공정비계열 1학년 7반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '1년치 일괄납부'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='166'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 5210000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 임헌중 / 2생활관(부경) 167호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202410121', '임헌중', '010-7636-6318', '010-3898-6318',
    '항공정비계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='167'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 용창범 / 2생활관(부경) 167호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202410116', '용창범', '010-5710-5324', '010-9079-5323',
    '항공정비계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='167'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 허영재 / 2생활관(부경) 171호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682230', '허영재', '010-8239-3346', '010-7480-3346',
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='171'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 최수빈 / 2생활관(부경) 172호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202410124', '최수빈', '010-5540-0329', '010-9063-6060',
    '항공정비계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='172'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김선용 / 2생활관(부경) 172호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202410106', '김선용', '010-7337-4018', '010-5424-6894',
    '항공정비계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='172'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 박인준 / 2생활관(부경) 175호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610412', '박인준', '010-6561-5828', '010-5284-5828',
    '항공정비계열 1학년 4반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '1년치 일괄납부'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='175'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 5210000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 한태민 / 2생활관(부경) 176호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510426', '한태민', '010-2230-0969', '010-6478-0969',
    '항공정비계열 2학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='176'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 송창혁 / 2생활관(부경) 176호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510312', '송창혁', '010-5063-1951', '010-9084-1951',
    '항공정비계열 2학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='176'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김준서 / 2생활관(부경) 177호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610408', '김준서', '010-9934-3139', NULL,
    '항공정비계열 1학년 4반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='177'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김현우 / 2생활관(부경) 177호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682233', '김현우', '010-4717-7863', '010-8522-7863',
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='177'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김민재 / 2생활관(부경) 178호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682204', '김민재', '010-3720-7948', '010-2562-3743',
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='178'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김진우 / 2생활관(부경) 178호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682108', '김진우', '010-5670-7896', '010-5252-0989',
    '항공보안계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='178'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 우경훈 / 2생활관(부경) 182호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202453121', '우경훈', '010-3914-7601', '010-9110-4701',
    '스마트안전진단계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='182'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 심한섭 / 2생활관(부경) 182호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202453118', '심한섭', '010-6793-1259', '01072306565',
    '스마트안전진단계열 3학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='182'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이수 / 2생활관(부경) 354호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610513', '이수', '010-8255-8706', '010-2450-3467',
    '항공정비계열 1학년 5반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, NULL
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='354'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 정경민 / 3생활관(비버) 03호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202590101', '정경민', '010-2290-5090', '010-9497-1078',
    '항공보안계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='03'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 이대건 / 3생활관(비버) 05호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510411', '이대건', '010-8494-7721', '010-9111-7721',
    '항공정비계열 2학년 2반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 520000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='05'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 3190000, '2026-02-28', 3190000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 박은호 / 3생활관(비버) 06호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510110', '박은호', '010-7714-7730', '010-8406-4878',
    '항공정비계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='06'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 문성서 / 3생활관(비버) 07호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202382116', '문성서', '010-5540-0302', NULL,
    '항공보안계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 520000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='07'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 3190000, '2026-02-28', 3190000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 윤동규 / 3생활관(비버) 08호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202649111', '윤동규', '010-6281-5642', '010-8506-5642',
    '스마트안전진단계열 1학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 340000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='08'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2110000, '2026-02-28', 2110000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 최태양 / 3생활관(비버) 09호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610327', '최태양', '010-4270-1877', '010-7476-5090',
    '항공정비계열 1학년 3반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='09'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 최현우 / 3생활관(비버) 10호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202658119', '최현우', '010-2180-5236', NULL,
    '항공정비계열 1학년 5반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='10'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 이규람 / 3생활관(비버) 11호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610717', '이규람', '010-8317-7088', '010-3241-7088',
    '항공정비계열 1학년 7반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='11'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 이용운 / 3생활관(비버) 21호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202310129', '이용운', '010-5186-8041', '010-5181-8041',
    '항공정비계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='21'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 2290000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 최이한 / 3생활관(비버) 22호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202582134', '최이한', '010-8488-6727', '010-6886-4892',
    '항공보안계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='22'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 2290000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 백근호 / 3생활관(비버) 23호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202549102', '백근호', '010-2043-5904', '010-2546-5904',
    '스마트안전진단계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='23'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 2290000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 장보윤 / 3생활관(비버) 25호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610622', '장보윤', '010-5298-8905', NULL,
    '항공정비계열 1학년 6반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='25'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 2290000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 권세현 / 3생활관(비버) 26호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202553101', '권세현', '010-3264-3548', '010-4940-3548',
    '스마트안전진단계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='26'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 2290000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 이성철 / 3생활관(비버) 29호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202582124', '이성철', '010-5113-7102', '010-8594-3647',
    '항공보안계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='29'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 2290000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 서은혁 / 3생활관(비버) 31호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610713', '서은혁', '010-7625-0452', NULL,
    '항공정비계열 1학년 7반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='31'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 이동규 / 3생활관(비버) 33호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510412', '이동규', '010-2120-8397', '010-4424-3133',
    '항공정비계열 2학년 2반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='33'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 김지원 / 3생활관(비버) 34호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202549101', '김지원', '010-2330-2840', '010-5833-2504',
    '스마트안전진단계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='34'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 김준서 / 3생활관(비버) 35호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510305', '김준서', '010-4845-9801', '010-5064-5358',
    '항공정비계열 2학년 3반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 450000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='35'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2770000, '2026-02-28', 2770000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 한동연 / 3생활관(비버) 36호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202583108', '한동연', '010-5641-4633', '010-7179-4848',
    '항공보안계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='36'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 석지훈 / 3생활관(비버) 37호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510511', '석지훈', '010-3664-5435', '010-6450-5435',
    '항공정비계열 2학년 3반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 450000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='37'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2770000, '2026-02-28', 2770000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 김대용 / 3생활관(비버) 38호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202558101', '김대용', '010-9731-9150', '010-8258-0011',
    '스마트안전진단계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 450000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='38'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2770000, '2026-02-28', 2770000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 정건준 / 3생활관(비버) 39호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202549109', '정건준', '010-4992-9552', '010-9193-8244',
    '스마트안전진단계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='39'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 김원빈 / 3생활관(비버) 41호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202583104', '김원빈', '010-9350-2566', '010-4485-1006',
    '항공보안계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 450000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='41'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2770000, '2026-02-28', 2770000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 김재석 / 3생활관(비버) 42호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510403', '김재석', '010-6495-5785', '010-9979-3870',
    '항공정비계열 2학년 1반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 410000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='42'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2530000, '2026-02-28', 2530000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 이정훈 / 3생활관(비버) 43호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510417', '이정훈', '010-5848-0990', '010-7685-8885',
    '항공정비계열 2학년 2반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 500000, NULL
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='43'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 3070000, '2026-02-28', 3070000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 박연우 / 4생활관(진수) 202호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202524122', '박연우', '010-4194-4183', '010-3000-4183',
    '항공관광계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='202'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 2690000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김지현 / 4생활관(진수) 202호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202524105', '김지현', '010-3208-3173', '010-8977-9328',
    '항공관광계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='202'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 2690000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 한승지 / 4생활관(진수) 204호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202582135', '한승지', '010-7589-2029', '010-9179-2029',
    '항공보안계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 750000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='204'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 4570000, '2026-02-28', 4570000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 박혜원 / 4생활관(진수) 302호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682113', '박혜원', '010-9958-0977', '010-7682-0977',
    '항공보안계열 1학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 421667, '부경에서이동(부경비용적용)'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='302'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2580000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 전수현 / 4생활관(진수) 304호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682127', '전수현', '010-3758-9479', '010-5490-9125',
    '항공보안계열 1학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '부경에서이동(부경비용적용)'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='304'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 오세은 / 4생활관(진수) 304호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202694111', '오세은', '010-5633-9253', NULL,
    '국방경찰계열 1학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '부경에서이동(부경비용적용)'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='304'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김하늬 / 4생활관(진수) 305호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202694106', '김하늬', '010-5207-8620', '010-7362-8620',
    '국방경찰계열 1학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '부경에서이동(부경비용적용)'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='305'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김현지 / 4생활관(진수) 305호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682110', '김현지', '010-9485-0167', '010-5467-0167',
    '항공보안계열 1학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '부경에서이동(부경비용적용)'
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='305'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 2630000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 김세진유현 / 4생활관(진수) 401호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202570102', '김세진유현', '010-2450-5572', '010-7919-5572',
    '국방경찰계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='401'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 2690000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 안혜인 / 4생활관(진수) 401호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202582118', '안혜인', '010-9995-1557', '010-3291-0391',
    '항공보안계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='401'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 2690000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 백유림 / 4생활관(진수) 402호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202524115', '백유림', '010-9526-1142', '010-5199-1142',
    '항공관광계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='402'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 2690000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 장보라 / 4생활관(진수) 402호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202594115', '장보라', '010-7916-0926', '010-5470-2588',
    '국방경찰계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 440000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='402'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2690000, '2026-02-28', 2690000, 'paid', '청소비 50,000원 포함');
  END IF;

  -- 이혜원 / 4생활관(진수) 405호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202524114', '이혜원', '010-3645-3270', NULL,
    '항공관광계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 750000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='405'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 4570000, '2026-02-28', 4570000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 신주연 / 4생활관(진수) 504호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202582115', '신주연', '010-6644-8079', '010-4449-4728',
    '항공보안계열 2학년 1반', 'regular', 3,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 750000, NULL
  FROM dorm.rooms r WHERE r.building_id=3 AND r.room_no='504'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 4570000, '2026-02-28', 4570000, 'paid', '청소비 70,000원 포함');
  END IF;

  -- 강시우 / 5생활관(구디) 203호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202583101', '강시우', '010-3304-5036', '010-9334-5036',
    '항공보안계열 2학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='203'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 우수한 / 5생활관(구디) 206호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202594109', '우수한', '010-5229-3761', '010-3757-3761',
    '국방경찰계열 2학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='206'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 송채윤 / 5생활관(구디) 301호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610315', '송채윤', '010-2373-3198', '010-4268-7892',
    '항공정비계열 1학년 3반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='301'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 이진범 / 5생활관(구디) 301호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610518', '이진범', '010-2432-5182', '010-4312-5182',
    '항공정비계열 1학년 5반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='301'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 조형준 / 5생활관(구디) 302호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610525', '조형준', '010-5453-8662', '010-9439-0130',
    '항공정비계열 1학년 5반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='302'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 2100000, 'paid', NULL);
  END IF;

  -- 김석환 / 5생활관(구디) 302호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610206', '김석환', '010-4234-7591', '010-2822-7591',
    '항공정비계열 1학년 2반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='302'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 2100000, 'paid', NULL);
  END IF;

  -- 김대훈 / 5생활관(구디) 303호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610303', '김대훈', '010-3052-9277', '010-3163-9277',
    '항공정비계열 1학년 3반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='303'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 김정헌 / 5생활관(구디) 303호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610706', '김정헌', '010-8649-9414', '010-4564-9414',
    '항공정비계열 1학년 7반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='303'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 이진욱 / 5생활관(구디) 306호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610422', '이진욱', '010-4025-2871', '010-8997-2871',
    '항공정비계열 1학년 4반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='306'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 2100000, 'paid', NULL);
  END IF;

  -- 최유성 / 5생활관(구디) 306호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610628', '최유성', '010-7670-1092', '010-4583-0778',
    '항공정비계열 1학년 6반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='306'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 2100000, 'paid', NULL);
  END IF;

  -- 박성재 / 5생활관(구디) 401호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610508', '박성재', '010-8830-3275', '010-4746-3275',
    '항공정비계열 1학년 5반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='401'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 김재원 / 5생활관(구디) 401호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510105', '김재원', '010-8934-8648', '010-3474-8648',
    '항공정비계열 2학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='401'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 이주하 / 5생활관(구디) 403호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610117', '이주하', '010-3184-2583', '010-9701-2582',
    '항공정비계열 1학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='403'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 박진성 / 5생활관(구디) 405호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610510', '박진성', '010-8815-8115', '010-9363-8115',
    '항공정비계열 1학년 5반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='405'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 박상진 / 5생활관(구디) 405호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610612', '박상진', '010-8216-3178', '010-9216-3178',
    '항공정비계열 1학년 6반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='405'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 박준호 / 5생활관(구디) 406호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610109', '박준호', '010-9153-6602', '010-5680-6602',
    '항공정비계열 1학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='406'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 2100000, 'paid', NULL);
  END IF;

  -- 박준서 / 5생활관(구디) 406호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610108', '박준서', '010-9158-6602', '010-5680-6602',
    '항공정비계열 1학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='406'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 2100000, 'paid', NULL);
  END IF;

  -- 이승민 / 5생활관(구디) 406호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610618', '이승민', '010-7442-2457', NULL,
    '항공정비계열 1학년 6반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='406'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 2100000, 'paid', NULL);
  END IF;

  -- 나준혁 / 5생활관(구디) 501호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610310', '나준혁', '010-4677-2480', '010-4927-2480',
    '항공정비계열 1학년 3반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 300000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='501'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 1800000, '2026-02-28', 1800000, 'paid', NULL);
  END IF;

  -- 주민기 / 5생활관(구디) 501호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610122', '주민기', '010-6869-0211', NULL,
    '항공정비계열 1학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 300000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='501'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 1800000, '2026-02-28', 1800000, 'paid', NULL);
  END IF;

  -- 권태환 / 5생활관(구디) 501호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610402', '권태환', '010-9238-8108', '010-3059-3530',
    '항공정비계열 1학년 4반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 300000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='501'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 1800000, '2026-02-28', 1800000, 'paid', NULL);
  END IF;

  -- 허정원 / 5생활관(구디) 501호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610225', '허정원', '010-8008-2968', '010-3132-0404',
    '항공정비계열 1학년 2반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 300000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='501'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 1800000, '2026-02-28', 1800000, 'paid', NULL);
  END IF;

  -- 박선제 / 5생활관(구디) 501호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610216', '박선제', '010-8561-7026', '010-8383-7026',
    '항공정비계열 1학년 2반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 300000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='501'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 1800000, '2026-02-28', 1800000, 'paid', NULL);
  END IF;

  -- 전현규 / 5생활관(구디) 502호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510226', '전현규', '010-5772-8924', NULL,
    '항공정비계열 2학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='502'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 양용선 / 5생활관(구디) 502호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510316', '양용선', '010-2735-7569', '010-6367-7569',
    '항공정비계열 2학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, NULL
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='502'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 2280000, 'paid', NULL);
  END IF;

  -- 문성우 / 2생활관(부경) 132호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202658104', '문성우', '010-6478-1421', '010-7187-1421',
    '항공정비계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '월분납(43만원)'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='132'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 480000, 'partial', '청소비 50,000원 포함');
  END IF;

  -- 이원진 / 2생활관(부경) 138호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610115', '이원진', '010-2479-3656', '010-2317-3634',
    '항공정비계열 1학년 1반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '월분납(43만원)'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='138'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 480000, 'partial', '청소비 50,000원 포함');
  END IF;

  -- 최승호 / 2생활관(부경) 158호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202682228', '최승호', '010-7363-5334', NULL,
    '항공보안계열 1학년 2반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '월분납(43만원)'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='158'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 480000, 'partial', '청소비 50,000원 포함');
  END IF;

  -- 김완기 / 2생활관(부경) 175호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610502', '김완기', '010-4952-5973', '010-8523-5973',
    '항공정비계열 1학년 5반', 'regular', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 430000, '월분납(43만원)'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='175'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2630000, '2026-02-28', 480000, 'partial', '청소비 50,000원 포함');
  END IF;

  -- 김하율 / 5생활관(구디) 206호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510208', '김하율', '010-7245-3798', '010-9968-3798',
    '항공정비계열 2학년 3반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '월분납(38만)'
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='206'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 380000, 'partial', NULL);
  END IF;

  -- 한재원 / 5생활관(구디) 306호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610224', '한재원', '010-5161-9686', '010-3536-9686',
    '항공정비계열 1학년 2반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 350000, '월분납(35만)'
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='306'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2100000, '2026-02-28', 350000, 'partial', NULL);
  END IF;

  -- 이종인 / 5생활관(구디) 403호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202610116', '이종인', '010-5161-6651', '010-8829-6518',
    '항공정비계열 1학년 1반', 'regular', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 380000, '월분납(38만)'
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='403'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2280000, '2026-02-28', 380000, 'partial', NULL);
  END IF;

  -- 이충훈교수 / 2생활관(부경) 141호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '이충훈교수', NULL, NULL,
    '설비교육원', 'staff', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 0, '설비교육원교수'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='141'
  RETURNING id INTO rid;

  -- 백종태교사 / 2생활관(부경) 144호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '백종태교사', NULL, NULL,
    '직업능력개발팀', 'staff', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 200000, '월분납(1학기:20만원) 2학기 : 30만원'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='144'
  RETURNING id INTO rid;

  -- 최광우교사 / 2생활관(부경) 334호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '최광우교사', NULL, NULL,
    '직업능력개발팀', 'staff', 1,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 500000, '월분납(50만원)'
  FROM dorm.rooms r WHERE r.building_id=1 AND r.room_no='334'
  RETURNING id INTO rid;

  -- 유창균 / 3생활관(비버) 28호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    '202510320', '유창균', '010-8646-4988', '010-4696-4988',
    '항공정비계열 2학년 3반', 'regular', 2,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 370000, '근로사감'
  FROM dorm.rooms r WHERE r.building_id=2 AND r.room_no='28'
  RETURNING id INTO rid;
  IF rid IS NOT NULL THEN
    INSERT INTO dorm.payments
      (resident_id, semester_id, period, amount, due_date, paid_amount, status, memo)
    VALUES (rid, 1, '2026-1학기', 2290000, '2026-02-28', 0, 'unpaid', '청소비 70,000원 포함');
  END IF;

  -- 하이든교수 / 5생활관(구디) 202호
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, class_name, type,
     building_id, room_id, semester_id, status, entry_date, exit_date, unit_price, notes)
  SELECT
    NULL, '하이든교수', NULL, NULL,
    '항공보안계열', 'staff', 4,
    r.id, 1, 'active', '2026-02-26', '2026-08-16', 0, '기숙사사감'
  FROM dorm.rooms r WHERE r.building_id=4 AND r.room_no='202'
  RETURNING id INTO rid;
END $dorm$;

-- ── 부동산 임대차 계약 ──────────────────────────────────────
INSERT INTO dorm.real_estate_contracts
  (building_id, building_name, address, landlord_name, deposit, monthly_rent, contract_start, contract_end, notes)
VALUES
  (1, '제2생활관(부경파크)', '서울 영등포구 당산로27길 19-2', '(주)부경피엠씨', 1350000000, 23100000, '2023-09-22', '2029-12-31', '1244.7㎡ 고시원 48호실+주택2호 1개동 전체 | 보증금 13.5억 | 계약 2023.09.22'),
  (2, '제3생활관(비버하우스)', '서울 영등포구 국회대로38길 8, 3층', '안현선(대표: 박순자)', 0, 13000000, '2025-02-01', '2028-01-31', '미니룸31·사워룸6·원룸6실 등 | 사용료 1,300만/월(VAT별도) + 인건비 264만 + 청소 36만 별도 | 사업자 744-11-02725'),
  (3, '제4생활관(진수빌딩) 전체', '서울 영등포구 당산동3가 180', '남대우', 70000000, 4000000, '2025-02-28', '2027-02-28', '5개 호실 합산(601·401·405·302·202) | 임대인 남대우·공명동의인 김미전 | 계약 2025.01.24'),
  (4, '제5생활관(구디)', '서울 구로구 구로동 1127-6', '복기동', 100000000, 12000000, '2025-01-31', '2027-01-31', '공명동의인: 이은영 | 계좌: 국민은행 364301-04-226727 이은영 | 계약 2025.01.31'),
  (NULL, '비버하우스 인근 부경파크(당산동3가 61-1)', '서울 영등포구 당산동3가 61-1', '유진경', 30000000, 6850000, '2026-03-01', '2028-02-29', '계약1: 2층201·304호(보증금1천만·월190.5만) + 계약2: 4층204·302·303호(보증금2천만·월490만) | 공명동의인: 유시연 | 임대인 SC제일 607-20-254564 계좌')
ON CONFLICT DO NOTHING;

COMMIT;

-- 확인 쿼리:
-- SELECT b.name, count(res.id) resident_count FROM dorm.buildings b LEFT JOIN dorm.residents res ON res.building_id=b.id AND res.semester_id=1 GROUP BY b.id, b.name ORDER BY b.id;