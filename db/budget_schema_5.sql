-- 부서 예산안 스키마 5/5: 결재 QR 집행 연동
-- 선행: budget_schema_1~4.sql 실행 완료. 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
-- 흐름
--   1) 부서가 기안 전에 집행 예정 내역을 입력해 QR을 발급받고, 기안문에 삽입합니다.
--   2) 누구나 QR을 스캔해 결재번호를 입력하고 [반영]을 누르면 부서 지출 기록(bgt.spend)에 1회만 반영됩니다.
--   3) 반영 후 재스캔하면 「이미 반영된 내역」이 표시되고, 부서·관리자 로그인 후에만 [수정반영]이 가능합니다.
--   4) 귀속 부서·과목이 정해지지 않은 줄은 「미배정」으로 반영하고, 관리자가 배정(이관·예비비·미편성 신규 줄)합니다.
--   5) 모든 반영·수정·배정·무효 처리는 bgt.ticket_events에 변경 전후 값과 함께 남고, 수정·삭제할 수 없습니다.

-- ── 기존 테이블 확장 ────────────────────────────────────────────────────────
alter table bgt.lines add column if not exists origin text not null default 'plan';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bgt_lines_origin_chk') then
    alter table bgt.lines add constraint bgt_lines_origin_chk check (origin in ('plan', 'unplanned'));
  end if;
end $$;
alter table bgt.spend add column if not exists ticket_line_id uuid;
alter table bgt.spend add column if not exists doc_no text not null default '';

-- ── 테이블 ──────────────────────────────────────────────────────────────────
create table if not exists bgt.tickets (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  year int not null,
  dept text not null references bgt.depts(dept) on update cascade,
  title text not null,
  status text not null default 'issued' check (status in ('issued', 'applied', 'void')),
  doc_no text,
  planned_total bigint not null default 0,
  applied_total bigint,
  issued_at timestamptz not null default now(),
  applied_at timestamptz,
  void_at timestamptz,
  void_reason text not null default '',
  scans int not null default 0,
  last_scan_at timestamptz
);
-- 결재번호는 무효가 아닌 QR 사이에서 중복될 수 없습니다.
create unique index if not exists bgt_tickets_docno on bgt.tickets (lower(btrim(doc_no))) where status <> 'void' and doc_no is not null;
create index if not exists bgt_tickets_year on bgt.tickets (year, dept);

create table if not exists bgt.ticket_lines (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references bgt.tickets(id) on delete cascade,
  sort int not null default 0,
  alloc text not null default 'pending' check (alloc in ('line', 'pending', 'reserve')),
  line_id uuid references bgt.lines(id) on delete set null,
  prop_dept text not null default '',
  prop_mok text not null default '',
  prop_note text not null default '',
  memo text not null default '',
  vendor text not null default '',
  spent_on date,
  planned_amount bigint not null default 0,
  applied_amount bigint,
  spend_id uuid references bgt.spend(id) on delete set null
);
create index if not exists bgt_ticket_lines_t on bgt.ticket_lines (ticket_id, sort);

create table if not exists bgt.ticket_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  ticket_id uuid not null,
  actor text not null default '',
  kind text not null,
  reason text not null default '',
  doc_no text not null default '',
  old_data jsonb,
  new_data jsonb,
  meta jsonb
);
create index if not exists bgt_ticket_events_t on bgt.ticket_events (ticket_id, id);

-- 이력은 추가만 가능합니다.
create or replace function bgt.ticket_events_guard() returns trigger language plpgsql as $$
begin raise exception 'EVENTS_APPEND_ONLY'; end $$;
drop trigger if exists ticket_events_guard on bgt.ticket_events;
create trigger ticket_events_guard before update or delete on bgt.ticket_events for each row execute function bgt.ticket_events_guard();
drop trigger if exists ticket_events_guard_t on bgt.ticket_events;
create trigger ticket_events_guard_t before truncate on bgt.ticket_events for each statement execute function bgt.ticket_events_guard();

alter table bgt.tickets enable row level security;
alter table bgt.ticket_lines enable row level security;
alter table bgt.ticket_events enable row level security;
revoke all on bgt.tickets, bgt.ticket_lines, bgt.ticket_events from public, anon, authenticated;
revoke all on all sequences in schema bgt from public, anon, authenticated;

