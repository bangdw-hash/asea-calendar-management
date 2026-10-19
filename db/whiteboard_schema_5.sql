-- ============================================================================
-- 실시간 수업 노트 스키마 5 — 실습 단계 체크 · 즉석 투표/퀴즈 · 결과 제출 갤러리(우수사례 공유)
--  * db/whiteboard_schema.sql ~ _4 실행 후 실행합니다. 여러 번 실행해도 안전합니다.
--  * 수업방(wbd.room)에 steps(실습 단계)·poll(진행 중 투표)·share(학생 화면에 공유 중인 우수사례)를 둡니다.
-- ============================================================================

alter table wbd.room add column if not exists steps jsonb not null default '{"items":[],"cur":-1}'::jsonb;
alter table wbd.room add column if not exists poll jsonb;
alter table wbd.room add column if not exists share jsonb;

create table if not exists wbd.prog (
  code text not null references wbd.room(code) on delete cascade,
  cid text not null, step text not null, name text not null default '',
  done boolean not null default true, updated_at timestamptz not null default now(),
  primary key (code, cid, step)
);
create table if not exists wbd.vote (
  code text not null references wbd.room(code) on delete cascade,
  pid text not null, cid text not null, name text not null default '',
  choice int not null, updated_at timestamptz not null default now(),
  primary key (code, pid, cid)
);
create table if not exists wbd.sub (
  id text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  code text not null references wbd.room(code) on delete cascade,
  cid text not null, name text not null default '', title text not null default '', body text not null default '',
  img text, isc boolean not null default false, star boolean not null default false, hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sub_code_idx on wbd.sub(code, created_at desc);

-- 수업방 조회·설정에 steps/poll/share 추가 (기존 항목은 그대로)
create or replace function public.wb_room_open(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare r wbd.room; m wbd.mat;
begin
  perform wbd.sess(p_token);
  select * into r from wbd.room where code = p_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into m from wbd.mat where id = r.cur_mat and not hidden;
  return jsonb_build_object('ok', true, 'tk', r.tk, 'ver', r.ver, 'code', r.code, 'title', r.title,
    'cur_mat', r.cur_mat, 'dl', r.dl, 'mats', wbd.mats_json(r.code), 'steps', r.steps, 'poll', r.poll, 'share', r.share,
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
    'cur_mat', r.cur_mat, 'dl', r.dl, 'mats', wbd.mats_json(r.code), 'steps', r.steps, 'poll', r.poll, 'share', r.share,
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
  if length(p_patch::text) > 400000 then raise exception 'BAD_INPUT'; end if;
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
    steps    = case when p_patch ? 'steps' and jsonb_typeof(p_patch->'steps') = 'object' then p_patch->'steps' else steps end,
    poll     = case when p_patch ? 'poll'     then (case when jsonb_typeof(p_patch->'poll') = 'object' then p_patch->'poll' else null end) else poll end,
    share    = case when p_patch ? 'share'    then (case when jsonb_typeof(p_patch->'share') = 'object' then p_patch->'share' else null end) else share end,
    ver = ver + 1, updated_at = now()
   where code = p_code
  returning * into r;
  return jsonb_build_object('ok', true, 'ver', r.ver);
end $$;

-- ───────── 실습 단계 ─────────
create or replace function public.wb_prog_set(p_code text, p_cid text, p_name text, p_step text, p_done boolean) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  if not exists (select 1 from wbd.room where code = p_code and steps->'items' @> jsonb_build_array(jsonb_build_object('id', p_step))) then raise exception 'BAD_INPUT'; end if;
  if length(coalesce(p_cid, '')) not between 6 and 40 then raise exception 'BAD_INPUT'; end if;
  insert into wbd.prog(code, cid, step, name, done) values (p_code, p_cid, p_step, left(coalesce(p_name, ''), 20), coalesce(p_done, true))
  on conflict (code, cid, step) do update set done = excluded.done, name = excluded.name, updated_at = now();
end $$;
create or replace function public.wb_prog_mine(p_code text, p_cid text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select coalesce((select jsonb_agg(step) from wbd.prog where code = p_code and cid = p_cid and done), '[]'::jsonb);
$$;
create or replace function public.wb_prog_get(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('s', step, 'c', cid, 'n', name)) from (select step, cid, name from wbd.prog where code = p_code and done limit 5000) x), '[]'::jsonb);
end $$;

-- ───────── 투표·퀴즈 ─────────
create or replace function wbd.vote_json(p_code text, p_pid text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select jsonb_build_object('total', (select count(*) from wbd.vote where code = p_code and pid = p_pid),
    'counts', (select coalesce(jsonb_agg(coalesce(c.n, 0) order by g), '[]'::jsonb)
                 from generate_series(0, greatest(coalesce(jsonb_array_length((select poll->'opts' from wbd.room where code = p_code)), 1) - 1, 0)) g
                 left join (select choice, count(*) as n from wbd.vote where code = p_code and pid = p_pid group by choice) c on c.choice = g));
$$;
create or replace function public.wb_vote(p_code text, p_cid text, p_name text, p_pid text, p_choice int) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare pl jsonb;
begin
  select poll into pl from wbd.room where code = p_code;
  if pl is null or pl->>'id' <> p_pid or not coalesce((pl->>'open')::boolean, false) then raise exception 'VOTE_CLOSED'; end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(pl->'opts') or length(coalesce(p_cid, '')) not between 6 and 40 then raise exception 'BAD_INPUT'; end if;
  insert into wbd.vote(code, pid, cid, name, choice) values (p_code, p_pid, p_cid, left(coalesce(p_name, ''), 20), p_choice)
  on conflict (code, pid, cid) do update set choice = excluded.choice, name = excluded.name, updated_at = now();
end $$;
create or replace function public.wb_vote_mine(p_code text, p_cid text, p_pid text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select coalesce((select to_jsonb(choice) from wbd.vote where code = p_code and pid = p_pid and cid = p_cid), 'null'::jsonb);
$$;
create or replace function public.wb_vote_get(p_token text, p_code text, p_pid text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return wbd.vote_json(p_code, p_pid);
end $$;
create or replace function public.wb_vote_res(p_code text, p_pid text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select case when r.poll is not null and r.poll->>'id' = p_pid and coalesce((r.poll->>'show')::boolean, false)
              then wbd.vote_json(p_code, p_pid) else null end
    from wbd.room r where r.code = p_code;
$$;

-- ───────── 결과 제출 갤러리 ─────────
create or replace function public.wb_sub_send(p_code text, p_cid text, p_name text, p_title text, p_body text, p_img text, p_isc boolean) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
declare nm text := left(trim(coalesce(p_name, '')), 20); bd text := left(coalesce(p_body, ''), 6000); nid text;
begin
  if not exists (select 1 from wbd.room where code = p_code) then raise exception 'ROOM_NOT_FOUND'; end if;
  if length(coalesce(p_cid, '')) not between 6 and 40 or nm = '' then raise exception 'BAD_INPUT'; end if;
  if bd = '' and coalesce(p_img, '') = '' then raise exception 'BAD_INPUT'; end if;
  if coalesce(p_img, '') <> '' and p_img not like 'https://zbpeyklwpotjyveipzxd.supabase.co/storage/v1/object/public/wb-files/sub/%' then raise exception 'BAD_URL'; end if;
  if (select count(*) from wbd.sub where code = p_code and cid = p_cid and created_at > now() - interval '1 minute') >= 6 then raise exception 'RATE_LIMIT'; end if;
  if (select count(*) from wbd.sub where code = p_code) >= 600 then raise exception 'ROOM_FULL'; end if;
  insert into wbd.sub(code, cid, name, title, body, img, isc) values (p_code, p_cid, nm, left(coalesce(p_title, ''), 60), bd, nullif(p_img, ''), coalesce(p_isc, false)) returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;
create or replace function wbd.sub_json(q wbd.sub) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', q.id, 'cid', q.cid, 'name', q.name, 'title', q.title, 'body', q.body, 'img', q.img, 'c', q.isc, 'star', q.star,
    't', (extract(epoch from q.created_at) * 1000)::bigint);
$$;
create or replace function public.wb_sub_mine(p_code text, p_cid text) returns jsonb
language sql stable security definer set search_path = wbd, extensions, public as $$
  select coalesce((select jsonb_agg(wbd.sub_json(s) order by s.created_at desc) from wbd.sub s where s.code = p_code and s.cid = p_cid and not s.hidden), '[]'::jsonb);
$$;
create or replace function public.wb_sub_list(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  return coalesce((select jsonb_agg(wbd.sub_json(x.s) order by (x.s).created_at desc) from (select s from wbd.sub s where s.code = p_code and not s.hidden order by s.created_at desc limit 200) x), '[]'::jsonb);
end $$;
create or replace function public.wb_sub_patch(p_token text, p_code text, p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.sub set star = case when p_patch ? 'star' then (p_patch->>'star')::boolean else star end,
                     hidden = case when p_patch ? 'hidden' then (p_patch->>'hidden')::boolean else hidden end
   where id = p_id and code = p_code;
end $$;
create or replace function public.wb_sub_purge(p_token text, p_code text) returns void
language plpgsql security definer set search_path = wbd, extensions, public as $$
begin
  perform wbd.sess(p_token);
  update wbd.sub set hidden = true, name = '', title = '', body = '', img = null where code = p_code;
  update wbd.prog set name = '' where code = p_code;
  update wbd.vote set name = '' where code = p_code;
end $$;

revoke execute on function public.wb_prog_set(text, text, text, text, boolean), public.wb_prog_mine(text, text), public.wb_prog_get(text, text),
  public.wb_vote(text, text, text, text, int), public.wb_vote_mine(text, text, text), public.wb_vote_get(text, text, text), public.wb_vote_res(text, text),
  public.wb_sub_send(text, text, text, text, text, text, boolean), public.wb_sub_mine(text, text), public.wb_sub_list(text, text),
  public.wb_sub_patch(text, text, text, jsonb), public.wb_sub_purge(text, text) from public;
grant execute on function public.wb_prog_set(text, text, text, text, boolean), public.wb_prog_mine(text, text), public.wb_prog_get(text, text),
  public.wb_vote(text, text, text, text, int), public.wb_vote_mine(text, text, text), public.wb_vote_get(text, text, text), public.wb_vote_res(text, text),
  public.wb_sub_send(text, text, text, text, text, text, boolean), public.wb_sub_mine(text, text), public.wb_sub_list(text, text),
  public.wb_sub_patch(text, text, text, jsonb), public.wb_sub_purge(text, text) to anon, authenticated;
revoke execute on function wbd.vote_json(text, text), wbd.sub_json(wbd.sub) from public, anon, authenticated;
