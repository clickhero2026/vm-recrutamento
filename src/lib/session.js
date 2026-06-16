'use strict';

// Esqueleto de sessao + token (acesso retomavel do candidato).
// Fase 0: apenas utilitarios. O fluxo real (criar aplicacao -> token -> retomar
// pela tela de identificacao) e ligado na Fase 1.
//
// Decisoes:
// - Token: string opaca e aleatoria, guardada em applications.token. Vai no link
//   enviado por e-mail e tambem num cookie de sessao do candidato.
// - Sem dependencia extra: usamos crypto nativo. Se a sessao crescer, avaliamos
//   express-session na Fase 1 (mantendo uma unica instancia / store em SQLite).

const crypto = require('node:crypto');

const COOKIE_TOKEN = 'vm_token';

// Gera um token de aplicacao retomavel (url-safe).
function gerarToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Le o token da sessao do candidato (cookie). Retorna null se ausente.
function tokenDaRequisicao(req) {
  const cookie = req.headers?.cookie || '';
  const par = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_TOKEN}=`));
  if (!par) return null;
  return decodeURIComponent(par.slice(COOKIE_TOKEN.length + 1)) || null;
}

// Define o cookie de sessao do candidato com o token.
function definirCookieToken(res, token) {
  const partes = [
    `${COOKIE_TOKEN}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 7}`, // 7 dias
  ];
  res.setHeader('Set-Cookie', partes.join('; '));
}

module.exports = {
  COOKIE_TOKEN,
  gerarToken,
  tokenDaRequisicao,
  definirCookieToken,
};