-- ── 내부 함수 ───────────────────────────────────────────────────────────────
create or replace function bgt.try_sess(p_token text)
returns bgt.sessions language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  if p_token is null or p_token = '' then return null; end if;
  select * into v from bgt.sessions where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expires_at > now();
  if not found then return null; end if;
  return v;
end $$;

-- 요청 정보(IP는 해시만 보관)
create or replace function bgt.req_meta()
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare h jsonb; ip text; salt text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  if h is null then return '{}'::jsonb; end if;
  ip := split_part(coalesce(h->>'x-forwarded-for', h->>'cf-connecting-ip', ''), ',', 1);
  select enc_key into salt from bgt.secret where id = 1;
  return jsonb_build_object('ip', case when btrim(ip) = '' then null else left(encode(digest(btrim(ip) || salt, 'sha256'), 'hex'), 12) end,
                            'ua', left(coalesce(h->>'user-agent', ''), 160));
end $$;

create or replace function bgt.ticket_ev(p_ticket uuid, p_actor text, p_kind text, p_reason text, p_doc text, p_old jsonb, p_new jsonb)
returns void language sql security definer set search_path = bgt, public as $$
  insert into bgt.ticket_events(ticket_id, actor, kind, reason, doc_no, old_data, new_data, meta)
  values (p_ticket, coalesce(p_actor, ''), p_kind, coalesce(p_reason, ''), coalesce(p_doc, ''), p_old, p_new, bgt.req_meta());
$$;

create or replace function bgt.ticket_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path = bgt, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', tl.id, 'alloc', tl.alloc, 'line_id', tl.line_id,
           'dept', coalesce(l.dept, tl.prop_dept), 'mok', coalesce(l.mok, tl.prop_mok), 'name', l.name, 'note', tl.prop_note,
           'memo', tl.memo, 'planned', tl.planned_amount, 'applied', tl.applied_amount, 'spent_on', tl.spent_on) order by tl.sort), '[]'::jsonb)
    from bgt.ticket_lines tl left join bgt.lines l on l.id = tl.line_id where tl.ticket_id = p_id;
$$;

create or replace function bgt.spend_memo(p_doc text, p_alloc text, p_memo text)
returns text language sql immutable as $$
  select '[결재 ' || p_doc || ']' || case when p_alloc = 'reserve' then '[예비비]' else '' end
         || case when btrim(coalesce(p_memo, '')) = '' then '' else ' ' || btrim(p_memo) end;
$$;

create or replace function bgt.ticket_recalc(p_id uuid)
returns void language sql security definer set search_path = bgt, public as $$
  update bgt.tickets set applied_total = (select coalesce(sum(applied_amount), 0) from bgt.ticket_lines where ticket_id = p_id)
   where id = p_id and status = 'applied';
$$;

-- 부서와 관련된 QR인가: 발급 부서이거나, 줄의 제안·배정 부서인 경우
create or replace function bgt.ticket_related(p_id uuid, p_dept text)
returns boolean language sql stable security definer set search_path = bgt, public as $$
  select p_dept is not null and (
    exists (select 1 from bgt.tickets t where t.id = p_id and t.dept = p_dept)
    or exists (select 1 from bgt.ticket_lines tl left join bgt.lines l on l.id = tl.line_id
                where tl.ticket_id = p_id and (tl.prop_dept = p_dept or l.dept = p_dept)));
$$;

