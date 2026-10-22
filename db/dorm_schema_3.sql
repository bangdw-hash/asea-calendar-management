-- dorm_schema_3.sql
-- 2026년도 데모 데이터 (생활관 통합 관리 시스템)
-- 실행: Supabase SQL 에디터에서 전체 붙여넣기 후 Run

-- ============================================================
-- 1. 학기 등록
-- ============================================================
INSERT INTO dorm.semesters (name, year, term, start_date, end_date, is_active) VALUES
  ('2026년 1학기', 2026, 1, '2026-03-02', '2026-06-30', false),
  ('2026년 2학기', 2026, 2, '2026-07-01', '2026-12-31', true)
ON CONFLICT DO NOTHING;

-- 기존 2025년 2학기를 비활성화하고 2026년 2학기를 활성으로 설정
UPDATE dorm.semesters SET is_active = false WHERE year = 2025;
UPDATE dorm.semesters SET is_active = true  WHERE year = 2026 AND term = 2;

-- ============================================================
-- 2. 호실 등록 (건물별)
-- ============================================================

-- 부경 (60명 / 5층, 2인실 기준)
INSERT INTO dorm.rooms (building_id, room_no, floor, capacity, room_type)
SELECT b.id, r.room_no, r.floor, 2, 'double'
FROM dorm.buildings b,
  (VALUES
    ('101',1),('102',1),('103',1),('104',1),('105',1),('106',1),
    ('201',2),('202',2),('203',2),('204',2),('205',2),('206',2),
    ('301',3),('302',3),('303',3),('304',3),('305',3),('306',3),
    ('401',4),('402',4),('403',4),('404',4),('405',4),('406',4),
    ('501',5),('502',5),('503',5),('504',5),('505',5),('506',5)
  ) AS r(room_no, floor)
WHERE b.code = 'bukkyung'
ON CONFLICT (building_id, room_no) DO NOTHING;

-- 비버 (50명 / 5층, 2인실 기준)
INSERT INTO dorm.rooms (building_id, room_no, floor, capacity, room_type)
SELECT b.id, r.room_no, r.floor, 2, 'double'
FROM dorm.buildings b,
  (VALUES
    ('101',1),('102',1),('103',1),('104',1),('105',1),
    ('201',2),('202',2),('203',2),('204',2),('205',2),
    ('301',3),('302',3),('303',3),('304',3),('305',3),
    ('401',4),('402',4),('403',4),('404',4),('405',4),
    ('501',5),('502',5),('503',5),('504',5),('505',5)
  ) AS r(room_no, floor)
WHERE b.code = 'beaver'
ON CONFLICT (building_id, room_no) DO NOTHING;

-- 진수 (40명 / 4층, 2인실 기준)
INSERT INTO dorm.rooms (building_id, room_no, floor, capacity, room_type)
SELECT b.id, r.room_no, r.floor, 2, 'double'
FROM dorm.buildings b,
  (VALUES
    ('101',1),('102',1),('103',1),('104',1),('105',1),
    ('201',2),('202',2),('203',2),('204',2),('205',2),
    ('301',3),('302',3),('303',3),('304',3),('305',3),
    ('401',4),('402',4),('403',4),('404',4),('405',4)
  ) AS r(room_no, floor)
WHERE b.code = 'jinsoo'
ON CONFLICT (building_id, room_no) DO NOTHING;

-- 구디 (44명 / 4층, 2인실 기준)
INSERT INTO dorm.rooms (building_id, room_no, floor, capacity, room_type)
SELECT b.id, r.room_no, r.floor, 2, 'double'
FROM dorm.buildings b,
  (VALUES
    ('101',1),('102',1),('103',1),('104',1),('105',1),('106',1),
    ('201',2),('202',2),('203',2),('204',2),('205',2),('206',2),
    ('301',3),('302',3),('303',3),('304',3),('305',3),('306',3),
    ('401',4),('402',4),('403',4),('404',4),('405',4),('406',4)
  ) AS r(room_no, floor)
WHERE b.code = 'goodi'
ON CONFLICT (building_id, room_no) DO NOTHING;

