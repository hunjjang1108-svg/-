# 상품 관리 (로컬 전용)

Supabase의 가상 상품 DB를 조회 · 검색 · 추가 · 삭제하는 홈페이지. 내 PC(127.0.0.1)에서만 접속된다.

## 처음 한 번: 설정

`.env.local`(없으면 `.env.example`을 복사해서 만듦)에 아래 세 값을 넣는다. 모두 Supabase 대시보드 → **Project Settings → API Keys → Legacy API Keys** 탭에 있다.

| 변수 | 값 | 용도 |
|---|---|---|
| `SUPABASE_URL` | 프로젝트 URL | 접속 주소 |
| `SUPABASE_ANON_KEY` | `anon` `public` 키 | 조회 |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` `secret` 키 | 추가 · 삭제 |

service_role 키는 RLS를 무시하고 DB를 마음대로 바꿀 수 있는 키다. `.env.local`은 공유하거나 업로드하지 않는다(`.gitignore`에 등록됨). 키는 브라우저로 보내지 않고 `server.js`만 사용한다. service_role 키가 비어 있으면 조회만 된다.

Session pooler 같은 DB 직접 접속 문자열은 쓰지 않는다(Supabase REST API만 사용).

## 실행

```bash
node server.js
```

`.env.local`은 자동으로 읽는다. 브라우저에서 http://localhost:3000 접속. 끄려면 터미널에서 `Ctrl+C`.

## 기능

- **조회**: 행을 누르면 오른쪽에 원재료 · 보관 · 알레르기 · 안내사항 상세
- **검색**: 상품명 · 코드 · 원재료 · 특징 · 알레르기 물질
- **필터**: 분류(신선/가공/냉동), 금지 · 주의 사항 있는 상품, 알레르기 제외(칩 클릭)
- **추가**: 기본 정보 + 원재료 · 보관 · 알레르기 · 안내사항 행
- **삭제**: 확인 후 삭제. 하위 정보도 함께 삭제되며 되돌릴 수 없음

## 파일

- `server.js` — 로컬 서버(의존성 없음, Node 20.12+). Supabase REST 호출을 대신 수행
- `public/index.html` — 화면
- 상품 데이터는 코드에 없고 Supabase에서만 읽는다
