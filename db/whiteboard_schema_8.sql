-- ============================================================================
-- 실시간 수업 노트 스키마 8 — 도움 요청 대화 파일 첨부(비공개 저장 · html 계열 외 모든 형식 · 1개 20MB)
--  * db/whiteboard_schema_4~7 실행 후 실행합니다. 여러 번 실행해도 안전합니다.
--  * 파일은 비공개 버킷 wb-hw 의 chat/ 아래에 저장되고, 올리기·받기 주소는 Edge Function wb-hw 가 발급합니다.
--  * 교수자 「기록 지우기」 때 Edge Function 이 저장소 파일도 함께 지웁니다(cpurge).
-- ============================================================================
alter table wbd.msg add column if not exists fpath text not null default '';
alter table wbd.msg add column if not exists fname text not null default '';
alter table wbd.msg add column if not exists fsize bigint not null default 0;

create or replace function wbd.thr_json(p_req text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select jsonb_build_object('id', q.id, 'cid', q.cid, 'name', q.name, 'kind', q.kind, 'status', q.status, 'mat', q.mat, 'page', q.page, 'sr', q.sr, 'tr', q.tr,
    'created', (extract(epoch from q.created_at) * 1000)::bigint, 'upd', (extract(epoch from q.updated_at) * 1000)::bigint,
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'r', m.r, 'b', m.body, 'i', m.img, 'c', m.isc, 'x', m.rx,
                          'f', case when m.fpath <> '' then jsonb_build_object('n', m.fname, 's', m.fsize) else null end,
                          't', (extract(epoch from m.created_at) * 1000)::bigint) order by m.id)
                        from wbd.msg m where m.req = q.id), '[]'::jsonb))
  from wbd.req q where q.id = p_req;
$$;

create or replace function wbd.chat_ok(p_code text, p_pre text, p_fname text, p_path text, p_size bigint) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  if coalesce(p_fname, '') = '' or coalesce(p_size, 0) < 1 or p_size > 20971520 then raise exception 'BAD_INPUT'; end if;
  if wbd.hw_ext(p_fname) in ('html','htm','xhtml','shtml','mht','mhtml') or wbd.hw_ext(p_path) in ('html','htm','xhtml','shtml','mht','mhtml') then raise exception 'BAD_TYPE'; end if;
  if p_path not like 'chat/' || p_code || '/' || p_pre || '-%' then raise exception 'BAD_PATH'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'wb-hw' and name = p_path) then raise exception 'NO_FILE'; end if;
  if exists (select 1 from wbd.msg where fpath = p_path) then raise exception 'BAD_PATH'; end if;
end $$;