-- ============================================================
-- 3. 입소자 데이터 (2026년 1학기)
-- ============================================================
DO $$
DECLARE
  sid1 int; sid2 int;
  b_bukkyung int; b_beaver int; b_jinsoo int; b_goodi int;
BEGIN
  SELECT id INTO sid1 FROM dorm.semesters WHERE year=2026 AND term=1;
  SELECT id INTO sid2 FROM dorm.semesters WHERE year=2026 AND term=2;
  SELECT id INTO b_bukkyung FROM dorm.buildings WHERE code='bukkyung';
  SELECT id INTO b_beaver   FROM dorm.buildings WHERE code='beaver';
  SELECT id INTO b_jinsoo   FROM dorm.buildings WHERE code='jinsoo';
  SELECT id INTO b_goodi    FROM dorm.buildings WHERE code='goodi';

  -- ── 2026년 1학기 입소자 ──────────────────────────────
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, parent_name, class_name, building_id, room_id, semester_id, status, entry_date, unit_price, deposit)
  VALUES
    -- 부경 (1학기)
    ('20240101','김지호','010-1234-5678','010-9876-0001','김영수','항공서비스1',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='101'),sid1,'moveout','2026-03-03',420000,100000),
    ('20240102','이수민','010-2345-6789','010-9876-0002','이창수','항공서비스1',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='101'),sid1,'moveout','2026-03-03',420000,100000),
    ('20240103','박지현','010-3456-7890','010-9876-0003','박동혁','항공운항2',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='201'),sid1,'moveout','2026-03-03',420000,100000),
    ('20240104','최영우','010-4567-8901','010-9876-0004','최민준','항공운항2',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='201'),sid1,'moveout','2026-03-03',420000,100000),
    -- 비버 (1학기)
    ('20230201','정혜진','010-5678-9012','010-9876-0005','정원식','항공정비1',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='101'),sid1,'moveout','2026-03-03',420000,100000),
    ('20230202','강민수','010-6789-0123','010-9876-0006','강병준','항공정비1',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='101'),sid1,'moveout','2026-03-03',420000,100000),
    ('20250301','윤채원','010-7890-1234','010-9876-0007','윤성호','항공서비스2',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='201'),sid1,'moveout','2026-03-03',420000,100000),
    -- 진수 (1학기)
    ('20240401','한나래','010-8901-2345','010-9876-0008','한재원','항공운항1',b_jinsoo,
      (SELECT id FROM dorm.rooms WHERE building_id=b_jinsoo AND room_no='101'),sid1,'moveout','2026-03-03',400000,100000),
    ('20240402','오세준','010-9012-3456','010-9876-0009','오병훈','항공운항1',b_jinsoo,
      (SELECT id FROM dorm.rooms WHERE building_id=b_jinsoo AND room_no='101'),sid1,'moveout','2026-03-03',400000,100000),
    -- 구디 (1학기)
    ('20250501','신지아','010-0123-4567','010-9876-0010','신성철','항공서비스3',b_goodi,
      (SELECT id FROM dorm.rooms WHERE building_id=b_goodi AND room_no='101'),sid1,'moveout','2026-03-03',380000,100000),
    ('20250502','문태영','010-1234-0001','010-9876-0011','문병수','항공서비스3',b_goodi,
      (SELECT id FROM dorm.rooms WHERE building_id=b_goodi AND room_no='101'),sid1,'moveout','2026-03-03',380000,100000)
  ON CONFLICT DO NOTHING;

  -- ── 2026년 2학기 입소자 ──────────────────────────────
  INSERT INTO dorm.residents
    (student_no, name, phone, parent_phone, parent_name, class_name, building_id, room_id, semester_id, status, entry_date, unit_price, deposit)
  VALUES
    -- 부경 2학기
    ('20240101','김지호','010-1234-5678','010-9876-0001','김영수','항공서비스1',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='101'),sid2,'active','2026-07-01',420000,100000),
    ('20240103','박지현','010-3456-7890','010-9876-0003','박동혁','항공운항2',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='102'),sid2,'active','2026-07-01',420000,100000),
    ('20250601','임서연','010-2222-3333','010-9876-0012','임재호','항공서비스2',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='201'),sid2,'active','2026-07-01',420000,100000),
    ('20250602','조현우','010-3333-4444','010-9876-0013','조성민','항공운항3',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='201'),sid2,'active','2026-07-01',420000,100000),
    ('20240105','배소희','010-4444-5555','010-9876-0014','배재선','항공서비스1',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='301'),sid2,'active','2026-07-01',420000,100000),
    ('20240106','권도현','010-5555-6666','010-9876-0015','권혁진','항공정비2',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='301'),sid2,'active','2026-07-01',420000,100000),
    ('20250603','홍민지','010-6666-7777','010-9876-0016','홍성수','항공서비스2',b_bukkyung,
      (SELECT id FROM dorm.rooms WHERE building_id=b_bukkyung AND room_no='401'),sid2,'active','2026-07-01',420000,100000),
    -- 비버 2학기
    ('20230201','정혜진','010-5678-9012','010-9876-0005','정원식','항공정비1',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='101'),sid2,'active','2026-07-01',420000,100000),
    ('20250301','윤채원','010-7890-1234','010-9876-0007','윤성호','항공서비스2',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='102'),sid2,'active','2026-07-01',420000,100000),
    ('20250701','나경은','010-7777-8888','010-9876-0017','나상호','항공운항2',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='201'),sid2,'active','2026-07-01',420000,100000),
    ('20250702','류성민','010-8888-9999','010-9876-0018','류재훈','항공운항2',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='201'),sid2,'active','2026-07-01',420000,100000),
    ('20240201','송지은','010-9999-0000','010-9876-0019','송민수','항공서비스3',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='301'),sid2,'active','2026-07-01',420000,100000),
    ('20240202','황준서','010-1111-2222','010-9876-0020','황철수','항공정비2',b_beaver,
      (SELECT id FROM dorm.rooms WHERE building_id=b_beaver AND room_no='301'),sid2,'active','2026-07-01',420000,100000),
    -- 진수 2학기
    ('20240401','한나래','010-8901-2345','010-9876-0008','한재원','항공운항1',b_jinsoo,
      (SELECT id FROM dorm.rooms WHERE building_id=b_jinsoo AND room_no='101'),sid2,'active','2026-07-01',400000,100000),
    ('20250801','강태민','010-2233-4455','010-9876-0021','강철호','항공운항3',b_jinsoo,
      (SELECT id FROM dorm.rooms WHERE building_id=b_jinsoo AND room_no='102'),sid2,'active','2026-07-01',400000,100000),
    ('20250802','노예진','010-3344-5566','010-9876-0022','노재식','항공서비스1',b_jinsoo,
      (SELECT id FROM dorm.rooms WHERE building_id=b_jinsoo AND room_no='201'),sid2,'active','2026-07-01',400000,100000),
    ('20240403','마준혁','010-4455-6677','010-9876-0023','마성준','항공운항1',b_jinsoo,
      (SELECT id FROM dorm.rooms WHERE building_id=b_jinsoo AND room_no='201'),sid2,'active','2026-07-01',400000,100000),
    -- 구디 2학기
    ('20250501','신지아','010-0123-4567','010-9876-0010','신성철','항공서비스3',b_goodi,
      (SELECT id FROM dorm.rooms WHERE building_id=b_goodi AND room_no='101'),sid2,'active','2026-07-01',380000,100000),
    ('20250901','서하린','010-5566-7788','010-9876-0024','서민준','항공서비스2',b_goodi,
      (SELECT id FROM dorm.rooms WHERE building_id=b_goodi AND room_no='102'),sid2,'active','2026-07-01',380000,100000),
    ('20250902','전지훈','010-6677-8899','010-9876-0025','전성배','항공정비1',b_goodi,
      (SELECT id FROM dorm.rooms WHERE building_id=b_goodi AND room_no='201'),sid2,'active','2026-07-01',380000,100000),
    ('20241001','이하은','010-7788-9900','010-9876-0026','이재민','항공운항2',b_goodi,
      (SELECT id FROM dorm.rooms WHERE building_id=b_goodi AND room_no='201'),sid2,'active','2026-07-01',380000,100000),
    -- 신청 중 (applied)
    ('20251001','장민서','010-8899-0011','010-9876-0027','장진호','항공서비스1',b_bukkyung,
      NULL,sid2,'applied','2026-07-15',420000,100000),
    ('20251002','오지원','010-9900-1122','010-9876-0028','오상훈','항공서비스2',b_beaver,
      NULL,sid2,'applied','2026-07-15',420000,100000)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================
