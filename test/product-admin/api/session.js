// GET 로그인 상태 · POST 로그인 · DELETE 로그아웃
const { route, getSession, login, logout } = require('../lib/core');

module.exports = route({ GET: getSession, POST: login, DELETE: logout });
