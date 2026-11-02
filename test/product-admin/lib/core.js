// 공통 API 로직 — 로컬 server.js와 Vercel 함수(api/)가 함께 사용
// - 조회는 anon key, 추가 · 삭제는 service role key 사용 (키는 브라우저로 보내지 않음)
// - 추가 · 삭제는 ADMIN_PASSWORD로 로그인해야 가능 (서명된 HttpOnly 쿠키)
const crypto = require('crypto');

const env = name => process.env[name] || '';
const supabaseUrl = () => env('SUPABASE_URL').replace(/\/$/, '');

// 상품 + 하위 정보 전체를 한 번에 가져오는 select
const PRODUCT_SELECT = '*,product_ingredients(*),product_storage(*),product_allergens(*),product_guides(*)';

const COOKIE = 'admin_session';
const SESSION_SECONDS = 12 * 60 * 60; // 로그인 유지 12시간

// 응답 상태 코드를 지정하는 오류
function httpError(status, message) {
  const err = new Error(message);
  err.httpStatus = status;
  return err;
}

// Supabase REST(PostgREST) 호출 — GET은 anon key, 그 외(추가 · 삭제)는 service role key
async function supabase(method, pathAndQuery, body) {
  const key = method === 'GET' ? env('SUPABASE_ANON_KEY') : env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  // JWT 형식(anon · service_role) 키는 Authorization 헤더도 필요
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && (data.message || data.hint)) || `Supabase 오류 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── 설정 확인 ──
function requireRead() {
  if (!supabaseUrl() || !env('SUPABASE_ANON_KEY')) {
    throw httpError(503, '환경변수 SUPABASE_URL과 SUPABASE_ANON_KEY가 필요합니다 (로컬: .env.local / Vercel: Environment Variables)');
  }
}

function requireAdmin(req) {
  requireRead();
  if (!env('SUPABASE_SERVICE_ROLE_KEY')) throw httpError(503, '추가 · 삭제하려면 환경변수 SUPABASE_SERVICE_ROLE_KEY가 필요합니다');
  if (!env('ADMIN_PASSWORD')) throw httpError(503, '환경변수 ADMIN_PASSWORD가 없어 추가 · 삭제가 잠겨 있습니다');
  if (!isLoggedIn(req)) throw httpError(401, '로그인이 필요합니다');
}

// ── 로그인 세션 ──
// 서명 키는 비밀번호 + service role key에서 만듦 → 비밀번호를 바꾸면 기존 로그인은 모두 풀림
const sessionKey = () => crypto.createHash('sha256').update(`${env('ADMIN_PASSWORD')}\0${env('SUPABASE_SERVICE_ROLE_KEY')}`).digest();
const sign = exp => crypto.createHmac('sha256', sessionKey()).update(String(exp)).digest('base64url');

// 길이와 무관하게 일정한 시간에 비교 (타이밍 공격 방지)
function safeEqual(a, b) {
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

function isLoggedIn(req) {
  if (!env('ADMIN_PASSWORD')) return false;
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return safeEqual(sig, sign(exp));
}

function sessionCookie(req, value, maxAge) {
  // Vercel(https)에서는 Secure 추가, 로컬(http://localhost)에서는 생략
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

// ── API 핸들러: ({ req, body, params }) → [상태 코드, 데이터, 추가 헤더] ──
async function listProducts() {
  requireRead();
  return [200, await supabase('GET', `products?select=${PRODUCT_SELECT}&order=code`)];
}

async function getPolicy() {
  requireRead();
  return [200, await supabase('GET', 'shipping_policy?select=*')];
}

// 빈 문자열 → null
const clean = v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null);

// 상품 추가 (기본 정보 + 원재료 · 보관 · 알레르기 · 안내)
async function createProduct({ req, body: b }) {
  requireAdmin(req);
  const p = b.product || {};
  const product = {
    code: clean(p.code), name: clean(p.name), category: clean(p.category), subcategory: clean(p.subcategory),
    origin_region: clean(p.origin_region), origin_area: clean(p.origin_area), volume: clean(p.volume),
    pieces: clean(p.pieces), price: p.price === '' || p.price == null ? null : Number(p.price),
    sale_period: clean(p.sale_period), description: clean(p.description),
  };
  const allergens = (b.allergens || []).filter(a => clean(a.allergen));
  product.allergen_status = allergens.some(a => a.type !== '미함유 표기') ? 'allergens 시트 참조' : clean(p.allergen_status);

  const [created] = await supabase('POST', 'products', product);
  // 하위 정보 저장 실패 시 상품도 지워서 반쪽 데이터가 남지 않게 함
  try {
    const children = [
      ['product_ingredients', (b.ingredients || []).filter(i => clean(i.name)).map(i => ({ name: clean(i.name), note: clean(i.note), origin: clean(i.origin) }))],
      // 구분만 기본값으로 남은 빈 행은 제외
      ['product_storage', (b.storage || []).filter(s => clean(s.condition) && (clean(s.place) || clean(s.duration) || clean(s.note))).map(s => ({
        condition: clean(s.condition), place: clean(s.place), unit: clean(s.unit), note: clean(s.note),
        duration: s.duration === '' || s.duration == null ? null : Number(s.duration) }))],
      ['product_allergens', allergens.map(a => ({ allergen: clean(a.allergen), type: clean(a.type) }))],
      ['product_guides', (b.guides || []).filter(g => clean(g.content)).map(g => ({ area: clean(g.area), level: clean(g.level), content: clean(g.content), reason: clean(g.reason) }))],
    ];
    for (const [table, rows] of children) {
      if (rows.length) await supabase('POST', table, rows.map(r => ({ ...r, product_code: created.code })));
    }
  } catch (e) {
    await supabase('DELETE', `products?code=eq.${encodeURIComponent(created.code)}`).catch(() => {});
    throw e;
  }
  return [201, created];
}

// 상품 삭제 (하위 정보는 DB에서 함께 삭제됨)
async function deleteProduct({ req, params }) {
  requireAdmin(req);
  const deleted = await supabase('DELETE', `products?code=eq.${encodeURIComponent(params.code || '')}`);
  if (!deleted.length) throw httpError(404, '해당 상품이 없습니다');
  return [200, deleted[0]];
}

// 로그인 상태 확인
async function getSession({ req }) {
  return [200, { loggedIn: isLoggedIn(req), canLogin: Boolean(env('ADMIN_PASSWORD')) }];
}

async function login({ req, body }) {
  if (!env('ADMIN_PASSWORD')) throw httpError(503, '환경변수 ADMIN_PASSWORD가 설정되지 않았습니다');
  if (!safeEqual(body.password || '', env('ADMIN_PASSWORD'))) {
    await new Promise(r => setTimeout(r, 1000)); // 비밀번호 대입 속도 늦추기
    throw httpError(401, '비밀번호가 틀렸습니다');
  }
  const exp = Date.now() + SESSION_SECONDS * 1000;
  return [200, { loggedIn: true }, { 'Set-Cookie': sessionCookie(req, `${exp}.${sign(exp)}`, SESSION_SECONDS) }];
}

async function logout({ req }) {
  return [200, { loggedIn: false }, { 'Set-Cookie': sessionCookie(req, '', 0) }];
}

// ── 요청 처리 공통부 ──
function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

function readBody(req) {
  // Vercel은 JSON 본문을 미리 읽어 req.body에 넣어 줌
  if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(httpError(400, '잘못된 JSON')); } });
    req.on('error', reject);
  });
}

// 메서드별 핸들러를 (req, res) 함수로 묶음 — Vercel 함수와 로컬 서버에서 그대로 사용
function route(handlers) {
  return async (req, res) => {
    try {
      const handler = handlers[req.method];
      if (!handler) throw httpError(405, '지원하지 않는 요청입니다');
      const body = req.method === 'POST' ? await readBody(req) : {};
      const [status, data, headers] = await handler({ req, body, params: req.query || {} });
      send(res, status, data, headers);
    } catch (e) {
      const status = e.httpStatus || (e.status && e.status < 500 ? 400 : 500);
      send(res, status, { error: e.message });
    }
  };
}

module.exports = { route, listProducts, getPolicy, createProduct, deleteProduct, getSession, login, logout };