-- 4. 납부 데이터 (2026년 2학기 활성 입소자)
-- ============================================================
DO $$
DECLARE
  sid2 int;
  r_rec RECORD;
BEGIN
  SELECT id INTO sid2 FROM dorm.semesters WHERE year=2026 AND term=2;

  FOR r_rec IN
    SELECT id, unit_price FROM dorm.residents
    WHERE semester_id = sid2 AND status = 'active'
  LOOP
    -- 7월 납부 (paid)
    INSERT INTO dorm.payments (resident_id, semester_id, period, amount, due_date, paid_date, paid_amount, status, method, memo)
    VALUES (r_rec.id, sid2, '2026-07', r_rec.unit_price, '2026-07-10',
      CASE WHEN random() > 0.1 THEN '2026-07-08' ELSE NULL END,
      CASE WHEN random() > 0.1 THEN r_rec.unit_price ELSE 0 END,
      CASE WHEN random() > 0.1 THEN 'paid' ELSE 'unpaid' END,
      '계좌이체', '2026년 2학기 7월분')
    ON CONFLICT DO NOTHING;

    -- 8월 납부 (대부분 paid, 일부 미납)
    INSERT INTO dorm.payments (resident_id, semester_id, period, amount, due_date, paid_date, paid_amount, status, method, memo)
    VALUES (r_rec.id, sid2, '2026-08', r_rec.unit_price, '2026-08-10',
      CASE WHEN random() > 0.15 THEN '2026-08-09' ELSE NULL END,
      CASE WHEN random() > 0.15 THEN r_rec.unit_price ELSE 0 END,
      CASE WHEN random() > 0.15 THEN 'paid' ELSE 'unpaid' END,
      '계좌이체', '2026년 2학기 8월분')
    ON CONFLICT DO NOTHING;

    -- 9월 납부 (일부 미납)
    INSERT INTO dorm.payments (resident_id, semester_id, period, amount, due_date, paid_date, paid_amount, status, method, memo)
    VALUES (r_rec.id, sid2, '2026-09', r_rec.unit_price, '2026-09-10',
      CASE WHEN random() > 0.2 THEN '2026-09-09' ELSE NULL END,
      CASE WHEN random() > 0.2 THEN r_rec.unit_price ELSE 0 END,
      CASE WHEN random() > 0.2 THEN 'paid' ELSE 'unpaid' END,
      '계좌이체', '2026년 2학기 9월분')
    ON CONFLICT DO NOTHING;

    -- 10월 납부 (많이 미납 — 최근 달)
    INSERT INTO dorm.payments (resident_id, semester_id, period, amount, due_date, paid_date, paid_amount, status, method, memo)
    VALUES (r_rec.id, sid2, '2026-10', r_rec.unit_price, '2026-10-10',
      CASE WHEN random() > 0.4 THEN '2026-10-08' ELSE NULL END,
      CASE WHEN random() > 0.4 THEN r_rec.unit_price ELSE 0 END,
      CASE WHEN random() > 0.4 THEN 'paid' ELSE 'unpaid' END,
      '계좌이체', '2026년 2학기 10월분')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- 1학기 납부 데이터
