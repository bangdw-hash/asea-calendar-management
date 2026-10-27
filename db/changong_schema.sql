-- 2026 창공제 노래 콘테스트 Supabase 스키마
-- Supabase SQL Editor에서 실행하세요.

CREATE SCHEMA IF NOT EXISTS cgf;

CREATE TABLE cgf.contestants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'form',        -- xlsx / form / manual
  seq int,
  name text NOT NULL,
  affiliation text,
  phone text,
  category text DEFAULT '개인',               -- 개인 / 팀
  team_members jsonb DEFAULT '[]'::jsonb,
  song_title text,
  song_artist text,
  status text DEFAULT 'active',               -- active / absent / done / withdrawn
  phase text DEFAULT 'prelim',                -- prelim / semi / final
  is_pre_registered bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cgf.judges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token text UNIQUE NOT NULL,
  device_fp text,
  claimed_at timestamptz,
  active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cgf.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contestant_id uuid REFERENCES cgf.contestants(id) ON DELETE CASCADE,
  judge_id uuid REFERENCES cgf.judges(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'prelim',
  vocal int CHECK (vocal BETWEEN 0 AND 50),
  showmanship int CHECK (showmanship BETWEEN 0 AND 30),
  audience_response int CHECK (audience_response BETWEEN 0 AND 20),
  total int GENERATED ALWAYS AS (COALESCE(vocal,0)+COALESCE(showmanship,0)+COALESCE(audience_response,0)) STORED,
  special_award_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(contestant_id, judge_id, phase)
);

CREATE TABLE cgf.state (
  id int PRIMARY KEY DEFAULT 1,
  phase text DEFAULT 'prelim',                -- prelim / semi / final / awards
  current_contestant_id uuid,
  voting_open bool DEFAULT false,
  voting_opened_at timestamptz,
  registration_open bool DEFAULT true,
  stage_locked bool DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO cgf.state DEFAULT VALUES;

CREATE TABLE cgf.votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contestant_id uuid REFERENCES cgf.contestants(id) ON DELETE CASCADE,
  phase text NOT NULL,
  stars int CHECK (stars BETWEEN 1 AND 5),
  cookie_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(contestant_id, cookie_id, phase)
);

CREATE TABLE cgf.awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_type text UNIQUE NOT NULL,            -- grand / excellence / merit / popularity / judge_special / mc_special
  contestant_id uuid REFERENCES cgf.contestants(id),
  note text,
  assigned_by text DEFAULT 'system',
  revealed bool DEFAULT false,
  reveal_order int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cgf.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  sent_to text,
  created_at timestamptz DEFAULT now()
);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE cgf.contestants;
ALTER PUBLICATION supabase_realtime ADD TABLE cgf.state;
ALTER PUBLICATION supabase_realtime ADD TABLE cgf.scores;
ALTER PUBLICATION supabase_realtime ADD TABLE cgf.votes;
ALTER PUBLICATION supabase_realtime ADD TABLE cgf.awards;

-- RLS 활성화 (1일 행사용 — 비밀번호 보호는 UI 단에서)
ALTER TABLE cgf.contestants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgf.judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgf.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgf.state ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgf.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgf.awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE cgf.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON cgf.contestants FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON cgf.judges     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON cgf.scores     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON cgf.state      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON cgf.votes      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON cgf.awards     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON cgf.notices    FOR ALL TO anon USING (true) WITH CHECK (true);