-- 화면용 묶음. 비로그인은 거래처명을 볼 수 없고, 부서·관리자만 수정 가능 표시를 받습니다.
create or replace function bgt.ticket_view(p_id uuid, p_sess bgt.sessions, p_hist boolean)
returns jsonb language plpgsql stable security definer set search_path = bgt, public as $$
declare t bgt.tickets; v_role text := 'anon'; v_edit boolean := false; v_full boolean := false; v_lines jsonb;
begin
  select * into t from bgt.tickets where id = p_id;
  if not found then return null; end if;
  if p_sess.role = 'admin' then v_role := 'admin'; v_full := true; v_edit := t.status = 'applied';
  elsif p_sess.role = 'dept' then
    if bgt.ticket_related(t.id, p_sess.dept) then v_role := 'dept'; v_full := true; v_edit := t.status = 'applied';
    else v_role := 'other'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', tl.id, 'sort', tl.sort,
      'alloc', case when tl.alloc in ('line', 'reserve') and tl.line_id is null then 'pending' else tl.alloc end,
      'memo', tl.memo, 'vendor', case when v_full then tl.vendor else '' end, 'spent_on', tl.spent_on,
      'planned', tl.planned_amount, 'applied', tl.applied_amount,
      'prop_dept', tl.prop_dept, 'prop_mok', tl.prop_mok, 'prop_note', tl.prop_note,
      'target', case when l.id is null then null else jsonb_build_object(
          'line_id', l.id, 'dept', l.dept, 'mok', l.mok, 'name', l.name, 'origin', l.origin, 'budget', l.base_amount,
          'used', coalesce((select sum(s.amount) from bgt.spend s where s.line_id = l.id), 0),
          'hist', case when p_hist then (
              select coalesce(jsonb_agg(jsonb_build_object('on', h.spent_on, 'memo', h.memo, 'amount', h.amount, 'doc_no', h.doc_no,
                       'vendor', case when v_full then h.vendor else '' end) order by h.spent_on desc nulls last, h.created_at desc), '[]'::jsonb)
                from (select * from bgt.spend where line_id = l.id order by spent_on desc nulls last, created_at desc limit 30) h) else null end)
      end) order by tl.sort), '[]'::jsonb)
    into v_lines
    from bgt.ticket_lines tl left join bgt.lines l on l.id = tl.line_id where tl.ticket_id = t.id;
  return jsonb_build_object(
    'ticket', jsonb_build_object('title', t.title, 'dept', t.dept, 'year', t.year, 'status', t.status, 'doc_no', t.doc_no,
                'planned_total', t.planned_total, 'applied_total', t.applied_total, 'issued_at', t.issued_at, 'applied_at', t.applied_at,
                'void_reason', t.void_reason, 'scans', t.scans)
              || case when v_full then jsonb_build_object('id', t.id, 'token', t.token) else '{}'::jsonb end,
    'viewer', v_role, 'can_edit', v_edit, 'lines', v_lines);
end $$;

