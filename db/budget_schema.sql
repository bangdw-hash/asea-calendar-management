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

-- ── 내부 함수 (bgt 스키마, 외부 노출 안 됨) ─────────────────────────────────
create or replace function bgt.sess(p_token text, p_role text)
returns bgt.sessions language plpgsql security definer
set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  select * into v from bgt.sessions
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if not found or v.role <> p_role then raise exception 'AUTH_REQUIRED'; end if;
  return v;
end $$;

create or replace function bgt.log_add(p_actor text, p_action text, p_target text, p_detail jsonb default null)
returns void language sql security definer set search_path = bgt, public as $$
  insert into bgt.log(actor, action, target, detail) values (coalesce(p_actor, ''), p_action, coalesce(p_target, ''), p_detail);
$$;

create or replace function bgt.new_session(p_role text, p_dept text)
returns text language plpgsql security definer set search_path = bgt, extensions, public as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  delete from bgt.sessions where expires_at < now();
  insert into bgt.sessions(token_hash, role, dept, expires_at)
  values (encode(digest(t, 'sha256'), 'hex'), p_role, p_dept, now() + interval '12 hours');
  return t;
end $$;

create or replace function bgt.is_open(p_year int)
returns boolean language sql stable security definer set search_path = bgt, public as $$
  select coalesce((select status = 'open'
                          and (open_at is null or now() >= open_at)
                          and (close_at is null or now() <= close_at)
                     from bgt.settings where year = p_year), false);
$$;

-- 부서 편집 가능 여부: 작성기간 열림 + 해당 (부서, 구분) 제출상태가 draft
create or replace function bgt.assert_editable(p_year int, p_dept text, p_type text)
returns void language plpgsql security definer set search_path = bgt, public as $$
declare v_status text;
begin
  if not bgt.is_open(p_year) then raise exception 'PERIOD_CLOSED'; end if;
  select status into v_status from bgt.submissions where year = p_year and dept = p_dept and type = p_type;
  if coalesce(v_status, 'draft') <> 'draft' then raise exception 'LOCKED'; end if;
end $$;

create or replace function bgt.num(p text)
returns bigint language sql immutable as $$
  select case when p is null or btrim(p) = '' then null else round(p::numeric)::bigint end;
$$;

