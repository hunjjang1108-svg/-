// DELETE /api/products/:code — 상품 삭제(로그인 필요)
const { route, deleteProduct } = require('../../lib/core');

module.exports = route({ DELETE: deleteProduct });