-- 반영 · 수정반영 공통 처리 (행 잠금으로 동시 스캔 시에도 한 번만 반영)
create or replace function bgt.ticket_write(p_id uuid, p_mode text, p_actor text, p_admin boolean, p_doc text, p_lines jsonb, p_reason text, p_neg boolean)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare
  t bgt.tickets; tl bgt.ticket_lines; it jsonb; items jsonb := '[]'::jsonb; new_id uuid; sid uuid;
  doc text := btrim(coalesce(p_doc, '')); reason text := btrim(coalesce(p_reason, ''));
  old_snap jsonb; neg jsonb; need_reason boolean := false; total bigint := 0; new_amt bigint;
  sp_date date; sp_memo text; sp_vendor text; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into t from bgt.tickets where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if t.status = 'void' then return jsonb_build_object('ok', false, 'error', 'VOIDED'); end if;
  if p_mode = 'apply' and t.status <> 'issued' then return jsonb_build_object('ok', false, 'error', 'ALREADY_APPLIED'); end if;
  if p_mode = 'reapply' and t.status <> 'applied' then raise exception 'NOT_APPLIED'; end if;
  if doc = '' then raise exception 'DOC_NO_REQUIRED'; end if;
  if char_length(doc) > 60 then raise exception 'DOC_NO_TOO_LONG'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'LINES_REQUIRED'; end if;

  old_snap := bgt.ticket_snapshot(t.id);

  -- 관리자 분할: id 없는 줄은 새 줄로 추가
  for it in select x from jsonb_array_elements(p_lines) x loop
    if nullif(it->>'id', '') is null then
      if not p_admin then raise exception 'FORBIDDEN'; end if;
      insert into bgt.ticket_lines(ticket_id, sort, alloc, prop_dept, prop_note, memo, vendor, spent_on, planned_amount)
      values (t.id, coalesce((select max(sort) + 1 from bgt.ticket_lines where ticket_id = t.id), 0), 'pending',
              coalesce(nullif(btrim(it->>'prop_dept'), ''), t.dept), coalesce(it->>'prop_note', ''), coalesce(it->>'memo', ''),
              coalesce(it->>'vendor', ''), nullif(it->>'spent_on', '')::date, 0)
      returning id into new_id;
      it := jsonb_set(it, '{id}', to_jsonb(new_id::text));
    end if;
    items := items || jsonb_build_array(it);
  end loop;

  if exists (select 1 from jsonb_array_elements(items) x where bgt.num(x->>'amount') < 0) then raise exception 'AMOUNT_INVALID'; end if;

  -- 결재 기준액과 다른 금액이 있으면 사유 필요
  select exists (
    select 1 from bgt.ticket_lines z
      left join (select (x->>'id')::uuid as id, bgt.num(x->>'amount') as amount from jsonb_array_elements(items) x) i on i.id = z.id
     where z.ticket_id = t.id and coalesce(i.amount, z.applied_amount, z.planned_amount) <> z.planned_amount) into need_reason;

  -- 마이너스(예산 초과) 점검
  select coalesce(jsonb_agg(jsonb_build_object('line_id', q.line_id, 'dept', q.dept, 'mok', q.mok, 'name', q.name,
           'budget', q.budget, 'after_used', q.other_used + q.mine, 'balance', q.budget - q.other_used - q.mine)), '[]'::jsonb)
    into neg
    from (
      select l.id as line_id, l.dept, l.mok, l.name, l.base_amount as budget,
             coalesce((select sum(s.amount) from bgt.spend s where s.line_id = l.id
                          and not exists (select 1 from bgt.ticket_lines z where z.id = s.ticket_line_id and z.ticket_id = t.id)), 0) as other_used,
             sum(c.new_amt) as mine, sum(coalesce(c.applied_amount, 0)) as prev_mine
        from (select z.line_id, z.applied_amount, coalesce(i.amount, z.applied_amount, z.planned_amount) as new_amt
                from bgt.ticket_lines z
                left join (select (x->>'id')::uuid as id, bgt.num(x->>'amount') as amount from jsonb_array_elements(items) x) i on i.id = z.id
               where z.ticket_id = t.id and z.alloc in ('line', 'reserve') and z.line_id is not null) c
        join bgt.lines l on l.id = c.line_id
       group by l.id
    ) q
   where q.other_used + q.mine > q.budget and (p_mode = 'apply' or q.mine > q.prev_mine);
  if jsonb_array_length(neg) > 0 then
    if not coalesce(p_neg, false) then return jsonb_build_object('ok', false, 'error', 'NEGATIVE_CONFIRM', 'negatives', neg); end if;
    need_reason := true;
  end if;
  if p_mode = 'reapply' then need_reason := true; end if;
  if need_reason and reason = '' then raise exception 'REASON_REQUIRED'; end if;

  begin
    update bgt.tickets set doc_no = doc where id = t.id;
  exception when unique_violation then raise exception 'DOC_NO_DUP';
  end;

  for tl in select * from bgt.ticket_lines where ticket_id = t.id order by sort loop
    it := null;
    select x into it from jsonb_array_elements(items) x where (x->>'id')::uuid = tl.id limit 1;
    new_amt := coalesce(bgt.num(it->>'amount'), tl.applied_amount, tl.planned_amount);
    sp_date := coalesce(nullif(it->>'spent_on', '')::date, tl.spent_on, today);
    sp_memo := case when it ? 'memo' then coalesce(it->>'memo', '') else tl.memo end;
    sp_vendor := case when it ? 'vendor' then coalesce(it->>'vendor', '') else tl.vendor end;
    update bgt.ticket_lines set applied_amount = new_amt, spent_on = sp_date, memo = sp_memo, vendor = sp_vendor where id = tl.id;
    total := total + new_amt;
    if tl.alloc in ('line', 'reserve') and tl.line_id is not null then
      if new_amt > 0 then
        if tl.spend_id is not null and exists (select 1 from bgt.spend where id = tl.spend_id) then
          update bgt.spend set amount = new_amt, spent_on = sp_date, memo = bgt.spend_memo(doc, tl.alloc, sp_memo), vendor = sp_vendor, doc_no = doc
           where id = tl.spend_id;
        else
          insert into bgt.spend(line_id, spent_on, memo, vendor, amount, ticket_line_id, doc_no)
          values (tl.line_id, sp_date, bgt.spend_memo(doc, tl.alloc, sp_memo), sp_vendor, new_amt, tl.id, doc) returning id into sid;
          update bgt.ticket_lines set spend_id = sid where id = tl.id;
        end if;
      elsif tl.spend_id is not null then
        delete from bgt.spend where id = tl.spend_id;
      end if;
    end if;
  end loop;

  update bgt.tickets set status = 'applied', applied_total = total, applied_at = case when p_mode = 'apply' then now() else applied_at end where id = t.id;
  perform bgt.ticket_ev(t.id, p_actor, p_mode, reason, doc, old_snap, bgt.ticket_snapshot(t.id));
  perform bgt.log_add(p_actor, 'ticket_' || p_mode, t.dept || '/' || doc, jsonb_build_object('ticket', t.id, 'total', total));
  return jsonb_build_object('ok', true);