-- 항목 저장 (부서/관리자 공용)
create or replace function bgt.line_upsert(p_year int, p_dept text, p_line jsonb, p_admin boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare
  v_id uuid := nullif(p_line->>'id', '')::uuid;
  v_old bgt.lines;
  v_type text; v_dept text := p_dept; v_mok text; v_name text; v_row bgt.lines;
  v_added boolean := true;
begin
  if v_id is not null then
    select * into v_old from bgt.lines where id = v_id;
    if not found or v_old.year <> p_year then raise exception 'NOT_FOUND'; end if;
    if not p_admin and v_old.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    v_dept := v_old.dept; v_type := v_old.type;
    v_added := (v_old.base_amount = 0 and v_old.base_calc = '');
  else
    v_type := p_line->>'type';
    if p_admin and coalesce(p_line->>'dept', '') <> '' then v_dept := p_line->>'dept'; end if;
  end if;
  if v_type is null or v_type not in ('세입', '세출') then raise exception 'BAD_TYPE'; end if;
  if not exists (select 1 from bgt.depts where dept = v_dept and active) then raise exception 'BAD_DEPT'; end if;
  if not p_admin then perform bgt.assert_editable(p_year, v_dept, v_type); end if;

  -- 2026 기준 항목의 코드·명칭은 부서가 바꿀 수 없음(양식 불변). 관리자 또는 부서 추가 항목만 변경 가능.
  if v_id is not null and not p_admin and not v_added then
    v_mok := v_old.mok; v_name := v_old.name;
  else
    v_mok := btrim(coalesce(p_line->>'mok', coalesce(v_old.mok, '')));
    v_name := btrim(coalesce(p_line->>'name', coalesce(v_old.name, '')));
  end if;
  if not exists (select 1 from bgt.codes where type = v_type and code = v_mok and level = 'mok' and active) then
    raise exception 'BAD_CODE';
  end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;

  if v_id is null then
    insert into bgt.lines(year, dept, type, mok, name, base_calc, base_amount, forecast, calc, amount, reason, sort, updated_by)
    values (p_year, v_dept, v_type, v_mok, v_name,
            case when p_admin then coalesce(p_line->>'base_calc', '') else '' end,
            case when p_admin then greatest(coalesce(bgt.num(p_line->>'base_amount'), 0), 0) else 0 end,
            bgt.num(p_line->>'forecast'),
            coalesce(p_line->>'calc', ''),
            greatest(coalesce(bgt.num(p_line->>'amount'), 0), 0),
            coalesce(p_line->>'reason', ''),
            coalesce((select max(sort) + 1 from bgt.lines where year = p_year and dept = v_dept and type = v_type), 0),
            p_actor)
    returning * into v_row;
  else
    update bgt.lines set
      mok = v_mok, name = v_name,
      base_calc = case when p_admin and p_line ? 'base_calc' then coalesce(p_line->>'base_calc', '') else base_calc end,
      base_amount = case when p_admin and p_line ? 'base_amount' then greatest(coalesce(bgt.num(p_line->>'base_amount'), 0), 0) else base_amount end,
      forecast = case when p_line ? 'forecast' then bgt.num(p_line->>'forecast') else forecast end,
      calc = case when p_line ? 'calc' then coalesce(p_line->>'calc', '') else calc end,
      amount = case when p_line ? 'amount' then greatest(coalesce(bgt.num(p_line->>'amount'), 0), 0) else amount end,
      reason = case when p_line ? 'reason' then coalesce(p_line->>'reason', '') else reason end,
      updated_at = now(), updated_by = p_actor
    where id = v_id returning * into v_row;
  end if;
  perform bgt.log_add(p_actor, case when v_id is null then 'line_add' else 'line_save' end, v_dept || '/' || v_type || '/' || v_mok,
                      jsonb_build_object('id', v_row.id, 'name', v_row.name, 'amount', v_row.amount, 'forecast', v_row.forecast));
  return to_jsonb(v_row);
end $$;

create or replace function bgt.line_remove(p_id uuid, p_dept text, p_admin boolean, p_actor text)
returns void language plpgsql security definer set search_path = bgt, public as $$
declare v bgt.lines;
begin
  select * into v from bgt.lines where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_admin then
    if v.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    if not (v.base_amount = 0 and v.base_calc = '') then raise exception 'BASE_LINE_PROTECTED'; end if;
    perform bgt.assert_editable(v.year, v.dept, v.type);
  end if;
  delete from bgt.lines where id = p_id;
  perform bgt.log_add(p_actor, 'line_delete', v.dept || '/' || v.type || '/' || v.mok, jsonb_build_object('name', v.name, 'amount', v.amount));
end $$;

create or replace function bgt.spend_upsert(p_line_id uuid, p_entry jsonb, p_dept text, p_admin boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, public as $$
declare v_line bgt.lines; v_id uuid := nullif(p_entry->>'id', '')::uuid; v_row bgt.spend;
begin
  select * into v_line from bgt.lines where id = p_line_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_admin then
    if v_line.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    perform bgt.assert_editable(v_line.year, v_line.dept, v_line.type);
  end if;
  if v_id is null then
    insert into bgt.spend(line_id, spent_on, memo, vendor, amount)
    values (p_line_id, nullif(p_entry->>'spent_on', '')::date, coalesce(p_entry->>'memo', ''), coalesce(p_entry->>'vendor', ''),
            coalesce(bgt.num(p_entry->>'amount'), 0))
    returning * into v_row;
  else
    update bgt.spend set
      spent_on = case when p_entry ? 'spent_on' then nullif(p_entry->>'spent_on', '')::date else spent_on end,
      memo = case when p_entry ? 'memo' then coalesce(p_entry->>'memo', '') else memo end,
      vendor = case when p_entry ? 'vendor' then coalesce(p_entry->>'vendor', '') else vendor end,
      amount = case when p_entry ? 'amount' then coalesce(bgt.num(p_entry->>'amount'), 0) else amount end
    where id = v_id and line_id = p_line_id returning * into v_row;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  perform bgt.log_add(p_actor, 'spend_save', v_line.dept || '/' || v_line.mok, jsonb_build_object('line', v_line.name, 'amount', v_row.amount));
  return to_jsonb(v_row);
end $$;

create or replace function bgt.spend_remove(p_id uuid, p_dept text, p_admin boolean, p_actor text)
returns void language plpgsql security definer set search_path = bgt, public as $$
declare v_line bgt.lines;
begin
  select l.* into v_line from bgt.lines l join bgt.spend s on s.line_id = l.id where s.id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_admin then
    if v_line.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    perform bgt.assert_editable(v_line.year, v_line.dept, v_line.type);
  end if;
  delete from bgt.spend where id = p_id;
  perform bgt.log_add(p_actor, 'spend_delete', v_line.dept || '/' || v_line.mok, jsonb_build_object('line', v_line.name));
end $$;

-- 연도 범위 데이터 묶음 (부서 하나 또는 전체)
create or replace function bgt.bundle(p_year int, p_dept text)
returns jsonb language sql stable security definer set search_path = bgt, public as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(x) from bgt.settings x where x.year = p_year),
    'open', bgt.is_open(p_year),
    'lines', (select coalesce(jsonb_agg(to_jsonb(l) order by l.type, l.mok, l.sort, l.name), '[]'::jsonb)
                from bgt.lines l where l.year = p_year and (p_dept is null or l.dept = p_dept)),
    'spend', (select coalesce(jsonb_agg(to_jsonb(s) order by s.spent_on, s.created_at), '[]'::jsonb)
                from bgt.spend s join bgt.lines l on l.id = s.line_id
               where l.year = p_year and (p_dept is null or l.dept = p_dept)),
    'subs', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
               from bgt.submissions b where b.year = p_year and (p_dept is null or b.dept = p_dept)),
    'caps', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
               from bgt.caps k where k.year = p_year and (p_dept is null or k.dept = p_dept))
  );
