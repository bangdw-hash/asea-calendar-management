-- ============================================================================
-- 실시간 수업 노트 스키마 3 — 타이머·휴식 (db/whiteboard_schema_2.sql 실행 후)
--  * 남은 시간은 서버(now())가 계산해 학생·교수자 컴퓨터 시계가 달라도 같은 시간이 표시됩니다.
-- ============================================================================
alter table wbd.room add column if not exists timer_end timestamptz;
alter table wbd.room add column if not exists timer_label text not null default '';

create or replace function public.wb_room_open(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room; m wbd.mat;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into m from wbd.mat where id = r.cur_mat and not hidden;
  return jsonb_build_object('ok', true, 'tk', r.tk, 'ver', r.ver, 'code', r.code, 'title', r.title,
    'cur_mat', r.cur_mat, 'dl', r.dl, 'mats', wbd.mats_json(r.code),
    'pdf_url', m.url, 'pdf_name', m.name, 'pages', coalesce(m.pages, 0),
    'timer_left', case when r.timer_end > now() then ceil(extract(epoch from (r.timer_end - now())))::int else 0 end, 'timer_label', r.timer_label,
    'page', r.page, 'page_ts', r.page_ts, 'note', r.note, 'note_ts', r.note_ts, 'links', r.links, 'active', r.active);
end $$;

create or replace function public.wb_room_get(p_code text, p_ver int default null) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room; m wbd.mat;
begin
  select * into r from wbd.room where code = left(coalesce(p_code, ''), 8);
  if not found then return jsonb_build_object('ok', false, 'error', 'ROOM_NOT_FOUND'); end if;
  if p_ver is not null and p_ver = r.ver then
    return jsonb_build_object('ok', true, 'same', true, 'ver', r.ver);
  end if;
  select * into m from wbd.mat where id = r.cur_mat and not hidden;
  return jsonb_build_object('ok', true, 'ver', r.ver, 'code', r.code, 'title', r.title,
    'cur_mat', r.cur_mat, 'dl', r.dl, 'mats', wbd.mats_json(r.code),
    'pdf_url', m.url, 'pdf_name', m.name, 'pages', coalesce(m.pages, 0),
    'timer_left', case when r.timer_end > now() then ceil(extract(epoch from (r.timer_end - now())))::int else 0 end, 'timer_label', r.timer_label,
    'page', r.page, 'page_ts', r.page_ts, 'note', r.note, 'note_ts', r.note_ts, 'links', r.links, 'active', r.active,
    'tk_hash', encode(digest(r.tk, 'sha256'), 'hex'));
end $$;

create or replace function public.wb_room_set(p_token text, p_code text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  update wbd.room set
    title    = case when p_patch ? 'title'    then left(coalesce(nullif(trim(p_patch->>'title'), ''), title), 80) else title end,
    cur_mat  = case when p_patch ? 'cur_mat'  then (select m.id from wbd.mat m where m.id = p_patch->>'cur_mat' and m.code = p_code and m.kind = 'pdf' and not m.hidden) else cur_mat end,
    dl       = case when p_patch ? 'dl'       then (p_patch->>'dl')::boolean else dl end,
    page     = case when p_patch ? 'page'     then greatest((p_patch->>'page')::int, 1) else page end,
    page_ts  = case when p_patch ? 'page_ts'  then (p_patch->>'page_ts')::bigint else page_ts end,
    note     = case when p_patch ? 'note'     then left(coalesce(p_patch->>'note', ''), 200000) else note end,
    note_ts  = case when p_patch ? 'note_ts'  then (p_patch->>'note_ts')::bigint else note_ts end,
    links    = case when p_patch ? 'links' and jsonb_typeof(p_patch->'links') = 'array' then p_patch->'links' else links end,
    active   = case when p_patch ? 'active'   then (p_patch->>'active')::boolean else active end,
    timer_end = case when p_patch ? 'timer_sec' then (case when (p_patch->>'timer_sec')::int > 0 then now() + make_interval(secs => least((p_patch->>'timer_sec')::int, 14400)) else null end) else timer_end end,
    timer_label = case when p_patch ? 'timer_label' then left(coalesce(p_patch->>'timer_label', ''), 20) else timer_label end,
    ver = ver + 1, updated_at = now()
   where code = p_code
  returning * into r;
  return jsonb_build_object('ok', true, 'ver', r.ver);
end $$;
