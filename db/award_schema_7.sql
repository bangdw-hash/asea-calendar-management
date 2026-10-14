-- ============================================================================
-- 상장 출력기 7차: 확인 문구·항목별 공개·조회 기록·위조 의심 신고
--  award_schema.sql, award_schema_2.sql 실행 후 이어서 실행하십시오. 여러 번 실행해도 안전합니다(idempotent).
--  * 발급 대장(awd.issued)에 메일머지 항목 값(data)·항목별 공개 수준(vis)·확인 문구(phrase)를 함께 저장합니다.
--      vis: 'mask' = 가운데 글자 가림, 그 외(미지정) = 그대로 공개. 「숨김」 항목은 클라이언트가 아예 보내지 않습니다.
--  * 공개 확인(award_verify)은 조회 횟수·최초/최근 조회 시각을 기록하고, 확인 문구와 공개 가능한 항목만 반환합니다.
--  * 검증자가 「다릅니다」를 누르면 award_verify_report 가 의심 신고를 기록합니다(관리자 발급 대장에 표시).
-- ============================================================================
alter table awd.issued add column if not exists data jsonb not null default '{}'::jsonb;     -- {항목명: 값} (숨김 항목 제외)
alter table awd.issued add column if not exists vis jsonb not null default '{}'::jsonb;      -- {항목명: 'mask'}
alter table awd.issued add column if not exists phrase text not null default '';             -- 확인 문구 원문(예: {{소속}} {{성명}}님이 …) — 발급 시점 기준으로 보관
alter table awd.issued add column if not exists views int not null default 0;                -- 공개 확인 조회 횟수
alter table awd.issued add column if not exists first_view timestamptz;
alter table awd.issued add column if not exists last_view timestamptz;
alter table awd.issued add column if not exists flags int not null default 0;                -- 「다릅니다」 신고 횟수
alter table awd.issued add column if not exists last_flag timestamptz;

-- 가운데 글자 가리기 (1글자는 그대로, 2글자는 뒤를 가림, 3글자 이상은 가운데를 가림)
create or replace function awd.mask_txt(t text) returns text
language sql immutable as $$
  select case
    when coalesce(char_length(t), 0) <= 1 then coalesce(t, '')
    when char_length(t) = 2 then left(t, 1) || '*'
    else left(t, 1) || repeat('*', char_length(t) - 2) || right(t, 1) end
$$;

-- 발급 등록: 항목 값·공개 수준·확인 문구까지 저장 (기존 항목만 보내도 동작)
create or replace function public.award_issue_register(p_token text, p_items jsonb, p_label text default '') returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare n int := 0; x jsonb;
begin
  perform awd.sess(p_token);
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into awd.issued(code, serial, tpl_name, holder, batch_label, award, data, vis, phrase)
      values (upper(x->>'code'), coalesce(x->>'serial', ''), coalesce(x->>'tpl', ''), coalesce(x->>'holder', ''), coalesce(p_label, ''), coalesce(x->>'award', ''),
              case when jsonb_typeof(x->'data') = 'object' then x->'data' else '{}'::jsonb end,
              case when jsonb_typeof(x->'vis') = 'object' then x->'vis' else '{}'::jsonb end,
              left(coalesce(x->>'phrase', ''), 1000))
      on conflict (code) do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- 공개 진위 확인 (토큰 불필요): 조회 기록 + 확인 문구 + 공개 가능한 항목
create or replace function public.award_verify(p_code text) returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare i awd.issued; m text; n int; d jsonb := '{}'::jsonb; k text; v text;
begin
  update awd.issued set views = views + 1, first_view = coalesce(first_view, now()), last_view = now()
   where code = upper(trim(coalesce(p_code, ''))) returning * into i;
  if not found then return jsonb_build_object('ok', false); end if;
  n := char_length(i.holder);
  m := awd.mask_txt(i.holder);
  for k, v in select key, value #>> '{}' from jsonb_each(i.data) loop
    d := d || jsonb_build_object(k, case when i.vis ->> k = 'mask' then awd.mask_txt(v) else v end);
  end loop;
  return jsonb_build_object('ok', true, 'serial', i.serial, 'tpl', i.tpl_name, 'holder', m, 'award', i.award, 'issued_at', i.issued_at, 'revoked', i.revoked,
                            'phrase', i.phrase, 'data', d, 'views', i.views, 'flags', i.flags);
end $$;

-- 검증자 신고: 인쇄된 상장과 확인 화면의 내용이 다름 (같은 번호는 10초에 한 번만 집계)
create or replace function public.award_verify_report(p_code text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = awd, extensions, public as $$
declare c text := upper(trim(coalesce(p_code, ''))); n int;
begin
  update awd.issued set flags = flags + 1, last_flag = now()
   where code = c and (last_flag is null or last_flag < now() - interval '10 seconds') returning flags into n;
  if n is not null then perform awd.log_add('issue_flag', c, jsonb_build_object('note', left(coalesce(p_note, ''), 200))); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on all functions in schema awd from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'award\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
