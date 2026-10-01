# 부서 예산안(budget.html) DB 설치 안내

대상 Supabase 프로젝트: `zbpeyklwpotjyveipzxd` (포럼 등 기존 테이블은 변경하지 않습니다. 새 `bgt` 스키마와 `public.bgt_*` 함수만 추가)

## 설치 순서 (Supabase 대시보드 → SQL Editor)

1. 스키마를 **번호 순서대로, 파일마다 새 쿼리로** 실행합니다. (용량이 커서 4개로 나누었으며, 여러 번 실행해도 안전합니다)
   - `budget_schema_1.sql` 테이블 · RLS
   - `budget_schema_2.sql` 내부 함수
   - `budget_schema_3.sql` 공개 RPC (접속 · 부서)
   - `budget_schema_4.sql` 관리자 RPC · 실행 권한
   - 설치 확인: `select count(*) from information_schema.tables where table_schema = 'bgt';` → 10
2. 시드 데이터를 **번호 순서대로, 파일마다 새 쿼리로 한 번씩만** 실행합니다. (용량이 커서 한 번에 붙여넣으면 잘릴 수 있어 6개로 나누었습니다)
   - `budget_seed_2027_1.sql` 부서 17 · 코드 103 · 일정 · 제출 단위 34 → 마지막 조회 결과가 `17 | 103 | 34`
   - `budget_seed_2027_2.sql` ~ `_6.sql` 2026 예산 항목 326건 → 마지막 조회의 `누적_항목수`가 66 → 132 → 198 → 264 → 326
   - 실행 전 점검: 오류가 나면 해당 파일만 다시 실행하되, 항목 파일(2~6)을 두 번 실행했다면 `delete from bgt.lines where updated_by = 'seed';` 후 2~6을 처음부터 다시 실행합니다.
3. 관리자 비밀번호를 등록합니다. 아래 `<관리자 비밀번호>`만 바꿔 실행합니다. 이 값은 저장소에 두지 않습니다.

```sql
update bgt.secret
   set admin_hash = extensions.crypt('<관리자 비밀번호>', extensions.gen_salt('bf'))
 where id = 1;
```

4. `https://bangdw-hash.github.io/asea-calendar-management/budget.html` 에서 「예산관리자 로그인」 → 「일정·한도·최종반영」 → 「지금 작성 개시」.

## 보안 구조

- 모든 테이블은 `bgt` 스키마(API 비노출) + RLS 활성 + `anon`/`authenticated` 권한 회수. 브라우저(anon 키)는 직접 접근할 수 없습니다.
- 브라우저는 `public.bgt_*` RPC(SECURITY DEFINER)만 호출하며, 부서/관리자 로그인 후 발급된 12시간 토큰(해시로 저장)을 서버가 검증합니다.
- 부서 비밀번호는 bcrypt 해시(검증용)와 서버 키 암호화본(관리자 조회용)으로 저장합니다. 암호화 키는 `bgt.secret`에만 있고 API로 노출되지 않습니다.
- 로그인 5회 실패 시 부서 10분 / 관리자 15분 잠금. 조회·초기화·변경은 `bgt.log`에 기록됩니다.

## 재설치/초기화

개발 중 데이터를 비우려면 `drop schema bgt cascade;` 후 `public.bgt_*` 함수를 삭제하고 1~3을 다시 실행합니다. (운영 중에는 실행하지 마십시오.)
