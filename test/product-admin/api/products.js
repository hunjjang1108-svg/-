// GET /api/products — 목록 조회 · POST /api/products — 상품 추가(로그인 필요)
const { route, listProducts, createProduct } = require('../lib/core');

module.exports = route({ GET: listProducts, POST: createProduct });