end $$;

-- ── 수동 입력·수정도 이력을 남깁니다 (기존 함수 교체) ───────────────────────
create or replace function bgt.spend_upsert(p_line_id uuid, p_entry jsonb, p_dept text, p_admin boolean, p_actor text)
returns jsonb language plpgsql security definer set search_path = bgt, public as $$
declare v_line bgt.lines; v_id uuid := nullif(p_entry->>'id', '')::uuid; v_row bgt.spend; v_old bgt.spend; v_tid uuid;
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
    select * into v_old from bgt.spend where id = v_id and line_id = p_line_id;
    update bgt.spend set
      spent_on = case when p_entry ? 'spent_on' then nullif(p_entry->>'spent_on', '')::date else spent_on end,
      memo = case when p_entry ? 'memo' then coalesce(p_entry->>'memo', '') else memo end,
      vendor = case when p_entry ? 'vendor' then coalesce(p_entry->>'vendor', '') else vendor end,
      amount = case when p_entry ? 'amount' then coalesce(bgt.num(p_entry->>'amount'), 0) else amount end
    where id = v_id and line_id = p_line_id returning * into v_row;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  perform bgt.log_add(p_actor, 'spend_save', v_line.dept || '/' || v_line.mok,
                      jsonb_build_object('line', v_line.name, 'amount', v_row.amount, 'old', case when v_id is null then null else to_jsonb(v_old) end, 'new', to_jsonb(v_row)));
  if v_row.ticket_line_id is not null then
    update bgt.ticket_lines set applied_amount = v_row.amount, spent_on = v_row.spent_on where id = v_row.ticket_line_id returning ticket_id into v_tid;
    if v_tid is not null then
      perform bgt.ticket_recalc(v_tid);
      perform bgt.ticket_ev(v_tid, p_actor, 'manual_edit', '지출 내역을 직접 수정', v_row.doc_no, to_jsonb(v_old), to_jsonb(v_row));
    end if;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function bgt.spend_remove(p_id uuid, p_dept text, p_admin boolean, p_actor text)
returns void language plpgsql security definer set search_path = bgt, public as $$
declare v_line bgt.lines; v_old bgt.spend; v_tid uuid;
begin
  select l.* into v_line from bgt.lines l join bgt.spend s on s.line_id = l.id where s.id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not p_admin then
    if v_line.dept <> p_dept then raise exception 'FORBIDDEN'; end if;
    perform bgt.assert_editable(v_line.year, v_line.dept, v_line.type);
  end if;
  select * into v_old from bgt.spend where id = p_id;
  if v_old.id is not null then delete from bgt.spend where id = v_old.id; end if;
  perform bgt.log_add(p_actor, 'spend_delete', v_line.dept || '/' || v_line.mok, jsonb_build_object('line', v_line.name, 'old', to_jsonb(v_old)));
  if v_old.ticket_line_id is not null then
    update bgt.ticket_lines set applied_amount = 0, spend_id = null where id = v_old.ticket_line_id returning ticket_id into v_tid;
    if v_tid is not null then
      perform bgt.ticket_recalc(v_tid);
      perform bgt.ticket_ev(v_tid, p_actor, 'manual_delete', '지출 내역을 직접 삭제', v_old.doc_no, to_jsonb(v_old), null);
    end if;
  end if;
end $$;

-- ── 공개 RPC: QR 스캔 (로그인 불필요) ───────────────────────────────────────
create or replace function public.bgt_q_view(p_qr text, p_token text default null)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare t bgt.tickets; s bgt.sessions;
begin
  select * into t from bgt.tickets where token = coalesce(p_qr, '');
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  update bgt.tickets set scans = scans + 1, last_scan_at = now() where id = t.id;
  s := bgt.try_sess(p_token);
  return jsonb_build_object('ok', true) || bgt.ticket_view(t.id, s, true);
