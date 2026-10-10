# 한글 학습(korean.html) Supabase 설치 안내

프로젝트: `zbpeyklwpotjyveipzxd` — 새 `kor` 스키마와 `public.kor_*` 함수만 추가합니다. 기존 테이블은 변경하지 않습니다.

## 설치 순서 (약 3분)

1. Supabase 대시보드 → 해당 프로젝트 → **SQL Editor** → **New query**
2. `db/korean_schema.sql` 전체를 붙여 넣고 **Run**
2-1. `db/korean_seed.sql`을 실행해 **시윤 프로필만** 생성합니다. (프로필이 하나뿐이면 보호자 메뉴 첫 로그인 때 그 기기에 자동 연결됩니다)
3. 새 쿼리에서 관리자 비밀번호를 등록합니다. (비밀번호는 저장소에 남기지 않습니다)

   ```sql
   update kor.secret
      set admin_hash = extensions.crypt('0405', extensions.gen_salt('bf'))
    where id = 1;
   ```

4. 확인

   ```sql
   select (public.kor_admin_login('0405')) ->> 'ok';   -- true
   ```

5. `korean.html` → 우측 상단 톱니 → 비밀번호 입력 → **프로필 추가**(예: 시윤) → 학습 기록이 서버에 저장됩니다.
   화면 우측 상단 표시가 "서버 저장"으로 바뀌면 정상입니다.

## 동작 원리
- 브라우저(anon 키)는 `public.kor_*` RPC 함수로만 접근하며 `kor` 스키마 테이블은 외부에 노출되지 않습니다.
- 관리자 비밀번호는 bcrypt 해시로 서버에만 저장되고, 5회 실패 시 10분간 잠깁니다.
- 아이 화면은 프로필 UUID로 진도를 저장·조회합니다. 프로필에는 별명만 저장하십시오.
- SQL 적용 전에는 기기 로컬 저장(로컬 모드)으로 동작합니다. 적용 후 프로필을 연결하면 서버 저장으로 전환됩니다.

## 비밀번호 변경
보호자 메뉴 → 비밀번호 변경(숫자 4~8자리), 또는 위 3번 SQL의 `'0405'`를 바꿔 실행합니다.

## 삭제(필요 시)
```sql
drop schema kor cascade;
drop function if exists public.kor_admin_login(text), public.kor_state_get(uuid),
  public.kor_progress_save(uuid, jsonb, jsonb, jsonb), public.kor_session_log(uuid, int, jsonb),
  public.kor_profiles_list(text), public.kor_profile_save(text, uuid, text, jsonb),
  public.kor_profile_delete(text, uuid), public.kor_report(text, uuid), public.kor_pw_change(text, text);
```
