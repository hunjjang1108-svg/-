-- =============================================================
-- 가상 상품 DB — Supabase(Postgres)용
-- 원본: docs/dummy/products_db.xlsx (← docs/dummy/products/*.md 10건)
-- 생성일: 2026-11-02
--
-- ⚠ 실습 전용 가상 데이터. 실제 서비스용 Supabase 프로젝트에서 실행하지 말 것
--   (CLAUDE.md: docs/dummy/ 내용은 실제 상품 데이터와 섞지 않는다)
--
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--
-- 엑셀 시트 → 테이블
--   products        → products
--   ingredients     → product_ingredients
--   storage         → product_storage   (Supabase Storage와 이름이 헷갈리지 않게 접두사 사용)
--   allergens       → product_allergens
--   guides          → product_guides
--   shipping_policy → shipping_policy
-- =============================================================

begin;

-- 재실행할 때만 아래 주석을 풀 것 (기존 테이블과 데이터가 모두 삭제됨)
-- drop table if exists public.product_guides, public.product_allergens, public.product_storage,
--   public.product_ingredients, public.products, public.shipping_policy cascade;

-- ── 테이블 ──────────────────────────────────────────────────

create table public.products (
  code            text primary key check (code ~ '^P-[0-9]{4}$'),
  name            text not null,
  category        text check (category in ('신선', '가공', '냉동')),  -- 작성자 분류, 확인 필요
  subcategory     text,                                               -- 작성자 분류, 확인 필요
  origin_region   text,                                               -- 시·도
  origin_area     text,                                               -- 지역
  volume          text not null,                                      -- 60g, 2kg 등 표기 그대로
  pieces          text,                                               -- 7~9개 등
  price           integer not null check (price >= 0),                -- 원
  sale_period     text,
  allergen_status text check (allergen_status in ('없음(문서 명시)', 'allergens 시트 참조')),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.product_ingredients (
  id           bigint generated always as identity primary key,
  product_code text not null references public.products (code) on update cascade on delete cascade,
  name         text not null,
  note         text,
  origin       text
);

create table public.product_storage (
  id           bigint generated always as identity primary key,
  product_code text not null references public.products (code) on update cascade on delete cascade,
  condition    text not null check (condition in ('개봉 전', '개봉 후', '수령 후')),
  place        text check (place in ('상온', '실온', '냉장', '냉동', '서늘한 곳')),
  duration     integer check (duration >= 0),
  unit         text check (unit in ('일', '주', '개월')),
  note         text
);

create table public.product_allergens (
  id           bigint generated always as identity primary key,
  product_code text not null references public.products (code) on update cascade on delete cascade,
  allergen     text not null,
  type         text not null check (type in ('성분 함유', '생산 라인 공유', '미함유 표기')),
  unique (product_code, allergen, type)
);

create table public.product_guides (
  id           bigint generated always as identity primary key,
  product_code text not null references public.products (code) on update cascade on delete cascade,
  area         text not null check (area in ('보관', '섭취', '조리', '사용', '품질')),
  level        text not null check (level in ('금지', '주의', '안내')),
  content      text not null,
  reason       text
);

create table public.shipping_policy (
  key   text primary key,
  value text not null,
  unit  text,
  note  text
);

-- 외래키 조회용 인덱스
create index on public.product_ingredients (product_code);
create index on public.product_storage (product_code);
create index on public.product_allergens (product_code);
create index on public.product_guides (product_code);

-- products 수정 시 updated_at 자동 갱신
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ── 보안(RLS): 누구나 읽기만 가능, 쓰기는 대시보드 · service_role로만 ──

alter table public.products            enable row level security;
alter table public.product_ingredients enable row level security;
alter table public.product_storage     enable row level security;
alter table public.product_allergens   enable row level security;
alter table public.product_guides      enable row level security;
alter table public.shipping_policy     enable row level security;

create policy "누구나 읽기" on public.products            for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.product_ingredients for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.product_storage     for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.product_allergens   for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.product_guides      for select to anon, authenticated using (true);
create policy "누구나 읽기" on public.shipping_policy     for select to anon, authenticated using (true);

-- ── 데이터 ──────────────────────────────────────────────────

-- products (10건)
insert into public.products (code, name, category, subcategory, origin_region, origin_area, volume, pieces, price, sale_period, allergen_status, description) values
  ('P-0113', '대구사과칩', '가공', '건조 과자', '대구', '팔공산', '60g', null, 4900, null, 'allergens 시트 참조', '저온 건조, 설탕 · 첨가물 없음'),
  ('P-0127', '팔공산 꿀사과', '신선', '과일', '대구', '팔공산', '2kg', '7~9개', 18000, null, '없음(문서 명시)', '해발 400m 과수원 부사, 당도 14Brix 이상 선별'),
  ('P-0205', '성주 참외', '신선', '과일', '경북', '성주', '1.5kg', '5~6개', 12000, '4~7월', '없음(문서 명시)', '하우스 참외 특품'),
  ('P-0207', '참외청', '가공', '청 · 진액', '경북', '성주', '350ml', null, 9500, null, '없음(문서 명시)', '참외와 비정제 원당을 1:1로 재움'),
  ('P-0305', '청도 반건시', '가공', '건조 과일', '경북', '청도', '500g', '10개', 15000, null, '없음(문서 명시)', '20일 자연 건조, 겉은 쫀득 · 속은 촉촉'),
  ('P-0312', '의성 마늘', '신선', '채소', '경북', '의성', '1kg', '약 15통', 11000, null, '없음(문서 명시)', '한지형, 알이 단단하고 매운맛이 강함'),
  ('P-0318', '흑마늘 진액', '가공', '청 · 진액', '경북', '의성', '70ml × 30포', '30포', 24000, null, '없음(문서 명시)', '의성 마늘 15일 숙성 추출액'),
  ('P-0402', '서문시장 납작만두', '냉동', '냉동 간편식', null, null, '500g', '20개', 7900, null, 'allergens 시트 참조', '당면 · 부추 소, 간장 양념 포함'),
  ('P-0410', '달성 토마토', '신선', '채소', '대구', '달성(하빈면)', '1kg', '6~8개', 8500, null, '없음(문서 명시)', '완숙, 산도가 낮아 생식용'),
  ('P-0421', '경산 대추칩', '가공', '건조 과자', '경북', '경산', '50g', null, 5500, null, 'allergens 시트 참조', '씨 뺀 대추를 말린 칩');

-- product_ingredients (15건)
insert into public.product_ingredients (product_code, name, note, origin) values
  ('P-0113', '사과', '100%', '대구 팔공산'),
  ('P-0127', '사과(부사)', null, '대구 팔공산'),
  ('P-0205', '참외', null, '경북 성주'),
  ('P-0207', '참외', '원당과 1:1', '경북 성주'),
  ('P-0207', '비정제 원당', '참외와 1:1', '국내산'),
  ('P-0305', '감', null, '경북 청도'),
  ('P-0312', '마늘(한지형)', null, '경북 의성'),
  ('P-0318', '흑마늘', null, '경북 의성'),
  ('P-0318', '정제수', null, null),
  ('P-0402', '밀가루', '밀 함유', null),
  ('P-0402', '당면', null, null),
  ('P-0402', '부추', null, null),
  ('P-0402', '대두(간장)', null, null),
  ('P-0410', '토마토', null, '대구 달성'),
  ('P-0421', '대추', '100%', '경북 경산');

-- product_storage (15건)
insert into public.product_storage (product_code, condition, place, duration, unit, note) values
  ('P-0113', '개봉 전', null, 6, '개월', '유통기한'),
  ('P-0113', '개봉 후', '서늘한 곳', 7, '일', '밀봉, 이 기간 안에 섭취'),
  ('P-0127', '수령 후', '냉장', 3, '주', null),
  ('P-0127', '수령 후', '상온', 7, '일', null),
  ('P-0205', '수령 후', '냉장', 5, '일', '받은 날부터 3일 안 섭취 권장'),
  ('P-0207', '개봉 전', '상온', 12, '개월', null),
  ('P-0207', '개봉 후', '냉장', 30, '일', null),
  ('P-0305', '수령 후', '냉장', 10, '일', '받은 즉시 냉장'),
  ('P-0312', '수령 후', '상온', 2, '개월', '통풍이 잘 되는 그늘, 망에 보관'),
  ('P-0318', '개봉 전', '상온', 18, '개월', '여름철 냉장 권장'),
  ('P-0318', '개봉 후', null, 0, '일', '개봉한 포는 당일 섭취'),
  ('P-0402', '수령 후', '냉동', 3, '개월', null),
  ('P-0410', '수령 후', '실온', 3, '일', null),
  ('P-0410', '수령 후', '냉장', 7, '일', '먹기 30분 전 꺼내면 맛이 돌아옴'),
  ('P-0421', '개봉 후', '상온', 14, '일', '밀봉');

-- product_allergens (6건)
insert into public.product_allergens (product_code, allergen, type) values
  ('P-0113', '견과류', '생산 라인 공유'),
  ('P-0113', '글루텐', '미함유 표기'),
  ('P-0402', '밀', '성분 함유'),
  ('P-0402', '대두', '성분 함유'),
  ('P-0402', '계란', '생산 라인 공유'),
  ('P-0421', '견과류', '생산 라인 공유');

-- product_guides (20건)
insert into public.product_guides (product_code, area, level, content, reason) values
  ('P-0113', '보관', '금지', '개봉 후 냉장 보관 금지', '습기를 먹어 눅눅해짐'),
  ('P-0127', '보관', '주의', '다른 과일과 함께 두지 않기', '에틸렌으로 다른 과일이 빨리 익음'),
  ('P-0127', '품질', '안내', '표면 왁스 코팅 없음', null),
  ('P-0205', '섭취', '주의', '받은 날부터 3일 안에 섭취 권장', '꼭지가 마르면 당도가 떨어짐'),
  ('P-0207', '사용', '금지', '금속 숟가락 사용 금지 — 나무 또는 플라스틱 사용', '발효가 빨라짐'),
  ('P-0207', '섭취', '안내', '탄산수 희석 비율 1:4', null),
  ('P-0305', '보관', '금지', '냉동 보관 금지', '해동하면 수분이 빠져 질겨짐'),
  ('P-0305', '보관', '주의', '받은 즉시 냉장', null),
  ('P-0305', '품질', '안내', '표면의 흰 가루는 당분이 굳은 것으로 정상', null),
  ('P-0312', '보관', '금지', '비닐봉지 밀봉 금지 — 망에 보관', '곰팡이가 생김'),
  ('P-0312', '보관', '주의', '냉장 보관하지 않기', '싹이 남'),
  ('P-0318', '보관', '주의', '여름철에는 냉장 보관 권장', null),
  ('P-0318', '섭취', '안내', '하루 1포 권장', null),
  ('P-0318', '섭취', '주의', '임산부 · 수술 전후는 섭취 전 전문가 상담', null),
  ('P-0402', '조리', '안내', '해동하지 말고 냉동 상태로 팬에 기름 두르고 중불 3분', null),
  ('P-0402', '조리', '금지', '전자레인지 조리 금지', '피가 질겨짐'),
  ('P-0410', '보관', '주의', '꼭지를 아래로 두고 보관', '수분 증발을 줄임'),
  ('P-0410', '섭취', '안내', '냉장 후 먹기 30분 전 꺼내기', '맛이 돌아옴'),
  ('P-0421', '보관', '주의', '실리카겔 버리지 않기', '습기에 약함'),
  ('P-0421', '섭취', '안내', '차로 우려도 됨 — 80℃ 물 300ml에 5조각', null);

-- shipping_policy (6건)
insert into public.shipping_policy (key, value, unit, note) values
  ('당일배송 지역', '수성구 · 달서구', null, null),
  ('당일배송 주문 마감', '14:00', '시각', '오후 2시 이전 주문'),
  ('그 외 지역', '익일 배송', null, null),
  ('무료배송 기준', '30000', '원', '이 금액 이상 주문 시 무료'),
  ('기준 미만 배송비', '2500', '원', null),
  ('신선 식품 발송 요일', '월~목', null, '금요일 주문은 다음 주 월요일 발송');

commit;

-- ── 확인용 예시 쿼리 (필요할 때 따로 실행) ─────────────────────
-- 테이블별 건수
-- select 'products' t, count(*) from public.products
-- union all select 'product_ingredients', count(*) from public.product_ingredients
-- union all select 'product_storage', count(*) from public.product_storage
-- union all select 'product_allergens', count(*) from public.product_allergens
-- union all select 'product_guides', count(*) from public.product_guides
-- union all select 'shipping_policy', count(*) from public.shipping_policy;
--
-- 견과류 주의 상품
-- select p.code, p.name, a.type from public.products p
--   join public.product_allergens a on a.product_code = p.code
--  where a.allergen = '견과류';
--
-- 상품별 금지 사항 (함정 질문 근거)
-- select p.name, g.area, g.content, g.reason from public.product_guides g
--   join public.products p on p.code = g.product_code
--  where g.level = '금지' order by p.code;
