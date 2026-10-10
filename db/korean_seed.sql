-- 한글 학습: 시윤 프로필만 생성 (korean_schema.sql 적용 후 실행, 여러 번 실행해도 중복 생성되지 않음)
insert into kor.profiles(name, settings)
select '시윤', '{}'::jsonb
where not exists (select 1 from kor.profiles where name = '시윤');