end $$;

create or replace function public.bgt_q_apply(p_qr text, p_doc_no text, p_lines jsonb, p_reason text default '', p_neg boolean default false, p_token text default null)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare t bgt.tickets; s bgt.sessions; r jsonb; actor text;
begin
  select * into t from bgt.tickets where token = coalesce(p_qr, '');
  if not found then raise exception 'NOT_FOUND'; end if;
  s := bgt.try_sess(p_token);
  actor := case s.role when 'admin' then '관리자' when 'dept' then s.dept else 'QR 스캔(비로그인)' end;
  r := bgt.ticket_write(t.id, 'apply', actor, false, p_doc_no, p_lines, p_reason, p_neg);
  return r || jsonb_build_object('view', bgt.ticket_view(t.id, s, true));
end $$;

-- 수정반영: 해당 QR의 부서 계정 또는 관리자만 (사유 필수)
create or replace function public.bgt_q_reapply(p_qr text, p_token text, p_doc_no text, p_lines jsonb, p_reason text, p_neg boolean default false)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare t bgt.tickets; s bgt.sessions; r jsonb; v_admin boolean;
begin
  s := bgt.try_sess(p_token);
  if s.role is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into t from bgt.tickets where token = coalesce(p_qr, '');
  if not found then raise exception 'NOT_FOUND'; end if;
  v_admin := s.role = 'admin';
  if not v_admin and not (s.role = 'dept' and bgt.ticket_related(t.id, s.dept)) then raise exception 'FORBIDDEN'; end if;
  r := bgt.ticket_write(t.id, 'reapply', case when v_admin then '관리자' else s.dept end, v_admin, p_doc_no, p_lines, p_reason, p_neg);
  return r || jsonb_build_object('view', bgt.ticket_view(t.id, s, true));
end $$;