$$;

-- ── 공개 RPC: 정보 / 로그인 ─────────────────────────────────────────────────
create or replace function public.bgt_info()
returns jsonb language sql stable security definer set search_path = bgt, public as $$
  select jsonb_build_object(
    'now', now(),
    'settings', (select coalesce(jsonb_agg(to_jsonb(s) order by s.year desc), '[]'::jsonb) from bgt.settings s),
    'depts', (select coalesce(jsonb_agg(jsonb_build_object('dept', d.dept, 'has_pw', d.pw_hash is not null) order by d.sort, d.dept), '[]'::jsonb)
                from bgt.depts d where d.active)
  );
$$;

create or replace function public.bgt_dept_set_password(p_dept text, p_pw text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v_key text; v_n int;
begin
  if p_pw is null or char_length(p_pw) < 4 then return jsonb_build_object('ok', false, 'error', 'PW_TOO_SHORT'); end if;
  select enc_key into v_key from bgt.secret where id = 1;
  update bgt.depts set pw_hash = crypt(p_pw, gen_salt('bf')), pw_enc = pgp_sym_encrypt(p_pw, v_key),
         pw_set_at = now(), fail_count = 0, locked_until = null
   where dept = p_dept and active and pw_hash is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'ALREADY_SET'); end if;
  perform bgt.log_add(p_dept, 'dept_pw_init', p_dept);
  return jsonb_build_object('ok', true, 'token', bgt.new_session('dept', p_dept), 'dept', p_dept);
end $$;