DO $$
DECLARE
  sid1 int;
  r_rec RECORD;
BEGIN
  SELECT id INTO sid1 FROM dorm.semesters WHERE year=2026 AND term=1;

  FOR r_rec IN
    SELECT id, unit_price FROM dorm.residents
    WHERE semester_id = sid1
  LOOP
    INSERT INTO dorm.payments (resident_id, semester_id, period, amount, due_date, paid_date, paid_amount, status, method, memo)
    VALUES
      (r_rec.id, sid1, '2026-03', r_rec.unit_price, '2026-03-10', '2026-03-07', r_rec.unit_price, 'paid', '계좌이체', '2026년 1학기 3월분'),
      (r_rec.id, sid1, '2026-04', r_rec.unit_price, '2026-04-10', '2026-04-09', r_rec.unit_price, 'paid', '계좌이체', '2026년 1학기 4월분'),
      (r_rec.id, sid1, '2026-05', r_rec.unit_price, '2026-05-10', '2026-05-08', r_rec.unit_price, 'paid', '계좌이체', '2026년 1학기 5월분'),
      (r_rec.id, sid1, '2026-06', r_rec.unit_price, '2026-06-10', '2026-06-10', r_rec.unit_price, 'paid', '계좌이체', '2026년 1학기 6월분')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================