-- ── 부서 RPC ────────────────────────────────────────────────────────────────
create or replace function public.bgt_d_ticket_issue(p_token text, p_year int, p_title text, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions; t bgt.tickets; e jsonb; n int := 0; v_line bgt.lines; v_amt bigint; v_total bigint := 0; v_pd text;
begin
  v := bgt.sess(p_token, 'dept');
  if not exists (select 1 from bgt.settings where year = p_year) then raise exception 'NO_YEAR'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'TITLE_REQUIRED'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'LINES_REQUIRED'; end if;
  if jsonb_array_length(p_lines) > 30 then raise exception 'TOO_MANY_LINES'; end if;
  insert into bgt.tickets(year, dept, title) values (p_year, v.dept, left(btrim(p_title), 200)) returning * into t;
  for e in select x from jsonb_array_elements(p_lines) x loop
    v_amt := coalesce(bgt.num(e->>'amount'), 0);
    if v_amt <= 0 then raise exception 'AMOUNT_REQUIRED'; end if;
    if nullif(e->>'line_id', '') is not null then
      select * into v_line from bgt.lines where id = (e->>'line_id')::uuid and year = p_year and dept = v.dept and type = '세출';
      if not found then raise exception 'BAD_LINE'; end if;
      insert into bgt.ticket_lines(ticket_id, sort, alloc, line_id, prop_dept, prop_mok, memo, vendor, spent_on, planned_amount)
      values (t.id, n, 'line', v_line.id, v_line.dept, v_line.mok, coalesce(e->>'memo', ''), coalesce(e->>'vendor', ''), nullif(e->>'spent_on', '')::date, v_amt);
    else
      v_pd := coalesce(nullif(btrim(e->>'prop_dept'), ''), v.dept);
      if not exists (select 1 from bgt.depts where dept = v_pd and active) then raise exception 'BAD_DEPT'; end if;
      insert into bgt.ticket_lines(ticket_id, sort, alloc, prop_dept, prop_mok, prop_note, memo, vendor, spent_on, planned_amount)
      values (t.id, n, 'pending', v_pd, coalesce(e->>'prop_mok', ''), coalesce(e->>'prop_note', ''), coalesce(e->>'memo', ''),
              coalesce(e->>'vendor', ''), nullif(e->>'spent_on', '')::date, v_amt);
    end if;
    n := n + 1; v_total := v_total + v_amt;
  end loop;
  update bgt.tickets set planned_total = v_total where id = t.id returning * into t;
  perform bgt.ticket_ev(t.id, v.dept, 'issue', '', '', null, bgt.ticket_snapshot(t.id));
  perform bgt.log_add(v.dept, 'ticket_issue', v.dept || '/' || t.title, jsonb_build_object('ticket', t.id, 'total', v_total));
  return jsonb_build_object('ok', true, 'token', t.token, 'ticket_id', t.id);
end $$;

create or replace function public.bgt_d_tickets(p_token text, p_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions;
begin
  v := bgt.sess(p_token, 'dept');
  return coalesce((select jsonb_agg(bgt.ticket_view(t.id, v, false) order by t.issued_at desc)
                     from bgt.tickets t where t.year = p_year and bgt.ticket_related(t.id, v.dept)), '[]'::jsonb);
end $$;

-- 아직 반영 전인 QR은 발급 부서가 무효 처리(잘못 발급한 경우)할 수 있습니다.
create or replace function public.bgt_d_ticket_void(p_token text, p_ticket_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare v bgt.sessions; t bgt.tickets;
begin
  v := bgt.sess(p_token, 'dept');
  select * into t from bgt.tickets where id = p_ticket_id for update;
  if not found or t.dept <> v.dept then raise exception 'FORBIDDEN'; end if;
  if t.status <> 'issued' then raise exception 'LOCKED'; end if;
  update bgt.tickets set status = 'void', void_at = now(), void_reason = btrim(coalesce(p_reason, '')) where id = t.id;
  perform bgt.ticket_ev(t.id, v.dept, 'void', p_reason, '', bgt.ticket_snapshot(t.id), null);
  return jsonb_build_object('ok', true);
end $$;

-- 이력 조회: 관리자 또는 해당 QR의 부서 (접속 정보는 관리자에게만)
create or replace function public.bgt_ticket_events(p_token text, p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare s bgt.sessions;
begin
  s := bgt.try_sess(p_token);
  if s.role is null then raise exception 'AUTH_REQUIRED'; end if;
  if s.role = 'dept' and not bgt.ticket_related(p_ticket_id, s.dept) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'actor', e.actor, 'kind', e.kind, 'reason', e.reason,
                          'doc_no', e.doc_no, 'old', e.old_data, 'new', e.new_data, 'meta', case when s.role = 'admin' then e.meta else null end) order by e.id desc)
                     from (select * from bgt.ticket_events where ticket_id = p_ticket_id order by id desc limit 200) e), '[]'::jsonb);
end $$;

