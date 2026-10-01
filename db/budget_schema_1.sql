-- ============================================================================
-- 부서 예산안(budget.html) 스키마
--  * 테이블/내부 함수는 외부에 노출되지 않는 bgt 스키마에 둡니다.
--  * 브라우저(anon 키)는 public.bgt_* RPC 함수로만 접근합니다. (SECURITY DEFINER, 토큰 검증)
--  * 부서 비밀번호: bcrypt 해시(검증용) + 대칭 암호화(관리자 조회용, Q2-b)
--  * 관리자 비밀번호는 이 파일에 넣지 않습니다. 설치 후 아래 명령으로 별도 등록하십시오.
--      update bgt.secret set admin_hash = extensions.crypt('<관리자 비밀번호>', extensions.gen_salt('bf')) where id = 1;
-- ============================================================================

create schema if not exists bgt;
revoke all on schema bgt from public, anon, authenticated;

-- ── 테이블 ──────────────────────────────────────────────────────────────────
create table if not exists bgt.secret (
  id int primary key default 1 check (id = 1),
  admin_hash text,
  enc_key text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  admin_fail int not null default 0,
  admin_locked_until timestamptz
);
insert into bgt.secret(id) values (1) on conflict do nothing;

create table if not exists bgt.sessions (
  token_hash text primary key,
  role text not null check (role in ('admin', 'dept')),
  dept text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists bgt.depts (
  dept text primary key,
  sort int not null default 0,
  pw_hash text,
  pw_enc bytea,
  pw_set_at timestamptz,
  fail_count int not null default 0,
  locked_until timestamptz,
  active boolean not null default true
);

create table if not exists bgt.codes (
  type text not null check (type in ('세입', '세출')),
  code text not null,
  level text not null check (level in ('gwan', 'hang', 'mok')),
  name text not null,
  descr text not null default '',
  example text not null default '',
  sort int not null default 0,
  active boolean not null default true,
  primary key (type, code)
);

create table if not exists bgt.settings (
  year int primary key,
  base_year int not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'finalized')),
  open_at timestamptz,
  close_at timestamptz,
  variance_pct int not null default 20 check (variance_pct >= 0),
  note text not null default '',
  finalized_at timestamptz
);

create table if not exists bgt.caps (
  year int not null,
  dept text not null,
  type text not null check (type in ('세입', '세출')),
  amount bigint not null default 0,
  primary key (year, dept, type)
);

create table if not exists bgt.lines (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  dept text not null references bgt.depts(dept) on update cascade,
  type text not null check (type in ('세입', '세출')),
  mok text not null,
  name text not null,
  base_calc text not null default '',
  base_amount bigint not null default 0,
  forecast bigint,
  calc text not null default '',
  amount bigint not null default 0,
  reason text not null default '',
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists bgt_lines_scope on bgt.lines(year, dept, type);

create table if not exists bgt.spend (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references bgt.lines(id) on delete cascade,
  spent_on date,
  memo text not null default '',
  vendor text not null default '',
  amount bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bgt_spend_line on bgt.spend(line_id);

create table if not exists bgt.submissions (
  year int not null,
  dept text not null,
  type text not null check (type in ('세입', '세출')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewing', 'confirmed')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  reject_reason text not null default '',
  primary key (year, dept, type)
);

create table if not exists bgt.log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null default '',
  action text not null,
  target text not null default '',
  detail jsonb
);

-- RLS: 정책 없이 활성화 + 권한 회수 (직접 접근 전면 차단)
alter table bgt.secret enable row level security;
alter table bgt.sessions enable row level security;
alter table bgt.depts enable row level security;
alter table bgt.codes enable row level security;
alter table bgt.settings enable row level security;
alter table bgt.caps enable row level security;
alter table bgt.lines enable row level security;
alter table bgt.spend enable row level security;
alter table bgt.submissions enable row level security;
alter table bgt.log enable row level security;
revoke all on all tables in schema bgt from public, anon, authenticated;
revoke all on all sequences in schema bgt from public, anon, authenticated;

