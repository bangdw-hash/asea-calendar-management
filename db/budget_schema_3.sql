-- 부서 예산안 스키마 3/4: 공개 RPC (접속 · 부서)
-- 번호 순서대로 파일마다 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)

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

