-- ============================================================================
-- 교내 설문 스키마 8/8: 양식 라이브러리 (양식 + 버전)
--  * 설문 구조(문항·설정·안내문·디자인)만 저장합니다. 응답·과목·인원·추첨 데이터는 저장하지 않습니다.
--  * 양식 1개 = 이름 + 버전 여러 개. 설문을 만들 때 선택한 버전이 설문으로 복사됩니다(이후 서로 연결되지 않음).
--  * 테이블 2개와 함수 7개만 추가합니다. 기존 데이터에는 영향이 없으며, 여러 번 실행해도 안전합니다.
-- ============================================================================

create table if not exists svy.tpl (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'custom',
  descr text not null default '',
  default_ver int not null default 1,
  uses int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists svy.tpl_ver (
  tpl_id uuid not null references svy.tpl(id) on delete cascade,
  ver int not null,
  def jsonb not null,
  theme jsonb not null default '{}'::jsonb,
  note text not null default '',
  saved_at timestamptz not null default now(),
  primary key (tpl_id, ver)
);
alter table svy.tpl enable row level security;
alter table svy.tpl_ver enable row level security;
revoke all on svy.tpl, svy.tpl_ver from public, anon, authenticated;

create or replace function public.svy_tpl_list(p_token text)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category, 'descr', t.descr,
      'default_ver', t.default_ver, 'uses', t.uses, 'updated_at', t.updated_at,
      'versions', (select coalesce(jsonb_agg(jsonb_build_object('ver', v.ver, 'note', v.note, 'saved_at', v.saved_at) order by v.ver desc), '[]'::jsonb) from svy.tpl_ver v where v.tpl_id = t.id))
      order by t.updated_at desc) from svy.tpl t), '[]'::jsonb);
end $$;

create or replace function public.svy_tpl_get(p_token text, p_id uuid, p_ver int default null)
returns jsonb language plpgsql stable security definer set search_path = svy, public as $$
declare t svy.tpl; v svy.tpl_ver;
begin
  perform svy.sess(p_token);
  select * into t from svy.tpl where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v from svy.tpl_ver where tpl_id = p_id and ver = coalesce(p_ver, t.default_ver);
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'id', t.id, 'name', t.name, 'category', t.category, 'descr', t.descr, 'default_ver', t.default_ver,
    'ver', v.ver, 'note', v.note, 'def', v.def, 'theme', v.theme, 'saved_at', v.saved_at);
end $$;

-- 새 양식 만들기(p_id 없음) 또는 기존 양식의 새 버전 저장(p_id 있음)
create or replace function public.svy_tpl_save(p_token text, p_id uuid, p_name text, p_category text, p_descr text, p_def jsonb, p_theme jsonb, p_note text, p_set_default boolean default true)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare t svy.tpl; nv int; v_id uuid := p_id;
begin
  perform svy.sess(p_token);
  if p_def is null or jsonb_typeof(p_def) <> 'object' or pg_column_size(p_def) > 400000 then raise exception 'BAD_DEF'; end if;
  if v_id is null then
    if btrim(coalesce(p_name, '')) = '' then raise exception 'NAME_REQUIRED'; end if;
    insert into svy.tpl(name, category, descr) values (btrim(p_name), coalesce(nullif(btrim(p_category), ''), 'custom'), coalesce(p_descr, '')) returning id into v_id;
    nv := 1;
  else
    select * into t from svy.tpl where id = v_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    select coalesce(max(ver), 0) + 1 into nv from svy.tpl_ver where tpl_id = v_id;
    update svy.tpl set updated_at = now(),
      name = coalesce(nullif(btrim(p_name), ''), name), category = coalesce(nullif(btrim(p_category), ''), category), descr = coalesce(p_descr, descr)
     where id = v_id;
  end if;
  insert into svy.tpl_ver(tpl_id, ver, def, theme, note) values (v_id, nv, p_def, coalesce(p_theme, '{}'::jsonb), left(coalesce(p_note, ''), 200));
  if p_set_default or nv = 1 then update svy.tpl set default_ver = nv where id = v_id; end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'ver', nv);
end $$;

create or replace function public.svy_tpl_update(p_token text, p_id uuid, p_name text, p_category text, p_descr text, p_default_ver int)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  if p_default_ver is not null and not exists (select 1 from svy.tpl_ver where tpl_id = p_id and ver = p_default_ver) then raise exception 'NOT_FOUND'; end if;
  update svy.tpl set name = coalesce(nullif(btrim(p_name), ''), name), category = coalesce(nullif(btrim(p_category), ''), category), descr = coalesce(p_descr, descr),
    default_ver = coalesce(p_default_ver, default_ver), updated_at = now() where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_tpl_delete_ver(p_token text, p_id uuid, p_ver int)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
declare t svy.tpl; n int;
begin
  perform svy.sess(p_token);
  select * into t from svy.tpl where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select count(*) into n from svy.tpl_ver where tpl_id = p_id;
  if n <= 1 then raise exception 'LAST_VERSION'; end if;
  delete from svy.tpl_ver where tpl_id = p_id and ver = p_ver;
  if t.default_ver = p_ver then update svy.tpl set default_ver = (select max(ver) from svy.tpl_ver where tpl_id = p_id), updated_at = now() where id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_tpl_delete(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  delete from svy.tpl where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.svy_tpl_use(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = svy, public as $$
begin
  perform svy.sess(p_token);
  update svy.tpl set uses = uses + 1 where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.svy_tpl_list(text), public.svy_tpl_get(text, uuid, int), public.svy_tpl_save(text, uuid, text, text, text, jsonb, jsonb, text, boolean),
  public.svy_tpl_update(text, uuid, text, text, text, int), public.svy_tpl_delete_ver(text, uuid, int), public.svy_tpl_delete(text, uuid), public.svy_tpl_use(text, uuid) to anon, authenticated;
