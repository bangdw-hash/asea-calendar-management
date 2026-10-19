-- ============================================================================
-- 실시간 수업 노트 스키마 6 — 도움 요청 대화: 읽음 표시 · 공감(하트) 반응
--  * db/whiteboard_schema_4.sql 실행 후 실행합니다. 여러 번 실행해도 안전합니다. (입력 중 표시는 서버 저장 없이 실시간 신호로만 처리)
-- ============================================================================
alter table wbd.req add column if not exists sr bigint not null default 0;   -- 학생이 읽은 마지막 교수자 메시지 id
alter table wbd.req add column if not exists tr bigint not null default 0;   -- 교수자가 읽은 마지막 학생 메시지 id
alter table wbd.msg add column if not exists rx text not null default '';    -- 공감한 쪽: s 학생 · t 교수자 (예: 'st')

create or replace function wbd.thr_json(p_req text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select jsonb_build_object('id', q.id, 'cid', q.cid, 'name', q.name, 'kind', q.kind, 'status', q.status, 'mat', q.mat, 'page', q.page, 'sr', q.sr, 'tr', q.tr,
    'created', (extract(epoch from q.created_at) * 1000)::bigint, 'upd', (extract(epoch from q.updated_at) * 1000)::bigint,
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'r', m.r, 'b', m.body, 'i', m.img, 'c', m.isc, 'x', m.rx, 't', (extract(epoch from m.created_at) * 1000)::bigint) order by m.id)
                        from wbd.msg m where m.req = q.id), '[]'::jsonb))
  from wbd.req q where q.id = p_req;
$$;

create or replace function public.wb_req_read(p_code text, p_cid text, p_req text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  update wbd.req q set sr = greatest(q.sr, coalesce((select max(m.id) from wbd.msg m where m.req = q.id and m.r = 't'), 0))
    where q.id = p_req and q.code = p_code and q.cid = p_cid;
end $$;

create or replace function public.wb_req_tread(p_token text, p_code text, p_req text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.req q set tr = greatest(q.tr, coalesce((select max(m.id) from wbd.msg m where m.req = q.id and m.r = 's'), 0))
    where q.id = p_req and q.code = p_code;
end $$;

create or replace function public.wb_msg_react(p_code text, p_cid text, p_req text, p_msg bigint) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  if not exists (select 1 from wbd.req where id = p_req and code = p_code and cid = p_cid) then raise exception 'ROOM_NOT_FOUND'; end if;
  update wbd.msg set rx = case when position('s' in rx) > 0 then replace(rx, 's', '') else rx || 's' end where id = p_msg and req = p_req and r = 't';
end $$;

create or replace function public.wb_msg_treact(p_token text, p_code text, p_req text, p_msg bigint) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.msg set rx = case when position('t' in rx) > 0 then replace(rx, 't', '') else rx || 't' end where id = p_msg and req = p_req and code = p_code and r = 's';
end $$;

revoke execute on function public.wb_req_read(text, text, text), public.wb_req_tread(text, text, text), public.wb_msg_react(text, text, text, bigint), public.wb_msg_treact(text, text, text, bigint) from public;
grant execute on function public.wb_req_read(text, text, text), public.wb_req_tread(text, text, text), public.wb_msg_react(text, text, text, bigint), public.wb_msg_treact(text, text, text, bigint) to anon, authenticated;