-- 5. 민원 데이터
-- ============================================================
DO $$
DECLARE
  sid2 int;
  r_id uuid;
BEGIN
  SELECT id INTO sid2 FROM dorm.semesters WHERE year=2026 AND term=2;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='김지호' AND r.semester_id=sid2 LIMIT 1;
  IF r_id IS NOT NULL THEN
    INSERT INTO dorm.complaints (resident_id, room_label, category, title, content, status, created_at)
    VALUES (r_id, '부경 101호', '시설', '화장실 수도꼭지 누수', '화장실 세면대 수도꼭지에서 물이 계속 새고 있습니다. 확인 부탁드립니다.', 'processing', '2026-10-15 09:30:00')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='정혜진' AND r.semester_id=sid2 LIMIT 1;
  IF r_id IS NOT NULL THEN
    INSERT INTO dorm.complaints (resident_id, room_label, category, title, content, status, created_at)
    VALUES (r_id, '비버 101호', '생활', '층간 소음 문제', '윗층에서 밤 11시 이후에 뛰는 소리가 매일 납니다. 조치 부탁드립니다.', 'received', '2026-10-18 22:15:00')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='한나래' AND r.semester_id=sid2 LIMIT 1;
  IF r_id IS NOT NULL THEN
    INSERT INTO dorm.complaints (resident_id, room_label, category, title, content, status, created_at)
    VALUES (r_id, '진수 101호', '시설', '냉방기 작동 불량', '에어컨이 켜지지 않습니다. 더워서 생활이 너무 불편합니다.', 'closed', '2026-07-25 14:00:00')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='신지아' AND r.semester_id=sid2 LIMIT 1;
  IF r_id IS NOT NULL THEN
    INSERT INTO dorm.complaints (resident_id, room_label, category, title, content, status, created_at)
    VALUES (r_id, '구디 101호', '안전', '비상구 조명 미작동', '비상구 표시등이 꺼져 있습니다. 안전 점검이 필요합니다.', 'processing', '2026-10-10 08:00:00')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='박지현' AND r.semester_id=sid2 LIMIT 1;
  IF r_id IS NOT NULL THEN
    INSERT INTO dorm.complaints (resident_id, room_label, category, title, content, status, created_at)
    VALUES (r_id, '부경 102호', '생활', '세탁실 세탁기 고장', '3층 세탁실 2번 세탁기가 탈수 중에 멈춥니다.', 'received', '2026-10-20 11:30:00')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ============================================================
