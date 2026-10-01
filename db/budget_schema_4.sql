-- 부서 예산안 스키마 4/4: 관리자 RPC · 실행 권한
-- 번호 순서대로 파일마다 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)

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
