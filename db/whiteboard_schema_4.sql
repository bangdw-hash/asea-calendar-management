-- ============================================================================
-- 실시간 수업 노트 스키마 4 — 학생 도움 요청(이름 등록·질문/오류/막힘·사진·대화·상태 보드)
--  * db/whiteboard_schema.sql ~ _3 실행 후 실행합니다. 여러 번 실행해도 안전합니다.
--  * 학생 이름·내용은 「기록 지우기」(wb_req_purge)로 교수자가 직접 지울 때까지 보관됩니다(삭제 대신 비움·숨김 처리).
--  * 사진은 공개 버킷 wb-files/req/ 에 올라가며, 기록을 지워도 파일 자체는 남습니다(주소를 알 수 없게 됨).
-- ============================================================================

create table if not exists wbd.req (
  id text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  code text not null references wbd.room(code) on delete cascade,
  cid text not null,
  name text not null default '',
  kind text not null default 'question' check (kind in ('error','stuck','question')),
  status text not null default 'wait' check (status in ('wait','doing','done')),
  mat text,
  page int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists req_code_idx on wbd.req(code, updated_at desc);

create table if not exists wbd.msg (
  id bigserial primary key,
  req text not null references wbd.req(id) on delete cascade,
  code text not null,
  r text not null check (r in ('s','t')),      -- s 학생 · t 교수자
  body text not null default '',
  img text,
  isc boolean not null default false,          -- 코드·프롬프트 모양 유지
  created_at timestamptz not null default now()
);
create index if not exists msg_req_idx on wbd.msg(req, id);

create or replace function wbd.thr_json(p_req text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select jsonb_build_object('id', q.id, 'cid', q.cid, 'name', q.name, 'kind', q.kind, 'status', q.status, 'mat', q.mat, 'page', q.page,
    'created', (extract(epoch from q.created_at) * 1000)::bigint, 'upd', (extract(epoch from q.updated_at) * 1000)::bigint,
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'r', m.r, 'b', m.body, 'i', m.img, 'c', m.isc, 't', (extract(epoch from m.created_at) * 1000)::bigint) order by m.id)
                        from wbd.msg m where m.req = q.id), '[]'::jsonb))
  from wbd.req q where q.id = p_req;
$$;

create or replace function public.wb_req_send(p_code text, p_cid text, p_name text, p_kind text, p_body text, p_img text, p_isc boolean, p_mat text, p_page int, p_req text default null) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare q wbd.req; rid text; nm text := left(trim(coalesce(p_name, '')), 20); bd text := left(coalesce(p_body, ''), 4000);
begin
  if not exists (select 1 from wbd.room where code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if length(coalesce(p_cid, '')) not between 6 and 40 or nm = '' then raise exception 'BAD_INPUT'; end if;
  if bd = '' and coalesce(p_img, '') = '' then raise exception 'BAD_INPUT'; end if;
  if coalesce(p_img, '') <> '' and p_img not like 'https://zbpeyklwpotjyveipzxd.supabase.co/storage/v1/object/public/wb-files/req/%' then raise exception 'BAD_URL'; end if;
  if (select count(*) from wbd.msg m join wbd.req r on r.id = m.req where r.code = p_code and r.cid = p_cid and m.r = 's' and m.created_at > now() - interval '1 minute') >= 12 then raise exception 'RATE_LIMIT'; end if;
  if (select count(*) from wbd.msg where code = p_code) >= 5000 then raise exception 'ROOM_FULL'; end if;
  if p_req is null then
    insert into wbd.req(code, cid, name, kind, mat, page)
      values (p_code, p_cid, nm, case when p_kind in ('error', 'stuck', 'question') then p_kind else 'question' end, left(p_mat, 40), greatest(coalesce(p_page, 0), 0))
      returning id into rid;
  else
    select * into q from wbd.req where id = p_req and code = p_code and cid = p_cid;
    if not found then raise exception 'ROOM_NOT_FOUND'; end if;
    rid := q.id;
  end if;
  insert into wbd.msg(req, code, r, body, img, isc) values (rid, p_code, 's', bd, nullif(p_img, ''), coalesce(p_isc, false));
  update wbd.req set updated_at = now(), name = nm, status = case when status = 'done' then 'wait' else status end where id = rid;
  return jsonb_build_object('ok', true, 'req', rid);
end $$;

create or replace function public.wb_req_mine(p_code text, p_cid text) returns jsonb
language plpgsql stable security definer set search_path = wbd, extensions, public as $$
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(wbd.thr_json(id) order by created_at) from wbd.req where code = p_code and cid = p_cid and not hidden), '[]'::jsonb);
end $$;

-- 주의: wbd.sess 가 만료 로그인을 정리(쓰기)하므로 STABLE 로 선언하면 읽기 전용 거래에서 실패합니다.
create or replace function public.wb_req_list(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(wbd.thr_json(id) order by created_at) from (select id, created_at from wbd.req where code = p_code and not hidden order by created_at desc limit 200) x), '[]'::jsonb);
end $$;

create or replace function public.wb_req_reply(p_token text, p_code text, p_req text, p_body text, p_img text, p_isc boolean) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare bd text := left(coalesce(p_body, ''), 4000);
begin
  perform wbd.sess(p_token);
  if not exists (select 1 from wbd.req where id = p_req and code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if bd = '' and coalesce(p_img, '') = '' then raise exception 'BAD_INPUT'; end if;
  if coalesce(p_img, '') <> '' and p_img not like 'https://zbpeyklwpotjyveipzxd.supabase.co/storage/v1/object/public/wb-files/req/%' then raise exception 'BAD_URL'; end if;
  insert into wbd.msg(req, code, r, body, img, isc) values (p_req, p_code, 't', bd, nullif(p_img, ''), coalesce(p_isc, false));
  update wbd.req set updated_at = now(), status = case when status = 'wait' then 'doing' else status end where id = p_req;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wb_req_status(p_token text, p_code text, p_req text, p_status text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  if p_status not in ('wait', 'doing', 'done') then raise exception 'BAD_INPUT'; end if;
  update wbd.req set status = p_status, updated_at = now() where id = p_req and code = p_code;
end $$;

create or replace function public.wb_req_purge(p_token text, p_code text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.msg set body = '', img = null where code = p_code;
  update wbd.req set hidden = true, name = '' where code = p_code;
end $$;

revoke execute on function public.wb_req_send(text, text, text, text, text, text, boolean, text, int, text), public.wb_req_mine(text, text), public.wb_req_list(text, text), public.wb_req_reply(text, text, text, text, text, boolean), public.wb_req_status(text, text, text, text), public.wb_req_purge(text, text) from public;
grant execute on function public.wb_req_send(text, text, text, text, text, text, boolean, text, int, text), public.wb_req_mine(text, text), public.wb_req_list(text, text), public.wb_req_reply(text, text, text, text, text, boolean), public.wb_req_status(text, text, text, text), public.wb_req_purge(text, text) to anon, authenticated;
revoke execute on function wbd.thr_json(text) from public, anon, authenticated;
