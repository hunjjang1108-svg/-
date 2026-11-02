# 상품 관리

Supabase의 가상 상품 DB를 조회 · 검색 · 추가 · 삭제하는 홈페이지. 내 PC에서 실행하거나 Vercel에 배포할 수 있다.

- **조회 · 검색**: 누구나 가능
- **추가 · 삭제**: 관리자 비밀번호(`ADMIN_PASSWORD`)로 로그인해야 가능

## 설정값 (환경변수)

| 변수 | 값 | 용도 |
|---|---|---|
| `SUPABASE_URL` | 프로젝트 URL | 접속 주소 |
| `SUPABASE_ANON_KEY` | `anon` `public` 키 | 조회 |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` `secret` 키 | 추가 · 삭제 |
| `ADMIN_PASSWORD` | 직접 정한 비밀번호 | 추가 · 삭제 로그인 |

Supabase 값은 대시보드 → **Project Settings → API Keys → Legacy API Keys** 탭에 있다.

- service_role 키는 RLS를 무시하고 DB를 마음대로 바꿀 수 있다. 서버(로컬 `server.js` · Vercel 함수)만 쓰고 브라우저로는 보내지 않는다.
- `ADMIN_PASSWORD`가 비어 있으면 로그인이 꺼지고 추가 · 삭제가 잠긴다. 인터넷에 공개되므로 다른 곳에서 쓰지 않는 길고 새로운 비밀번호를 쓴다.
- 로그인은 12시간 유지된다. 비밀번호를 바꾸면 기존 로그인은 모두 풀린다.

## 내 PC에서 실행

1. `.env.local`(없으면 `.env.example`을 복사해서 만듦)에 위 네 값을 넣는다. `.gitignore`에 등록돼 있어 GitHub에 올라가지 않는다.
2. 실행:

```bash
node server.js
```

브라우저에서 http://localhost:3000 접속. 끄려면 터미널에서 `Ctrl+C`.

## Vercel에 배포

1. Vercel → New Project → GitHub 저장소 `hunjjang1108-svg/-` 선택
2. **Root Directory**: `test/product-admin`
3. **Application Preset**: `Other` (Build and Output Settings는 건드리지 않음 — `vercel.json`이 `public/`을 화면으로 지정)
4. **Environment Variables**에 위 네 값을 추가
5. Deploy

배포 뒤 환경변수를 바꾸면 Vercel에서 **Redeploy**해야 적용된다.

## 파일

- `public/index.html` — 화면
- `api/` — Vercel 함수 (`products.js`, `products/[code].js`, `policy.js`, `session.js`)
- `lib/core.js` — 공통 API 로직 · 로그인 (로컬과 Vercel이 함께 사용)
- `server.js` — 로컬 서버(의존성 없음, Node 20.12+). `api/` 함수를 그대로 불러 씀
- 상품 데이터는 코드에 없고 Supabase에서만 읽는다
