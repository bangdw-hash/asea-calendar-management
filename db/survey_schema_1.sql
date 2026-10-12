-- ============================================================================
-- 교내 설문(aseasurvey.html) 스키마 1/3: 테이블 · 내부 함수
--  * 테이블/내부 함수는 외부에 노출되지 않는 svy 스키마에 둡니다.
--  * 브라우저(anon 키)는 public.svy_* RPC(SECURITY DEFINER)로만 접근합니다.
--  * 완전 익명: 응답에는 개인 식별 정보(학번·이름·IP)를 저장하지 않습니다.
--  * 관리자 비밀번호: 아래 안내대로 설치 후 별도 등록합니다.
--  * 여러 번 실행해도 안전합니다.
-- ============================================================================

create schema if not exists svy;
revoke all on schema svy from public, anon, authenticated;

create table if not exists svy.secret (
  id int primary key default 1 check (id = 1),
  admin_hash text,
  admin_fail int not null default 0,
  admin_locked_until timestamptz
);
insert into svy.secret(id) values (1) on conflict do nothing;
-- 관리자 비밀번호는 저장소에 두지 않습니다. 설치 후 별도 실행:
--   update svy.secret set admin_hash = extensions.crypt('<관리자 비밀번호>', extensions.gen_salt('bf')) where id = 1;

create table if not exists svy.sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists svy.log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default '',
  action text not null,
  target text not null default '',
  detail jsonb
);

create table if not exists svy.surveys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  semester text not null default '',
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  def jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  version int not null default 1,
  open_at timestamptz,
  close_at timestamptz,
  result_from timestamptz,
  draw_msg text not null default '',
  cloned_from uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists svy.survey_versions (
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  version int not null,
  def jsonb not null,
  theme jsonb not null,
  note text not null default '',
  saved_at timestamptz not null default now(),
  primary key (survey_id, version)
);

create table if not exists svy.courses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  track text not null,
  grade text not null,
  klass text not null,
  name text not null,
  prof text not null default '',
  kind text not null default '',
  sort int not null default 0,
  active boolean not null default true,
  unique (survey_id, track, grade, klass, name)
);
create index if not exists courses_survey_idx on svy.courses(survey_id);

create table if not exists svy.targets (
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  track text not null,
  grade text not null,
  headcount int not null default 0 check (headcount >= 0),
  primary key (survey_id, track, grade)
);

create table if not exists svy.responses (
  seq bigserial unique,
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  client_token text not null,
  track text not null,
  grade text not null,
  klass text not null,
  answers jsonb not null,
  ticket text not null,
  attn_total int not null default 0,
  attn_fail int not null default 0,
  straight boolean not null default false,
  text_len int not null default 0,
  duration_sec int not null default 0,
  excluded boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (survey_id, client_token),
  unique (survey_id, ticket)
);
create index if not exists responses_survey_seq_idx on svy.responses(survey_id, seq);

create table if not exists svy.draws (
  id bigserial primary key,
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  n int not null,
  criteria jsonb not null default '{}'::jsonb,
  tickets text[] not null default '{}',
  pool_size int not null default 0,
  published boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists draws_survey_idx on svy.draws(survey_id, id);

create table if not exists svy.claims (
  survey_id uuid not null references svy.surveys(id) on delete cascade,
  ticket text not null,
  claimed_at timestamptz not null default now(),
  memo text not null default '',
  primary key (survey_id, ticket)
);

do $$ declare t text; begin
  foreach t in array array['secret','sessions','log','surveys','survey_versions','courses','targets','responses','draws','claims'] loop
    execute format('alter table svy.%I enable row level security', t);
    execute format('revoke all on svy.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ── 내부 함수 ───────────────────────────────────────────────────────────────
create or replace function svy.sess(p_token text)
returns void language plpgsql security definer set search_path = svy, extensions, public as $$
begin
  if not exists (select 1 from svy.sessions
                  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now()) then
    raise exception 'AUTH_REQUIRED';
  end if;
end $$;

create or replace function svy.log_add(p_action text, p_target text, p_detail jsonb default null)
returns void language sql security definer set search_path = svy, public as $$
  insert into svy.log(actor, action, target, detail) values ('admin', p_action, coalesce(p_target, ''), p_detail);
$$;

create or replace function svy.new_session()
returns text language plpgsql security definer set search_path = svy, extensions, public as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  delete from svy.sessions where expires_at < now();
  insert into svy.sessions(token_hash, expires_at) values (encode(digest(t, 'sha256'), 'hex'), now() + interval '12 hours');
  return t;
end $$;

create or replace function svy.gen_code()
returns text language plpgsql security definer set search_path = svy, extensions, public as $$
declare c text; chars text := 'abcdefghjkmnpqrstuvwxyz23456789'; i int; b bytea;
begin
  loop
    b := gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(chars, (get_byte(b, i) % 31) + 1, 1); end loop;
    exit when not exists (select 1 from svy.surveys where code = c);
  end loop;
  return c;
end $$;

create or replace function svy.gen_ticket(p_survey uuid)
returns text language plpgsql security definer set search_path = svy, extensions, public as $$
declare c text; chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int; b bytea;
begin
  loop
    b := gen_random_bytes(8); c := '';
    for i in 0..7 loop
      c := c || substr(chars, (get_byte(b, i) % 31) + 1, 1);
      if i = 3 then c := c || '-'; end if;
    end loop;
    exit when not exists (select 1 from svy.responses where survey_id = p_survey and ticket = c);
  end loop;
  return c;
end $$;

-- 설문 단계 계산: draft / open / closed / result
create or replace function svy.phase(s svy.surveys)
returns text language sql stable security definer set search_path = svy, public as $$
  select case
    when s.result_from is not null and now() >= s.result_from
         and exists (select 1 from svy.draws d where d.survey_id = s.id and d.published) then 'result'
    when s.status = 'closed' or (s.close_at is not null and now() > s.close_at) then 'closed'
    when s.status = 'open' and (s.open_at is null or now() >= s.open_at) then 'open'
    else 'draft'
  end;
$$;

-- 질문 표시 여부(showIf: 같은 과목의 다른 문항에서 '배타 선택 외' 항목이 선택되었을 때만 표시)
create or replace function svy.q_visible(p_q jsonb, p_def jsonb, p_ans jsonb)
returns boolean language plpgsql immutable set search_path = svy, public as $$
declare src text; arr jsonb; opt jsonb; ex jsonb; v jsonb;
begin
  if p_q->'showIf' is null or jsonb_typeof(p_q->'showIf') <> 'object' then return true; end if;
  src := p_q->'showIf'->>'q';
  v := p_ans->src;
  if v is null or jsonb_typeof(v) <> 'array' then return false; end if;
  -- 배타 옵션 id 수집
  select coalesce(jsonb_agg(o->>'id'), '[]'::jsonb) into ex
    from jsonb_array_elements(p_def->'sections') s,
         jsonb_array_elements(s->'questions') q,
         jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) o
   where q->>'id' = src and coalesce((o->>'exclusive')::boolean, false);
  for opt in select * from jsonb_array_elements(v) loop
    if not (ex @> jsonb_build_array(opt)) then return true; end if;
  end loop;
  return false;
end $$;
