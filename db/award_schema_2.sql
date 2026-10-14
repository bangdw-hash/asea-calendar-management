-- ============================================================================
-- 상장 출력기 2차: 발급 대장(위조 방지 인증번호) — award_schema.sql 실행 후 이어서 실행하십시오.
--  * 출력할 때 장마다 인증번호를 부여해 awd.issued 에 등록하고, 누구나 award-verify.html 에서 인증번호로 진위를 확인합니다.
--  * 공개 확인(award_verify)은 마스킹된 이름·번호·양식명·발급일·폐기 여부만 반환합니다.
--  * 여러 번 실행해도 안전합니다(idempotent).
-- ============================================================================
create table if not exists awd.issued (
  code text primary key,
  serial text not null default '',
  tpl_name text not null default '',
  holder text not null default '',
  batch_label text not null default '',
  issued_at timestamptz not null default now(),
  revoked boolean not null default false,
  revoked_at timestamptz
);
create index if not exists issued_at_idx on awd.issued(issued_at desc);
alter table awd.issued enable row level security;
revoke all on awd.issued from public, anon, authenticated;

create or replace function public.award_issue_register(p_token text, p_items jsonb, p_label text default '') returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare n int := 0; x jsonb;
begin
  perform awd.sess(p_token);
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into awd.issued(code, serial, tpl_name, holder, batch_label)
      values (upper(x->>'code'), coalesce(x->>'serial', ''), coalesce(x->>'tpl', ''), coalesce(x->>'holder', ''), coalesce(p_label, ''))
      on conflict (code) do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

create or replace function public.award_issued_list(p_token text, p_q text default '') returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(to_jsonb(i) order by i.issued_at desc), '[]'::jsonb)
            from (select * from awd.issued
                   where coalesce(p_q, '') = '' or code ilike '%' || p_q || '%' or serial ilike '%' || p_q || '%' or holder ilike '%' || p_q || '%' or tpl_name ilike '%' || p_q || '%'
                   order by issued_at desc limit 300) i);
end $$;

create or replace function public.award_issued_revoke(p_token text, p_code text, p_revoked boolean) returns void
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  update awd.issued set revoked = coalesce(p_revoked, true), revoked_at = case when coalesce(p_revoked, true) then now() else null end where code = upper(p_code);
  perform awd.log_add(case when coalesce(p_revoked, true) then 'issue_revoke' else 'issue_restore' end, upper(p_code));
end $$;

-- 공개 진위 확인 (토큰 불필요). 이름은 가운데 글자를 가려서 반환
create or replace function public.award_verify(p_code text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare i awd.issued; m text; n int;
begin
  select * into i from awd.issued where code = upper(trim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('ok', false); end if;
  n := char_length(i.holder);
  m := case when n <= 1 then i.holder when n = 2 then left(i.holder, 1) || '*' else left(i.holder, 1) || repeat('*', n - 2) || right(i.holder, 1) end;
  return jsonb_build_object('ok', true, 'serial', i.serial, 'tpl', i.tpl_name, 'holder', m, 'issued_at', i.issued_at, 'revoked', i.revoked);
end $$;

revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
