// GET /api/policy — 배송 정책 조회
const { route, getPolicy } = require('../lib/core');

module.exports = route({ GET: getPolicy });
