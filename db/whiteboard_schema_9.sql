-- ============================================================================
-- 실시간 수업 노트 스키마 9 — 과제 제출 복수 파일(최대 5개·학생당 합계 40MB) + 학생 본인 파일 삭제(마감 전, 저장소 파일 즉시 삭제)
--  * db/whiteboard_schema_7 실행 후 실행합니다. 여러 번 실행해도 안전합니다.
--  * 같은 과제에 파일을 계속 추가할 수 있고(교체 아님), 마감 전에는 학생이 파일별로 삭제할 수 있습니다.
-- ============================================================================
create or replace function public.wb_hw_prepare(p_code text, p_cid text, p_hw text, p_fname text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare e text := wbd.hw_ext(p_fname); c int; t bigint;
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 then raise exception 'BAD_INPUT'; end if;
  if not exists (select 1 from wbd.hw where id = p_hw and code = p_code and not hidden and open and (due is null or due > now())) then raise exception 'HW_CLOSED'; end if;
  if coalesce(p_size, 0) < 1 or p_size > 20971520 then raise exception 'TOO_BIG'; end if;
  select count(*), coalesce(sum(size), 0) into c, t from wbd.hwsub where hw = p_hw and cid = p_cid and cur;
  if c >= 5 then raise exception 'TOO_MANY'; end if;
  if t + p_size > 41943040 then raise exception 'TOTAL_BIG'; end if;
  if (select count(*) from wbd.hwsub where code = p_code and cid = p_cid and created_at > now() - interval '1 minute') >= 12 then raise exception 'RATE_LIMIT'; end if;
  return jsonb_build_object('path', p_code || '/' || p_hw || '/' || substr(p_cid, 1, 12) || '-' || encode(extensions.gen_random_bytes(5), 'hex') || '.' || e);
end $$;

create or replace function public.wb_hw_submit(p_code text, p_cid text, p_name text, p_hw text, p_path text, p_fname text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare nm text := left(trim(coalesce(p_name, '')), 20); fn text := left(regexp_replace(coalesce(p_fname, ''), '[\\/:*?"<>|\r\n]', '_', 'g'), 150); c int; t bigint; k int; sid text;
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 or nm = '' or fn = '' then raise exception 'BAD_INPUT'; end if;
  if not exists (select 1 from wbd.hw where id = p_hw and code = p_code and not hidden and open and (due is null or due > now())) then raise exception 'HW_CLOSED'; end if;
  if p_path not like p_code || '/' || p_hw || '/' || substr(p_cid, 1, 12) || '-%' then raise exception 'BAD_PATH'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'wb-hw' and name = p_path) then raise exception 'NO_FILE'; end if;
  if exists (select 1 from wbd.hwsub where path = p_path) then raise exception 'BAD_PATH'; end if;
  select count(*), coalesce(sum(size), 0) into c, t from wbd.hwsub where hw = p_hw and cid = p_cid and cur;
  if c >= 5 then raise exception 'TOO_MANY'; end if;
  if t + greatest(coalesce(p_size, 0), 0) > 41943040 then raise exception 'TOTAL_BIG'; end if;
  select coalesce(max(n), 0) + 1 into k from wbd.hwsub where hw = p_hw and cid = p_cid;
  insert into wbd.hwsub(hw, code, cid, name, path, fname, size, n) values (p_hw, p_code, p_cid, nm, p_path, fn, greatest(coalesce(p_size, 0), 0), k) returning id into sid;
  return jsonb_build_object('ok', true, 'id', sid, 'n', k);
end $$;

create or replace function public.wb_hw_mine(p_code text, p_cid text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  if length(coalesce(p_cid, '')) not between 6 and 40 then return jsonb_build_object('hws', '[]'::jsonb, 'mine', '[]'::jsonb); end if;
  return jsonb_build_object(
    'hws', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'note', h.note, 'open', h.open and (h.due is null or h.due > now()), 'due', (extract(epoch from h.due) * 1000)::bigint) order by h.created_at desc)
      from wbd.hw h where h.code = p_code and not h.hidden), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'hw', s.hw, 'fname', s.fname, 'size', s.size, 'n', s.n, 't', (extract(epoch from s.created_at) * 1000)::bigint) order by s.created_at)
      from wbd.hwsub s where s.code = p_code and s.cid = p_cid and s.cur), '[]'::jsonb));
end $$;

create or replace function public.wb_hw_all(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'note', h.note, 'open', h.open and (h.due is null or h.due > now()), 'due', (extract(epoch from h.due) * 1000)::bigint,
      'created', (extract(epoch from h.created_at) * 1000)::bigint, 'n', (select count(distinct s.cid) from wbd.hwsub s where s.hw = h.id and s.cur)) order by h.created_at desc)
    from wbd.hw h where h.code = p_code and not h.hidden), '[]'::jsonb);
end $$;

create or replace function public.wb_hw_delpath(p_code text, p_cid text, p_id text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare pth text;
begin
  select s.path into pth from wbd.hwsub s join wbd.hw h on h.id = s.hw
    where s.id = p_id and s.code = p_code and s.cid = p_cid and s.cur and s.path <> '' and not h.hidden and h.open and (h.due is null or h.due > now());
  if pth is null then raise exception 'HW_CLOSED'; end if;
  return jsonb_build_object('path', pth);
end $$;

create or replace function public.wb_hw_delrow(p_code text, p_cid text, p_id text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  update wbd.hwsub s set cur = false, name = '', fname = '', path = '' where s.id = p_id and s.code = p_code and s.cid = p_cid and s.cur
    and not exists (select 1 from storage.objects o where o.bucket_id = 'wb-hw' and o.name = s.path);   -- 저장소 파일이 지워진 뒤에만 행을 비움
end $$;

revoke execute on function public.wb_hw_delpath(text, text, text), public.wb_hw_delrow(text, text, text) from public;
grant execute on function public.wb_hw_delpath(text, text, text), public.wb_hw_delrow(text, text, text) to anon, authenticated;
