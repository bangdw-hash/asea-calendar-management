-- ============================================================================
-- 한글 학습(korean.html) 스키마
--  * 테이블/내부 함수는 외부에 노출되지 않는 kor 스키마에 둡니다.
--  * 브라우저(anon 키)는 public.kor_* RPC 함수로만 접근합니다. (SECURITY DEFINER)
--  * 관리자 비밀번호는 이 파일에 넣지 않습니다. 설치 후 아래 명령으로 별도 등록하십시오.
--      update kor.secret set admin_hash = extensions.crypt('<관리자 비밀번호>', extensions.gen_salt('bf')) where id = 1;
--  * 아동 프로필은 별명만 저장하고, 기기에는 프로필 UUID만 보관합니다.
-- ============================================================================

create schema if not exists kor;
revoke all on schema kor from public, anon, authenticated;

create table if not exists kor.secret (
  id int primary key default 1 check (id = 1),
  admin_hash text,
  fail_count int not null default 0,
  locked_until timestamptz
);
insert into kor.secret(id) values (1) on conflict do nothing;

create table if not exists kor.tokens (
  token_hash text primary key,
  expires_at timestamptz not null
);

create table if not exists kor.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists kor.progress (
  profile_id uuid not null references kor.profiles(id) on delete cascade,
  item_key text not null check (char_length(item_key) <= 40),
  tries int not null default 0,
  correct int not null default 0,
  stars int not null default 0,
  last_at timestamptz not null default now(),
  primary key (profile_id, item_key)
);

create table if not exists kor.stickers (
  profile_id uuid not null references kor.profiles(id) on delete cascade,
  sticker text not null check (char_length(sticker) <= 30),
  earned_at timestamptz not null default now(),
  primary key (profile_id, sticker)
);

create table if not exists kor.session_log (
  id bigserial primary key,
  profile_id uuid not null references kor.profiles(id) on delete cascade,
  logged_at timestamptz not null default now(),
  seconds int not null default 0,
  summary jsonb not null default '{}'::jsonb
);

alter table kor.secret enable row level security;
alter table kor.tokens enable row level security;
alter table kor.profiles enable row level security;
alter table kor.progress enable row level security;
alter table kor.stickers enable row level security;
alter table kor.session_log enable row level security;

-- ── 내부: 관리자 토큰 검증 ──────────────────────────────────────────────────
create or replace function kor._chk(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from kor.tokens where expires_at < now();
  if p_token is null or not exists (
    select 1 from kor.tokens
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now()
  ) then
    raise exception 'unauthorized';
  end if;
end $$;
revoke all on function kor._chk(text) from public, anon, authenticated;

-- ── 관리자 로그인 (실패는 예외 대신 결과값으로 반환: 실패 횟수 기록 유지) ─────
create or replace function public.kor_admin_login(p_pw text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s kor.secret%rowtype; tok text;
begin
  select * into s from kor.secret where id = 1 for update;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked', true);
  end if;
  if s.admin_hash is null or extensions.crypt(coalesce(p_pw, ''), s.admin_hash) <> s.admin_hash then
    update kor.secret set
      fail_count = case when fail_count + 1 >= 5 then 0 else fail_count + 1 end,
      locked_until = case when fail_count + 1 >= 5 then now() + interval '10 minutes' else locked_until end
    where id = 1;
    return jsonb_build_object('ok', false, 'locked', s.fail_count + 1 >= 5);
  end if;
  update kor.secret set fail_count = 0, locked_until = null where id = 1;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into kor.tokens(token_hash, expires_at)
    values (encode(extensions.digest(tok, 'sha256'), 'hex'), now() + interval '8 hours');
  return jsonb_build_object('ok', true, 'token', tok);
end $$;

-- ── 아동 화면: 프로필 상태 조회 / 진도 저장 / 학습 시간 기록 ──────────────────
create or replace function public.kor_state_get(p_pid uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'name', p.name, 'settings', p.settings),
    'progress', coalesce((select jsonb_object_agg(g.item_key, jsonb_build_object('tries', g.tries, 'correct', g.correct, 'stars', g.stars, 'last', g.last_at))
                          from kor.progress g where g.profile_id = p.id), '{}'::jsonb),
    'stickers', coalesce((select jsonb_agg(k.sticker order by k.earned_at) from kor.stickers k where k.profile_id = p.id), '[]'::jsonb)
  ) from kor.profiles p where p.id = p_pid;
$$;

create or replace function public.kor_progress_save(p_pid uuid, p_items jsonb, p_stickers jsonb default '[]'::jsonb, p_unlocked jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare it jsonb; st text;
begin
  if not exists (select 1 from kor.profiles where id = p_pid) then raise exception 'no profile'; end if;
  if jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) <= 200 then
    for it in select * from jsonb_array_elements(p_items) loop
      insert into kor.progress(profile_id, item_key, tries, correct, stars)
      values (p_pid, left(it->>'key', 40),
              least(greatest(coalesce((it->>'tries')::int, 0), 0), 100),
              least(greatest(coalesce((it->>'correct')::int, 0), 0), 100),
              least(greatest(coalesce((it->>'stars')::int, 0), 0), 3))
      on conflict (profile_id, item_key) do update set
        tries = kor.progress.tries + excluded.tries,
        correct = kor.progress.correct + excluded.correct,
        stars = greatest(kor.progress.stars, excluded.stars),
        last_at = now();
    end loop;
  end if;
  if jsonb_typeof(p_stickers) = 'array' and jsonb_array_length(p_stickers) <= 50 then
    for st in select jsonb_array_elements_text(p_stickers) loop
      insert into kor.stickers(profile_id, sticker) values (p_pid, left(st, 30)) on conflict do nothing;
    end loop;
  end if;
  if p_unlocked is not null and jsonb_typeof(p_unlocked) = 'array' then
    update kor.profiles set settings = jsonb_set(settings, '{unlocked}', p_unlocked) where id = p_pid;
  end if;
end $$;

create or replace function public.kor_session_log(p_pid uuid, p_seconds int, p_summary jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from kor.profiles where id = p_pid) then return; end if;
  insert into kor.session_log(profile_id, seconds, summary)
  values (p_pid, least(greatest(coalesce(p_seconds, 0), 0), 14400), coalesce(p_summary, '{}'::jsonb));
end $$;

-- ── 관리자 전용 ──────────────────────────────────────────────────────────────
create or replace function public.kor_profiles_list(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform kor._chk(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'settings', settings) order by created_at) from kor.profiles), '[]'::jsonb);
end $$;