create or replace function public.bgt_dept_login(p_dept text, p_pw text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.depts;
begin
  select * into v from bgt.depts where dept = p_dept and active for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NO_DEPT'); end if;
  if v.pw_hash is null then return jsonb_build_object('ok', false, 'error', 'PW_NOT_SET'); end if;
  if v.locked_until is not null and v.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED_OUT', 'until', v.locked_until);
  end if;
  if crypt(coalesce(p_pw, ''), v.pw_hash) <> v.pw_hash then
    update bgt.depts set fail_count = case when fail_count + 1 >= 5 then 0 else fail_count + 1 end,
           locked_until = case when fail_count + 1 >= 5 then now() + interval '10 minutes' else null end
     where dept = p_dept;
    return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD', 'left', greatest(5 - (v.fail_count + 1), 0));
  end if;
  update bgt.depts set fail_count = 0, locked_until = null where dept = p_dept;
  return jsonb_build_object('ok', true, 'token', bgt.new_session('dept', p_dept), 'dept', p_dept);
end $$;

create or replace function public.bgt_admin_login(p_pw text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.secret;
begin
  select * into v from bgt.secret where id = 1 for update;
  if v.admin_hash is null then return jsonb_build_object('ok', false, 'error', 'ADMIN_NOT_SET'); end if;
  if v.admin_locked_until is not null and v.admin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED_OUT', 'until', v.admin_locked_until);
  end if;
  if crypt(coalesce(p_pw, ''), v.admin_hash) <> v.admin_hash then
    update bgt.secret set admin_fail = case when admin_fail + 1 >= 5 then 0 else admin_fail + 1 end,
           admin_locked_until = case when admin_fail + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = 1;
    return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD', 'left', greatest(5 - (v.admin_fail + 1), 0));
  end if;
  update bgt.secret set admin_fail = 0, admin_locked_until = null where id = 1;
  perform bgt.log_add('admin', 'admin_login', '');
  return jsonb_build_object('ok', true, 'token', bgt.new_session('admin', null));
end $$;

create or replace function public.bgt_logout(p_token text)
returns void language sql security definer set search_path = bgt, extensions, public as $$
  delete from bgt.sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ── 부서 RPC ────────────────────────────────────────────────────────────────
create or replace function public.bgt_d_load(p_token text, p_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  v := bgt.sess(p_token, 'dept');
  return bgt.bundle(p_year, v.dept) || jsonb_build_object(
    'dept', v.dept,
    'codes', (select coalesce(jsonb_agg(to_jsonb(c) order by c.type, c.sort, c.code), '[]'::jsonb) from bgt.codes c where c.active));
end $$;

create or replace function public.bgt_d_line_save(p_token text, p_year int, p_line jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  v := bgt.sess(p_token, 'dept');
  return bgt.line_upsert(p_year, v.dept, p_line, false, v.dept);
end $$;

create or replace function public.bgt_d_line_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  v := bgt.sess(p_token, 'dept');
  perform bgt.line_remove(p_id, v.dept, false, v.dept);
end $$;

create or replace function public.bgt_d_spend_save(p_token text, p_line_id uuid, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  v := bgt.sess(p_token, 'dept');
  return bgt.spend_upsert(p_line_id, p_entry, v.dept, false, v.dept);
end $$;

create or replace function public.bgt_d_spend_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  v := bgt.sess(p_token, 'dept');
  perform bgt.spend_remove(p_id, v.dept, false, v.dept);
end $$;

-- 제출: 서버에서 필수 규칙(증감 사유)을 다시 검증
create or replace function public.bgt_d_submit(p_token text, p_year int, p_type text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions; v_pct int; v_bad jsonb;
begin
  v := bgt.sess(p_token, 'dept');
  if p_type not in ('세입', '세출') then raise exception 'BAD_TYPE'; end if;
  perform bgt.assert_editable(p_year, v.dept, p_type);
  select variance_pct into v_pct from bgt.settings where year = p_year;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'msg',
           case when l.base_amount = 0 then '신규 항목은 사유가 필요합니다' else '전년 대비 ' || v_pct || '% 초과 증감 사유가 필요합니다' end)), '[]'::jsonb)
    into v_bad
    from bgt.lines l
   where l.year = p_year and l.dept = v.dept and l.type = p_type and btrim(l.reason) = ''
     and ((l.base_amount = 0 and l.amount > 0)
       or (l.base_amount > 0 and abs(l.amount - l.base_amount) * 100.0 / l.base_amount > v_pct));
  if jsonb_array_length(v_bad) > 0 then return jsonb_build_object('ok', false, 'violations', v_bad); end if;
  insert into bgt.submissions(year, dept, type, status, submitted_at, reject_reason)
  values (p_year, v.dept, p_type, 'submitted', now(), '')
  on conflict (year, dept, type) do update set status = 'submitted', submitted_at = now(), reject_reason = '';
  perform bgt.log_add(v.dept, 'submit', v.dept || '/' || p_type);
  return jsonb_build_object('ok', true);
end $$;

-- 검토 시작 전(submitted)에는 부서가 회수 가능
create or replace function public.bgt_d_recall(p_token text, p_year int, p_type text)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions; n int;
begin
  v := bgt.sess(p_token, 'dept');
  if not bgt.is_open(p_year) then raise exception 'PERIOD_CLOSED'; end if;
  update bgt.submissions set status = 'draft' where year = p_year and dept = v.dept and type = p_type and status = 'submitted';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'LOCKED'; end if;
  perform bgt.log_add(v.dept, 'recall', v.dept || '/' || p_type);
end $$;

create or replace function public.bgt_d_change_password(p_token text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions; d bgt.depts; k text;
begin
  v := bgt.sess(p_token, 'dept');
  if p_new is null or char_length(p_new) < 4 then return jsonb_build_object('ok', false, 'error', 'PW_TOO_SHORT'); end if;
  select * into d from bgt.depts where dept = v.dept;
  if crypt(coalesce(p_old, ''), d.pw_hash) <> d.pw_hash then return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD'); end if;
  select enc_key into k from bgt.secret where id = 1;
  update bgt.depts set pw_hash = crypt(p_new, gen_salt('bf')), pw_enc = pgp_sym_encrypt(p_new, k), pw_set_at = now() where dept = v.dept;
  perform bgt.log_add(v.dept, 'dept_pw_change', v.dept);
  return jsonb_build_object('ok', true);
end $$;

-- ── 관리자 RPC ──────────────────────────────────────────────────────────────
create or replace function public.bgt_a_load(p_token text, p_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  return bgt.bundle(p_year, null) || jsonb_build_object(
    'all_settings', (select coalesce(jsonb_agg(to_jsonb(s) order by s.year desc), '[]'::jsonb) from bgt.settings s),
    'depts', (select coalesce(jsonb_agg(jsonb_build_object('dept', d.dept, 'sort', d.sort, 'active', d.active,
                'has_pw', d.pw_hash is not null, 'pw_set_at', d.pw_set_at, 'locked_until', d.locked_until) order by d.sort, d.dept), '[]'::jsonb) from bgt.depts d),
    'codes', (select coalesce(jsonb_agg(to_jsonb(c) order by c.type, c.sort, c.code), '[]'::jsonb) from bgt.codes c));
end $$;

create or replace function public.bgt_a_dept_pw(p_token text, p_dept text, p_action text, p_pw text default null)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare k text; d bgt.depts;
begin
  perform bgt.sess(p_token, 'admin');
  select * into d from bgt.depts where dept = p_dept;
  if not found then raise exception 'NOT_FOUND'; end if;
  select enc_key into k from bgt.secret where id = 1;
  if p_action = 'view' then
    perform bgt.log_add('admin', 'dept_pw_view', p_dept);
    if d.pw_enc is null then return jsonb_build_object('ok', true, 'password', null); end if;
    return jsonb_build_object('ok', true, 'password', pgp_sym_decrypt(d.pw_enc, k));
  elsif p_action = 'reset' then
    update bgt.depts set pw_hash = null, pw_enc = null, pw_set_at = null, fail_count = 0, locked_until = null where dept = p_dept;
    delete from bgt.sessions where role = 'dept' and dept = p_dept;
    perform bgt.log_add('admin', 'dept_pw_reset', p_dept);
    return jsonb_build_object('ok', true);
  elsif p_action = 'set' then
    if p_pw is null or char_length(p_pw) < 4 then return jsonb_build_object('ok', false, 'error', 'PW_TOO_SHORT'); end if;
    update bgt.depts set pw_hash = crypt(p_pw, gen_salt('bf')), pw_enc = pgp_sym_encrypt(p_pw, k), pw_set_at = now(), fail_count = 0, locked_until = null where dept = p_dept;
    delete from bgt.sessions where role = 'dept' and dept = p_dept;
    perform bgt.log_add('admin', 'dept_pw_set', p_dept);
    return jsonb_build_object('ok', true);
  elsif p_action = 'unlock' then
    update bgt.depts set fail_count = 0, locked_until = null where dept = p_dept;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'BAD_ACTION';
end $$;

create or replace function public.bgt_a_dept_save(p_token text, p_dept text, p_sort int, p_active boolean)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  if btrim(coalesce(p_dept, '')) = '' then raise exception 'NAME_REQUIRED'; end if;
  insert into bgt.depts(dept, sort, active) values (btrim(p_dept), coalesce(p_sort, 0), coalesce(p_active, true))
  on conflict (dept) do update set sort = coalesce(p_sort, bgt.depts.sort), active = coalesce(p_active, bgt.depts.active);
  perform bgt.log_add('admin', 'dept_save', p_dept);
end $$;

create or replace function public.bgt_a_settings_save(p_token text, p_s jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v_year int := (p_s->>'year')::int; v_status text := coalesce(p_s->>'status', 'draft'); v_row bgt.settings;
begin
  perform bgt.sess(p_token, 'admin');
  if v_status not in ('draft', 'open', 'closed', 'finalized') then raise exception 'BAD_STATUS'; end if;
  if v_status = 'finalized' and not exists (select 1 from bgt.settings where year = v_year and status = 'finalized') then
    raise exception 'BAD_STATUS';   -- 확정은 bgt_a_finalize 로만 가능
  end if;
  insert into bgt.settings(year, base_year, status, open_at, close_at, variance_pct, note)
  values (v_year, coalesce((p_s->>'base_year')::int, v_year - 1), v_status,
          nullif(p_s->>'open_at', '')::timestamptz, nullif(p_s->>'close_at', '')::timestamptz,
          coalesce((p_s->>'variance_pct')::int, 20), coalesce(p_s->>'note', ''))
  on conflict (year) do update set
    base_year = excluded.base_year, status = excluded.status, open_at = excluded.open_at, close_at = excluded.close_at,
    variance_pct = excluded.variance_pct, note = excluded.note,
    finalized_at = case when excluded.status = 'finalized' then bgt.settings.finalized_at else null end
  returning * into v_row;
  perform bgt.log_add('admin', 'settings_save', v_year::text, p_s);
  return to_jsonb(v_row);
end $$;

create or replace function public.bgt_a_caps_save(p_token text, p_year int, p_caps jsonb)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
declare r jsonb;
begin
  perform bgt.sess(p_token, 'admin');
  for r in select * from jsonb_array_elements(coalesce(p_caps, '[]'::jsonb)) loop
    insert into bgt.caps(year, dept, type, amount) values (p_year, r->>'dept', r->>'type', greatest(coalesce(bgt.num(r->>'amount'), 0), 0))
    on conflict (year, dept, type) do update set amount = excluded.amount;
  end loop;
  perform bgt.log_add('admin', 'caps_save', p_year::text);
end $$;

create or replace function public.bgt_a_code_save(p_token text, p_code jsonb)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  insert into bgt.codes(type, code, level, name, descr, example, sort, active)
  values (p_code->>'type', btrim(p_code->>'code'), p_code->>'level', btrim(p_code->>'name'),
          coalesce(p_code->>'descr', ''), coalesce(p_code->>'example', ''), coalesce((p_code->>'sort')::int, 0),
          coalesce((p_code->>'active')::boolean, true))
  on conflict (type, code) do update set level = excluded.level, name = excluded.name, descr = excluded.descr,
          example = excluded.example, sort = excluded.sort, active = excluded.active;
  perform bgt.log_add('admin', 'code_save', (p_code->>'type') || '/' || (p_code->>'code'), p_code);
end $$;

create or replace function public.bgt_a_line_save(p_token text, p_year int, p_line jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  return bgt.line_upsert(p_year, null, p_line, true, 'admin');
end $$;

create or replace function public.bgt_a_line_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  perform bgt.line_remove(p_id, null, true, 'admin');
end $$;

create or replace function public.bgt_a_spend_save(p_token text, p_line_id uuid, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  return bgt.spend_upsert(p_line_id, p_entry, null, true, 'admin');
end $$;

create or replace function public.bgt_a_spend_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  perform bgt.spend_remove(p_id, null, true, 'admin');
end $$;

-- 검토: review(검토 시작) / reject(반려) / approve(확정) / unlock(작성 상태로 되돌림)
create or replace function public.bgt_a_review(p_token text, p_year int, p_dept text, p_type text, p_action text, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare cur text; nxt text;
begin
  perform bgt.sess(p_token, 'admin');
  if exists (select 1 from bgt.settings where year = p_year and status = 'finalized') then raise exception 'FINALIZED'; end if;
  select status into cur from bgt.submissions where year = p_year and dept = p_dept and type = p_type;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action = 'review' and cur = 'submitted' then nxt := 'reviewing';
  elsif p_action = 'reject' and cur in ('submitted', 'reviewing') then
    if btrim(coalesce(p_reason, '')) = '' then raise exception 'REASON_REQUIRED'; end if;
    nxt := 'draft';
  elsif p_action = 'approve' and cur in ('submitted', 'reviewing') then nxt := 'confirmed';
  elsif p_action = 'unlock' and cur in ('submitted', 'reviewing', 'confirmed') then nxt := 'draft';
  else raise exception 'BAD_TRANSITION'; end if;
  update bgt.submissions set status = nxt, reviewed_at = now(),
         confirmed_at = case when nxt = 'confirmed' then now() else null end,
         reject_reason = case when p_action = 'reject' then btrim(p_reason) when nxt = 'draft' then reject_reason else '' end
   where year = p_year and dept = p_dept and type = p_type;
  perform bgt.log_add('admin', 'review_' || p_action, p_dept || '/' || p_type, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true, 'status', nxt);
end $$;

-- 최종 반영: 모든 (부서, 구분)이 확정이어야 함. p_force=true면 미확정 건을 두고 확정 처리.
create or replace function public.bgt_a_finalize(p_token text, p_year int, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare n int;
begin
  perform bgt.sess(p_token, 'admin');
  select count(*) into n from bgt.submissions s
   where s.year = p_year and s.status <> 'confirmed'
     and exists (select 1 from bgt.lines l where l.year = s.year and l.dept = s.dept and l.type = s.type);
  if n > 0 and not coalesce(p_force, false) then return jsonb_build_object('ok', false, 'pending', n); end if;
  update bgt.settings set status = 'finalized', finalized_at = now() where year = p_year;
  perform bgt.log_add('admin', 'finalize', p_year::text, jsonb_build_object('pending', n, 'force', p_force));
  return jsonb_build_object('ok', true, 'pending', n);
end $$;

-- 다음 연도 초기화: 직전 연도 항목을 기준(base)으로 복사
create or replace function public.bgt_a_init_year(p_token text, p_year int, p_base_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare n int := 0;
begin
  perform bgt.sess(p_token, 'admin');
  if exists (select 1 from bgt.lines where year = p_year) then raise exception 'ALREADY_INIT'; end if;
  insert into bgt.settings(year, base_year) values (p_year, p_base_year) on conflict (year) do nothing;
  insert into bgt.lines(year, dept, type, mok, name, base_calc, base_amount, calc, amount, sort, updated_by)
  select p_year, dept, type, mok, name, calc, amount, calc, amount, sort, 'admin' from bgt.lines where year = p_base_year;
  get diagnostics n = row_count;
  insert into bgt.submissions(year, dept, type)
  select p_year, d.dept, t.type from bgt.depts d cross join (values ('세입'), ('세출')) as t(type) where d.active
  on conflict do nothing;
  perform bgt.log_add('admin', 'init_year', p_year::text, jsonb_build_object('from', p_base_year, 'lines', n));
  return jsonb_build_object('ok', true, 'lines', n);
end $$;

create or replace function public.bgt_a_change_password(p_token text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.secret;
begin
  perform bgt.sess(p_token, 'admin');
  if p_new is null or char_length(p_new) < 8 then return jsonb_build_object('ok', false, 'error', 'PW_TOO_SHORT'); end if;
  select * into v from bgt.secret where id = 1;
  if crypt(coalesce(p_old, ''), v.admin_hash) <> v.admin_hash then return jsonb_build_object('ok', false, 'error', 'BAD_PASSWORD'); end if;
  update bgt.secret set admin_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  perform bgt.log_add('admin', 'admin_pw_change', '');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.bgt_a_log(p_token text, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  return (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
            from (select * from bgt.log order by id desc limit least(coalesce(p_limit, 200), 1000)) x);
end $$;

-- 실행 권한: 공개 RPC만 anon/authenticated에 부여
revoke all on all functions in schema bgt from public, anon, authenticated;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'bgt\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
