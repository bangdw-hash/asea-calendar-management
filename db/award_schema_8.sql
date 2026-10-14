-- ============================================================================
-- 상장 출력기 8차: QR 조회 건별 기록(복제 의심 판단용) — award_schema_7.sql 실행 후 이어서 실행하십시오.
--  * 공개 확인(award_verify)이 호출될 때마다 시각·IP 해시(원본 IP는 저장하지 않음)·기기 종류를 awd.issued_view 에 남깁니다.
--  * IP 해시는 비밀 문구와 섞어 SHA-256 한 뒤 앞 12자리만 저장하므로 IP 를 되돌릴 수 없습니다. 기기는 iOS/Android/Windows/macOS/기타/봇 으로만 분류합니다.
--  * 기록은 1년이 지나면 자동 정리됩니다. 관리자 발급 대장에서 번호별 조회 내역과 서로 다른 접속지 수를 봅니다.
--  * 여러 번 실행해도 안전합니다(idempotent).
-- ============================================================================
create table if not exists awd.issued_view (
  id bigserial primary key,
  code text not null,
  at timestamptz not null default now(),
  ip_hash text not null default '',
  dev text not null default ''
);
create index if not exists issued_view_code_idx on awd.issued_view(code, at desc);
alter table awd.issued_view enable row level security;
revoke all on awd.issued_view from public, anon, authenticated;

-- 공개 진위 확인: 조회 횟수 + 건별 기록
create or replace function public.award_verify(p_code text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare i awd.issued; m text; d jsonb := '{}'::jsonb; k text; v text; h jsonb; ip text; ua text; dv text;
begin
  update awd.issued set views = views + 1, first_view = coalesce(first_view, now()), last_view = now()
   where code = upper(trim(coalesce(p_code, ''))) returning * into i;
  if not found then return jsonb_build_object('ok', false); end if;
  begin
    h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then h := '{}'::jsonb;
  end;
  ip := split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'cf-connecting-ip', ''), ',', 1);
  ua := lower(coalesce(h ->> 'user-agent', ''));
  dv := case when ua = '' then '기타' when ua ~ 'bot|crawl|spider|preview|facebookexternalhit|slurp' then '봇'
             when ua ~ 'iphone|ipad|ios' then 'iOS' when ua ~ 'android' then 'Android'
             when ua ~ 'windows' then 'Windows' when ua ~ 'macintosh|mac os' then 'macOS' else '기타' end;
  insert into awd.issued_view(code, ip_hash, dev)
    values (i.code, case when trim(ip) = '' then '' else left(encode(digest(trim(ip) || 'awd-view-v1', 'sha256'), 'hex'), 12) end, dv);
  if random() < 0.01 then delete from awd.issued_view where at < now() - interval '1 year'; end if;
  m := awd.mask_txt(i.holder);
  for k, v in select key, value #>> '{}' from jsonb_each(i.data) loop
    d := d || jsonb_build_object(k, case when i.vis ->> k = 'mask' then awd.mask_txt(v) else v end);
  end loop;
  return jsonb_build_object('ok', true, 'serial', i.serial, 'tpl', i.tpl_name, 'holder', m, 'award', i.award, 'issued_at', i.issued_at, 'revoked', i.revoked,
                            'phrase', i.phrase, 'data', d, 'views', i.views, 'flags', i.flags);
end $$;

-- 관리자 발급 대장: 서로 다른 접속지 수(uniq) 추가
create or replace function public.award_issued_list(p_token text, p_q text default '') returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(to_jsonb(i) order by i.issued_at desc), '[]'::jsonb)
            from (select s.*, (select count(distinct v.ip_hash) from awd.issued_view v where v.code = s.code and v.ip_hash <> '') as uniq
                    from awd.issued s
                   where coalesce(p_q, '') = '' or s.code ilike '%' || p_q || '%' or s.serial ilike '%' || p_q || '%' or s.holder ilike '%' || p_q || '%' or s.tpl_name ilike '%' || p_q || '%'
                   order by s.issued_at desc limit 300) i);
end $$;

-- 관리자: 번호별 조회 내역(최근 200건)
create or replace function public.award_issued_views(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
begin
  perform awd.sess(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('at', v.at, 'ip', v.ip_hash, 'dev', v.dev) order by v.at desc), '[]'::jsonb)
            from (select * from awd.issued_view where code = upper(trim(coalesce(p_code, ''))) order by at desc limit 200) v);
end $$;

revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
