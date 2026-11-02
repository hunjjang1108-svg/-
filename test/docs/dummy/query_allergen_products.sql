-- =============================================================
-- 알레르기 주의 상품 조회 (실습 전용 가상 데이터)
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run
-- 조회만 하므로 여러 번 실행해도 데이터는 바뀌지 않음
--
-- 기준: product_allergens 중 '성분 함유' 또는 '생산 라인 공유'가 있는 상품
--   - '미함유 표기'는 알레르기가 없다는 뜻이라 제외
--   - 알레르기 물질(allergen)이 '미확인'인 행은 제외
--   - 상품의 알레르기 정보(allergen_status)가 '미확인'인 상품은 제외
--   ('미확인' 앞뒤 공백도 무시)
-- =============================================================

-- 1) 상품별 한 줄 요약
select
  p.code                                                              as 상품코드,
  p.name                                                              as 상품명,
  string_agg(a.allergen, ', ') filter (where a.type = '성분 함유')     as 함유_성분,
  string_agg(a.allergen, ', ') filter (where a.type = '생산 라인 공유') as 생산_라인_공유
from public.products p
join public.product_allergens a on a.product_code = p.code
where a.type in ('성분 함유', '생산 라인 공유')
  and trim(a.allergen) <> '미확인'
  and coalesce(trim(p.allergen_status), '') <> '미확인'
group by p.code, p.name
order by p.code;


-- 2) 특정 알레르기 물질로 찾기 — '견과류'를 원하는 물질로 바꿔서 실행
-- select p.code as 상품코드, p.name as 상품명, a.type as 구분
-- from public.products p
-- join public.product_allergens a on a.product_code = p.code
-- where a.allergen = '견과류'
--   and a.type in ('성분 함유', '생산 라인 공유')
--   and coalesce(trim(p.allergen_status), '') <> '미확인'
-- order by p.code;