create or replace function public.wb_chat_prepare(p_code text, p_cid text, p_fname text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare e text := wbd.hw_ext(p_fname);
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 then raise exception 'BAD_INPUT'; end if;
  if not exists (select 1 from wbd.room where code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if coalesce(p_size, 0) < 1 or p_size > 20971520 then raise exception 'TOO_BIG'; end if;
  if e in ('html','htm','xhtml','shtml','mht','mhtml') then raise exception 'BAD_TYPE'; end if;
  if (select count(*) from wbd.msg m join wbd.req r on r.id = m.req where r.code = p_code and r.cid = p_cid and m.fpath <> '' and m.created_at > now() - interval '1 minute') >= 6 then raise exception 'RATE_LIMIT'; end if;
  return jsonb_build_object('path', 'chat/' || p_code || '/' || substr(p_cid, 1, 12) || '-' || encode(extensions.gen_random_bytes(5), 'hex') || '.' || e);
end $$;

create or replace function public.wb_chat_tprepare(p_token text, p_code text, p_fname text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare e text := wbd.hw_ext(p_fname);
begin
  perform wbd.sess(p_token);
  if not exists (select 1 from wbd.room where code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if coalesce(p_size, 0) < 1 or p_size > 20971520 then raise exception 'TOO_BIG'; end if;
  if e in ('html','htm','xhtml','shtml','mht','mhtml') then raise exception 'BAD_TYPE'; end if;
  return jsonb_build_object('path', 'chat/' || p_code || '/t-' || encode(extensions.gen_random_bytes(5), 'hex') || '.' || e);
end $$;

create or replace function public.wb_req_sendf(p_code text, p_cid text, p_name text, p_kind text, p_body text, p_img text, p_isc boolean, p_mat text, p_page int, p_req text, p_fpath text, p_fname text, p_fsize bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare res jsonb; rid text; fn text := left(regexp_replace(coalesce(p_fname, ''), '[\\/:*?"<>|\r\n]', '_', 'g'), 150); blank boolean := coalesce(p_body, '') = '' and coalesce(p_img, '') = '';
begin
  if coalesce(p_fpath, '') = '' then
    return public.wb_req_send(p_code, p_cid, p_name, p_kind, p_body, p_img, p_isc, p_mat, p_page, p_req);
  end if;
  perform wbd.chat_ok(p_code, substr(coalesce(p_cid, ''), 1, 12), fn, p_fpath, p_fsize);
  res := public.wb_req_send(p_code, p_cid, p_name, p_kind, case when blank then ' ' else p_body end, p_img, p_isc, p_mat, p_page, p_req);
  rid := res->>'req';
  update wbd.msg set fpath = p_fpath, fname = fn, fsize = p_fsize, body = case when blank then '' else body end
    where id = (select max(m.id) from wbd.msg m where m.req = rid and m.r = 's');
  return res;
end $$;

create or replace function public.wb_req_replyf(p_token text, p_code text, p_req text, p_body text, p_img text, p_isc boolean, p_fpath text, p_fname text, p_fsize bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare fn text := left(regexp_replace(coalesce(p_fname, ''), '[\\/:*?"<>|\r\n]', '_', 'g'), 150); blank boolean := coalesce(p_body, '') = '' and coalesce(p_img, '') = '';
begin
  if coalesce(p_fpath, '') = '' then
    return public.wb_req_reply(p_token, p_code, p_req, p_body, p_img, p_isc);
  end if;
  perform wbd.sess(p_token);
  perform wbd.chat_ok(p_code, 't', fn, p_fpath, p_fsize);
  perform public.wb_req_reply(p_token, p_code, p_req, case when blank then ' ' else p_body end, p_img, p_isc);
  update wbd.msg set fpath = p_fpath, fname = fn, fsize = p_fsize, body = case when blank then '' else body end
    where id = (select max(m.id) from wbd.msg m where m.req = p_req and m.r = 't');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wb_chat_file(p_code text, p_cid text, p_req text, p_msg bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare o jsonb;
begin
  select jsonb_build_object('path', m.fpath, 'fname', m.fname, 'r', m.r) into o from wbd.msg m join wbd.req q on q.id = m.req
    where m.id = p_msg and m.req = p_req and q.code = p_code and q.cid = p_cid and m.fpath <> '';
  if o is null then raise exception 'NO_FILE'; end if;
  return o;
end $$;

create or replace function public.wb_chat_tfile(p_token text, p_code text, p_req text, p_msg bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare o jsonb;
begin
  perform wbd.sess(p_token);
  select jsonb_build_object('path', m.fpath, 'fname', m.fname, 'r', m.r) into o from wbd.msg m
    where m.id = p_msg and m.req = p_req and m.code = p_code and m.fpath <> '';
  if o is null then raise exception 'NO_FILE'; end if;
  return o;
end $$;

create or replace function public.wb_chat_paths(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(fpath) from wbd.msg where code = p_code and fpath <> ''), '[]'::jsonb);
end $$;

create or replace function public.wb_chat_clear(p_token text, p_code text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.msg set fpath = '', fname = '', fsize = 0 where code = p_code and fpath <> '';
end $$;

revoke execute on function public.wb_chat_prepare(text, text, text, bigint), public.wb_chat_tprepare(text, text, text, bigint), public.wb_req_sendf(text, text, text, text, text, text, boolean, text, int, text, text, text, bigint),
  public.wb_req_replyf(text, text, text, text, text, boolean, text, text, bigint), public.wb_chat_file(text, text, text, bigint), public.wb_chat_tfile(text, text, text, bigint),
  public.wb_chat_paths(text, text), public.wb_chat_clear(text, text) from public;
grant execute on function public.wb_chat_prepare(text, text, text, bigint), public.wb_chat_tprepare(text, text, text, bigint), public.wb_req_sendf(text, text, text, text, text, text, boolean, text, int, text, text, text, bigint),
  public.wb_req_replyf(text, text, text, text, text, boolean, text, text, bigint), public.wb_chat_file(text, text, text, bigint), public.wb_chat_tfile(text, text, text, bigint),
  public.wb_chat_paths(text, text), public.wb_chat_clear(text, text) to anon, authenticated;
revoke execute on function wbd.chat_ok(text, text, text, text, bigint) from public, anon, authenticated;