-- ── 관리자 RPC ──────────────────────────────────────────────────────────────
create or replace function public.bgt_a_tickets(p_token text, p_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare s bgt.sessions;
begin
  s := bgt.sess(p_token, 'admin');
  return coalesce((select jsonb_agg(bgt.ticket_view(t.id, s, false) order by t.issued_at desc) from bgt.tickets t where t.year = p_year), '[]'::jsonb);
end $$;

-- 줄 배정: mode = line(기존 항목) / new_line(미편성 신규 항목) / reserve(예비비 7.2.1) / pending(미배정으로 되돌림)
create or replace function public.bgt_a_ticket_assign(p_token text, p_ticket_line_id uuid, p_target jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare
  tl bgt.ticket_lines; t bgt.tickets; v_line bgt.lines; mode text := p_target->>'mode'; reason text := btrim(coalesce(p_reason, ''));
  old_snap jsonb; v_dept text; v_mok text; v_name text; sid uuid; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform bgt.sess(p_token, 'admin');
  if reason = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into tl from bgt.ticket_lines where id = p_ticket_line_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into t from bgt.tickets where id = tl.ticket_id for update;
  if t.status = 'void' then raise exception 'VOIDED'; end if;
  old_snap := bgt.ticket_snapshot(t.id);

  if tl.spend_id is not null then delete from bgt.spend where id = tl.spend_id; end if;

  if mode = 'pending' then
    update bgt.ticket_lines set alloc = 'pending', line_id = null, spend_id = null where id = tl.id;
  elsif mode in ('line', 'reserve') then
    select * into v_line from bgt.lines where id = nullif(p_target->>'line_id', '')::uuid and type = '세출' and year = t.year;
    if not found then raise exception 'BAD_LINE'; end if;
    if mode = 'reserve' and v_line.mok <> '7.2.1' then raise exception 'NOT_RESERVE'; end if;
    update bgt.ticket_lines set alloc = mode, line_id = v_line.id, prop_mok = v_line.mok, spend_id = null,
           prop_dept = case when mode = 'reserve' then coalesce(nullif(btrim(p_target->>'use_dept'), ''), tl.prop_dept) else v_line.dept end,
           prop_note = case when mode = 'reserve' then coalesce(nullif(btrim(p_target->>'title'), ''), tl.prop_note) else tl.prop_note end
     where id = tl.id;
  elsif mode = 'new_line' then
    v_dept := btrim(coalesce(p_target->>'dept', '')); v_mok := btrim(coalesce(p_target->>'mok', '')); v_name := btrim(coalesce(p_target->>'name', ''));
    if not exists (select 1 from bgt.depts where dept = v_dept and active) then raise exception 'BAD_DEPT'; end if;
    if not exists (select 1 from bgt.codes where type = '세출' and code = v_mok and level = 'mok' and active) then raise exception 'BAD_CODE'; end if;
    if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
    select * into v_line from bgt.lines where year = t.year and dept = v_dept and type = '세출' and mok = v_mok and name = v_name limit 1;
    if not found then
      insert into bgt.lines(year, dept, type, mok, name, base_amount, amount, reason, origin, sort, updated_by)
      values (t.year, v_dept, '세출', v_mok, v_name, 0, 0, '결재 QR 미편성 집행',
              'unplanned', coalesce((select max(sort) + 1 from bgt.lines where year = t.year and dept = v_dept and type = '세출'), 0), 'admin')
      returning * into v_line;
    end if;
    update bgt.ticket_lines set alloc = 'line', line_id = v_line.id, prop_dept = v_line.dept, prop_mok = v_line.mok, spend_id = null where id = tl.id;
  else
    raise exception 'BAD_MODE';
  end if;

  select * into tl from bgt.ticket_lines where id = p_ticket_line_id;
  if t.status = 'applied' and tl.alloc in ('line', 'reserve') and tl.line_id is not null and coalesce(tl.applied_amount, 0) > 0 then
    insert into bgt.spend(line_id, spent_on, memo, vendor, amount, ticket_line_id, doc_no)
    values (tl.line_id, coalesce(tl.spent_on, today), bgt.spend_memo(t.doc_no, tl.alloc, tl.memo), tl.vendor, tl.applied_amount, tl.id, t.doc_no)
    returning id into sid;
    update bgt.ticket_lines set spend_id = sid where id = tl.id;
  end if;
  perform bgt.ticket_ev(t.id, '관리자', 'assign', reason, coalesce(t.doc_no, ''), old_snap, bgt.ticket_snapshot(t.id));
  perform bgt.log_add('admin', 'ticket_assign', t.dept || '/' || coalesce(t.doc_no, t.title), jsonb_build_object('ticket', t.id, 'mode', mode));
  return jsonb_build_object('ok', true);
end $$;

-- 무효 처리(결재 취소·반려): 연결된 지출 기록을 지우고 QR을 무효로 만듭니다. 이력은 남습니다.
create or replace function public.bgt_a_ticket_void(p_token text, p_ticket_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare t bgt.tickets; reason text := btrim(coalesce(p_reason, '')); r record;
begin
  perform bgt.sess(p_token, 'admin');
  if reason = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into t from bgt.tickets where id = p_ticket_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if t.status = 'void' then raise exception 'VOIDED'; end if;
  perform bgt.ticket_ev(t.id, '관리자', 'void', reason, coalesce(t.doc_no, ''), bgt.ticket_snapshot(t.id), null);
  for r in select spend_id from bgt.ticket_lines where ticket_id = t.id and spend_id is not null loop
    delete from bgt.spend where id = r.spend_id;
  end loop;
  update bgt.tickets set status = 'void', void_at = now(), void_reason = reason where id = t.id;
  perform bgt.log_add('admin', 'ticket_void', t.dept || '/' || coalesce(t.doc_no, t.title), jsonb_build_object('ticket', t.id));
  return jsonb_build_object('ok', true);
end $$;

-- ── 실행 권한: 공개 RPC만 anon/authenticated에 부여 ─────────────────────────
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