-- 6. 공지사항 데이터
-- ============================================================
INSERT INTO dorm.notices (title, content, category, is_pinned, created_by, created_at)
VALUES
  ('2026년 2학기 생활관 이용 안내',
   '2026년 2학기 생활관 입소자 여러분께 안내드립니다. 입소 기간: 2026년 7월 1일 ~ 12월 31일. 납부 기한은 매월 10일이며, 기한 내 미납 시 독촉 안내가 발송됩니다. 생활 규정을 준수해 주시기 바랍니다.',
   '공지', true, 'admin', '2026-07-01 09:00:00'),

  ('2026년 2학기 납부 안내 (10월분)',
   '2026년 10월 생활관 이용료 납부 기한이 10월 10일(토)까지입니다. 아직 납부하지 않은 학생은 아래 계좌로 이체해 주세요. 계좌번호: 국민은행 123-456-789012 (예금주: 아세아항공직업전문학교).',
   '납부', true, 'admin', '2026-10-05 09:00:00'),

  ('생활관 청소 점검 실시 안내',
   '매월 마지막 주 금요일 오전 10시~12시 사이 공용 공간 및 개인 호실 청결 상태 점검을 실시합니다. 점검 결과에 따라 벌점이 부과될 수 있으니 항상 청결하게 유지해 주시기 바랍니다.',
   '생활', false, 'admin', '2026-09-25 14:00:00'),

  ('추석 연휴 기간 생활관 운영 안내',
   '2026년 추석 연휴(10월 2일~5일) 기간 생활관은 정상 운영됩니다. 다만 식당은 10월 3일~4일 휴무이오니 개인 식사를 준비하시기 바랍니다. 외출 시 귀관 시각(자정 12시)을 반드시 지켜 주세요.',
   '공지', false, 'admin', '2026-09-20 09:00:00'),

  ('2026년 2학기 퇴실 신청 안내',
   '2026년 2학기 생활관 퇴실 신청은 12월 15일까지 입소자 포털에서 신청하거나 생활관 관리실에 직접 방문하여 신청해 주세요. 퇴실 당일 호실 점검 후 보증금이 환불됩니다.',
   '공지', false, 'admin', '2026-11-01 09:00:00')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. 벌점 데이터
-- ============================================================
DO $$
DECLARE
  sid2 int;
  r_id uuid;
  rule_id int;
BEGIN
  SELECT id INTO sid2 FROM dorm.semesters WHERE year=2026 AND term=2;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='김지호' AND r.semester_id=sid2 LIMIT 1;
  SELECT id INTO rule_id FROM dorm.penalty_rules WHERE name='소음·질서 위반' LIMIT 1;
  IF r_id IS NOT NULL AND rule_id IS NOT NULL THEN
    INSERT INTO dorm.penalties (resident_id, rule_id, issued_at, note)
    VALUES (r_id, rule_id, '2026-08-15', '취침 시간 이후 복도 소음')
    ON CONFLICT DO NOTHING;
    UPDATE dorm.residents SET penalty_total = penalty_total + 2 WHERE id = r_id;
  END IF;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='류성민' AND r.semester_id=sid2 LIMIT 1;
  SELECT id INTO rule_id FROM dorm.penalty_rules WHERE name='쓰레기 미분리' LIMIT 1;
  IF r_id IS NOT NULL AND rule_id IS NOT NULL THEN
    INSERT INTO dorm.penalties (resident_id, rule_id, issued_at, note)
    VALUES (r_id, rule_id, '2026-09-03', '분리수거 위반')
    ON CONFLICT DO NOTHING;
    UPDATE dorm.residents SET penalty_total = penalty_total + 2 WHERE id = r_id;
  END IF;

  SELECT r.id INTO r_id FROM dorm.residents r WHERE r.name='황준서' AND r.semester_id=sid2 LIMIT 1;
  SELECT id INTO rule_id FROM dorm.penalty_rules WHERE name='세탁물 장기 방치' LIMIT 1;
  IF r_id IS NOT NULL AND rule_id IS NOT NULL THEN
    INSERT INTO dorm.penalties (resident_id, rule_id, issued_at, note)
    VALUES (r_id, rule_id, '2026-10-01', '세탁실 세탁물 2주 방치')
    ON CONFLICT DO NOTHING;
    UPDATE dorm.residents SET penalty_total = penalty_total + 1 WHERE id = r_id;
  END IF;
END;
$$;

-- ============================================================
-- 확인 쿼리
-- ============================================================
-- SELECT s.name, COUNT(r.id) as 입소자수 FROM dorm.semesters s
--   LEFT JOIN dorm.residents r ON r.semester_id = s.id
--   WHERE s.year = 2026 GROUP BY s.name ORDER BY s.name;
-- SELECT COUNT(*) as 납부건수, status FROM dorm.payments GROUP BY status;
-- SELECT COUNT(*) as 민원건수, status FROM dorm.complaints GROUP BY status;