create or replace function public.kor_profile_save(p_token text, p_id uuid, p_name text, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r kor.profiles%rowtype;
begin
  perform kor._chk(p_token);
  if p_id is null then
    insert into kor.profiles(name, settings) values (left(trim(p_name), 20), coalesce(p_settings, '{}'::jsonb)) returning * into r;
  else
    update kor.profiles set name = left(trim(p_name), 20), settings = coalesce(p_settings, settings) where id = p_id returning * into r;
  end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'settings', r.settings);
end $$;

create or replace function public.kor_profile_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform kor._chk(p_token);
  delete from kor.profiles where id = p_id;
end $$;

create or replace function public.kor_report(p_token text, p_pid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform kor._chk(p_token);
  return jsonb_build_object(
    'progress', coalesce((select jsonb_agg(jsonb_build_object('key', item_key, 'tries', tries, 'correct', correct, 'stars', stars, 'last', last_at) order by item_key) from kor.progress where profile_id = p_pid), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(x) from (select jsonb_build_object('at', logged_at, 'seconds', seconds, 'summary', summary) x from kor.session_log where profile_id = p_pid order by logged_at desc limit 30) q), '[]'::jsonb),
    'stickers', coalesce((select jsonb_agg(sticker order by earned_at) from kor.stickers where profile_id = p_pid), '[]'::jsonb)
  );
end $$;

create or replace function public.kor_pw_change(p_token text, p_new text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform kor._chk(p_token);
  if p_new is null or char_length(p_new) < 4 or char_length(p_new) > 20 then raise exception 'invalid password'; end if;
  update kor.secret set admin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')) where id = 1;
end $$;

-- ── 실행 권한: 기본 차단 후 필요한 함수만 허용 ──────────────────────────────
revoke all on function public.kor_admin_login(text) from public;
revoke all on function public.kor_state_get(uuid) from public;
revoke all on function public.kor_progress_save(uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.kor_session_log(uuid, int, jsonb) from public;
revoke all on function public.kor_profiles_list(text) from public;
revoke all on function public.kor_profile_save(text, uuid, text, jsonb) from public;
revoke all on function public.kor_profile_delete(text, uuid) from public;
revoke all on function public.kor_report(text, uuid) from public;
revoke all on function public.kor_pw_change(text, text) from public;
grant execute on function public.kor_admin_login(text) to anon, authenticated;
grant execute on function public.kor_state_get(uuid) to anon, authenticated;
grant execute on function public.kor_progress_save(uuid, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.kor_session_log(uuid, int, jsonb) to anon, authenticated;
grant execute on function public.kor_profiles_list(text) to anon, authenticated;
grant execute on function public.kor_profile_save(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.kor_profile_delete(text, uuid) to anon, authenticated;
grant execute on function public.kor_report(text, uuid) to anon, authenticated;
grant execute on function public.kor_pw_change(text, text) to anon, authenticated;
