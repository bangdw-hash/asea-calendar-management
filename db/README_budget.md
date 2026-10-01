# 부서 예산안(budget.html) DB 설치 안내

대상 Supabase 프로젝트: `zbpeyklwpotjyveipzxd` (포럼 등 기존 테이블은 변경하지 않습니다. 새 `bgt` 스키마와 `public.bgt_*` 함수만 추가)

## 설치 순서 (Supabase 대시보드 → SQL Editor)

1. `budget_schema.sql` 전체를 붙여넣어 실행합니다. (테이블 · RLS · RPC 함수 · 실행 권한)
2. `budget_seed_2027.sql` 전체를 붙여넣어 실행합니다. (부서 17개 · 2026 xlsm 코드표 103개 · 2026 예산 항목 326건을 2027 기준으로 이식)
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
