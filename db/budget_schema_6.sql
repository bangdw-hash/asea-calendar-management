-- 부서 예산안 스키마 6/6: 확정안(금액 3단 분리)
-- 선행: budget_schema_1~4.sql (5는 별도 기능이라 순서 무관). 새 쿼리로 실행하십시오. (여러 번 실행해도 안전합니다)
--
-- 금액 3단: 전년 예산(base_amount) → 부서 요구액(amount, 부서가 입력, 기획처가 덮어쓰지 않음) → 확정안(final_amount, 기획처가 조정)
--  * final_amount 가 비어 있으면 확정안 = 요구액으로 봅니다.
--  * 조정할 때는 사유가 필요하며(자동 초안은 규칙 설명이 사유), 변경 전후 값은 bgt.final_hist 에 쌓이고 수정·삭제할 수 없습니다.
--  * 부서 화면에는 최종 확정(finalized) 전까지 확정안이 내려가지 않습니다.
--  * 다음 연도 초기화(bgt_a_init_year)는 확정안이 있으면 그 금액을 새 연도의 기준·요구액으로 복사합니다.

alter table bgt.lines add column if not exists final_amount bigint;
alter table bgt.lines add column if not exists final_reason text not null default '';
alter table bgt.lines add column if not exists final_by text not null default '';
alter table bgt.lines add column if not exists final_at timestamptz;
alter table bgt.lines add column if not exists final_src text not null default '';

create table if not exists bgt.final_hist (
  id bigserial primary key,
  at timestamptz not null default now(),
  year int not null,
  line_id uuid,
  dept text not null default '',
  type text not null default '',
  mok text not null default '',
  name text not null default '',
  requested bigint,
  old_final bigint,
  new_final bigint,
  reason text not null default '',
  src text not null default 'manual',
  actor text not null default ''
);
create index if not exists bgt_final_hist_y on bgt.final_hist (year, id);

create or replace function bgt.final_hist_guard() returns trigger language plpgsql as $$
begin raise exception 'EVENTS_APPEND_ONLY'; end $$;
drop trigger if exists final_hist_guard on bgt.final_hist;
create trigger final_hist_guard before update or delete on bgt.final_hist for each row execute function bgt.final_hist_guard();
drop trigger if exists final_hist_guard_t on bgt.final_hist;
create trigger final_hist_guard_t before truncate on bgt.final_hist for each statement execute function bgt.final_hist_guard();

alter table bgt.final_hist enable row level security;
revoke all on bgt.final_hist from public, anon, authenticated;
revoke all on all sequences in schema bgt from public, anon, authenticated;

-- 연도 묶음: 부서 화면에는 최종 확정 전까지 확정안(final_*)을 내리지 않습니다.
create or replace function bgt.bundle(p_year int, p_dept text)
returns jsonb language sql stable security definer set search_path = bgt, public as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(x) from bgt.settings x where x.year = p_year),
    'open', bgt.is_open(p_year),
    'lines', (select coalesce(jsonb_agg(
                 case when p_dept is null or coalesce((select s.status = 'finalized' from bgt.settings s where s.year = p_year), false)
                      then to_jsonb(l)
                      else to_jsonb(l) - 'final_amount' - 'final_reason' - 'final_by' - 'final_at' - 'final_src' end
                 order by l.type, l.mok, l.sort, l.name), '[]'::jsonb)
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

-- 확정안 저장: p_items = [{id, final(숫자, null이면 확정안 해제=요구액으로), reason}]
-- p_src = manual(사람이 입력, 요구액과 다르면 사유 필수) / auto(자동 초안, 규칙 설명이 사유)
create or replace function public.bgt_a_final_save(p_token text, p_year int, p_items jsonb, p_src text default 'manual')
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare
  it jsonb; l bgt.lines; nf bigint; rs text; n int := 0; miss jsonb := '[]'::jsonb; cur_set text;
  src text := case when p_src = 'auto' then 'auto' else 'manual' end;
begin
  perform bgt.sess(p_token, 'admin');
  select status into cur_set from bgt.settings where year = p_year;
  if cur_set = 'finalized' then raise exception 'FINALIZED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'LINES_REQUIRED'; end if;
  if jsonb_array_length(p_items) > 1000 then raise exception 'TOO_MANY_LINES'; end if;

  for it in select x from jsonb_array_elements(p_items) x loop
    select * into l from bgt.lines where id = nullif(it->>'id', '')::uuid and year = p_year;
    if not found then raise exception 'NOT_FOUND'; end if;
    nf := bgt.num(it->>'final');
    if nf is not null and nf < 0 then raise exception 'AMOUNT_INVALID'; end if;
    rs := btrim(coalesce(it->>'reason', ''));
    if src = 'manual' and nf is not null and nf <> l.amount and rs = '' then
      miss := miss || jsonb_build_array(l.dept || ' ' || l.mok || ' ' || l.name);
    end if;
  end loop;
  if jsonb_array_length(miss) > 0 then return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED', 'lines', miss); end if;

  for it in select x from jsonb_array_elements(p_items) x loop
    select * into l from bgt.lines where id = (it->>'id')::uuid and year = p_year for update;
    nf := bgt.num(it->>'final');
    rs := btrim(coalesce(it->>'reason', ''));
    if nf is not distinct from l.final_amount and (nf is null or rs = l.final_reason) then continue; end if;
    update bgt.lines set final_amount = nf, final_reason = case when nf is null then '' else rs end,
           final_by = '관리자', final_at = now(), final_src = case when nf is null then '' else src end
     where id = l.id;
    insert into bgt.final_hist(year, line_id, dept, type, mok, name, requested, old_final, new_final, reason, src, actor)
    values (p_year, l.id, l.dept, l.type, l.mok, l.name, l.amount, l.final_amount, nf, rs, src, '관리자');
    n := n + 1;
  end loop;
  perform bgt.log_add('admin', 'final_save', p_year::text, jsonb_build_object('changed', n, 'src', src));
  return jsonb_build_object('ok', true, 'changed', n);
end $$;

create or replace function public.bgt_a_final_hist(p_token text, p_year int, p_limit int default 300)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
begin
  perform bgt.sess(p_token, 'admin');
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb)
            from (select * from bgt.final_hist where year = p_year order by id desc limit least(coalesce(p_limit, 300), 2000)) x);
end $$;

-- 다음 연도 초기화: 확정안이 있으면 확정안을, 없으면 요구액을 새 연도의 기준·요구액으로 복사
create or replace function public.bgt_a_init_year(p_token text, p_year int, p_base_year int)
returns jsonb language plpgsql security definer set search_path = bgt, extensions, public as $$
declare n int := 0;
begin
  perform bgt.sess(p_token, 'admin');
  if exists (select 1 from bgt.lines where year = p_year) then raise exception 'ALREADY_INIT'; end if;
  insert into bgt.settings(year, base_year) values (p_year, p_base_year) on conflict (year) do nothing;
  insert into bgt.lines(year, dept, type, mok, name, base_calc, base_amount, calc, amount, sort, updated_by)
  select p_year, dept, type, mok, name, calc, coalesce(final_amount, amount), calc, coalesce(final_amount, amount), sort, 'admin'
    from bgt.lines where year = p_base_year;
  get diagnostics n = row_count;
  insert into bgt.submissions(year, dept, type)
  select p_year, d.dept, t.type from bgt.depts d cross join (values ('세입'), ('세출')) as t(type) where d.active
  on conflict do nothing;
  perform bgt.log_add('admin', 'init_year', p_year::text, jsonb_build_object('from', p_base_year, 'lines', n));
  return jsonb_build_object('ok', true, 'lines', n);
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
