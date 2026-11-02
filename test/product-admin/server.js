// 상품 관리 로컬 서버 (의존성 없음, Node 20.12+)
// - 127.0.0.1에서만 접속 가능 (내 PC 전용)
// - 설정은 같은 폴더의 .env.local에서 자동으로 읽음
// - 조회는 anon key, 추가 · 삭제는 service role key 사용 (키는 브라우저로 보내지 않음)
// 실행: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '.env.local');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

// 상품 + 하위 정보 전체를 한 번에 가져오는 select
const PRODUCT_SELECT = '*,product_ingredients(*),product_storage(*),product_allergens(*),product_guides(*)';

// Supabase REST(PostgREST) 호출 — GET은 anon key, 그 외(추가 · 삭제)는 service role key
async function supabase(method, pathAndQuery, body) {
  const key = method === 'GET' ? ANON_KEY : SERVICE_ROLE_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  // JWT 형식(anon · service_role) 키는 Authorization 헤더도 필요
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
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

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('잘못된 JSON')); } });
    req.on('error', reject);
  });
}

// 빈 문자열 → null
const clean = v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null);

// ── API ──
async function handleApi(req, res, url) {
  if (!SUPABASE_URL || !ANON_KEY) {
    return send(res, 503, { error: '.env.local에 SUPABASE_URL과 SUPABASE_ANON_KEY가 필요합니다 (README.md 참고)' });
  }
  if (req.method !== 'GET' && !SERVICE_ROLE_KEY) {
    return send(res, 503, { error: '추가 · 삭제하려면 .env.local에 SUPABASE_SERVICE_ROLE_KEY가 필요합니다' });
  }

  // 목록 조회
  if (req.method === 'GET' && url.pathname === '/api/products') {
    return send(res, 200, await supabase('GET', `products?select=${PRODUCT_SELECT}&order=code`));
  }

  // 배송 정책 조회
  if (req.method === 'GET' && url.pathname === '/api/policy') {
    return send(res, 200, await supabase('GET', 'shipping_policy?select=*'));
  }

  // 상품 추가 (기본 정보 + 원재료 · 보관 · 알레르기 · 안내)
  if (req.method === 'POST' && url.pathname === '/api/products') {
    const b = await readBody(req);
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
    return send(res, 201, created);
  }

  // 상품 삭제 (하위 정보는 DB에서 함께 삭제됨)
  const m = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (req.method === 'DELETE' && m) {
    const code = decodeURIComponent(m[1]);
    const deleted = await supabase('DELETE', `products?code=eq.${encodeURIComponent(code)}`);
    if (!deleted.length) return send(res, 404, { error: '해당 상품이 없습니다' });
    return send(res, 200, deleted[0]);
  }

  send(res, 404, { error: '없는 API' });
}

// ── 정적 파일 ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function serveStatic(res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    serveStatic(res, url.pathname);
  } catch (e) {
    send(res, e.status && e.status < 500 ? 400 : 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`상품 관리: http://localhost:${PORT}`);
  if (!SUPABASE_URL || !ANON_KEY) console.log('⚠ .env.local에 SUPABASE_URL · SUPABASE_ANON_KEY가 없습니다 (README.md 참고)');
  else if (!SERVICE_ROLE_KEY) console.log('⚠ SUPABASE_SERVICE_ROLE_KEY가 없어 조회만 가능합니다');
});
