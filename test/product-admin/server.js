// 상품 관리 로컬 서버 (의존성 없음, Node 20.12+)
// - 127.0.0.1에서만 접속 가능 (내 PC 전용)
// - 설정은 같은 폴더의 .env.local에서 자동으로 읽음
// - API는 Vercel 배포용 api/ 폴더의 함수를 그대로 사용
// 실행: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '.env.local');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// 주소 → api/ 함수 (Vercel의 파일 기반 경로와 같게 맞춤)
const API_ROUTES = [
  [/^\/api\/products$/, require('./api/products')],
  [/^\/api\/products\/([^/]+)$/, require('./api/products/[code]'), m => ({ code: decodeURIComponent(m[1]) })],
  [/^\/api\/policy$/, require('./api/policy')],
  [/^\/api\/session$/, require('./api/session')],
];

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

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);
  for (const [pattern, handler, params] of API_ROUTES) {
    const m = url.pathname.match(pattern);
    if (m) {
      req.query = params ? params(m) : {};
      return handler(req, res);
    }
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: '없는 API' }));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`상품 관리: http://localhost:${PORT}`);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) console.log('⚠ .env.local에 SUPABASE_URL · SUPABASE_ANON_KEY가 없습니다 (README.md 참고)');
  else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.log('⚠ SUPABASE_SERVICE_ROLE_KEY가 없어 조회만 가능합니다');
  else if (!process.env.ADMIN_PASSWORD) console.log('⚠ ADMIN_PASSWORD가 없어 추가 · 삭제가 잠겨 있습니다');
});
