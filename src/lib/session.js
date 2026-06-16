'use strict';

// Sessao + token de acesso retomavel do candidato.
//
// Como funciona:
// - Ao criar uma application (Fase 1B), geramos um token opaco e aleatorio,
//   guardado em applications.token. Esse token vai num cookie httpOnly ASSINADO
//   "vm_token" (assinatura via cookie-parser + SESSION_SECRET).
// - Em cada requisicao, loadCandidato(req) le o token do cookie, valida contra o
//   banco (camada de dados agnostica) e devolve a application — ou null.
//
// Nenhum dado sensivel fica no cookie: so o token. A validacao real e no banco.

const crypto = require('node:crypto');
const { config } = require('../config');
const db = require('../db');

const COOKIE_TOKEN = 'vm_token';
const MAX_IDADE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Gera um token de application retomavel (url-safe).
function gerarToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Grava o cookie assinado com o token. Requer cookie-parser(SESSION_SECRET) no app.
function setToken(res, token) {
  res.cookie(COOKIE_TOKEN, token, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: config.ehProducao, // HTTPS em producao (EasyPanel com SSL)
    maxAge: MAX_IDADE_MS,
    path: '/',
  });
}

// Le o token do cookie assinado. Retorna null se ausente ou assinatura invalida.
function getToken(req) {
  const token = req.signedCookies && req.signedCookies[COOKIE_TOKEN];
  return token || null;
}

// Remove o cookie de sessao (logout / token invalido).
function limparToken(res) {
  res.clearCookie(COOKIE_TOKEN, { path: '/' });
}

// Valida o token contra o banco e retorna a application ou null.
function loadCandidato(req) {
  const token = getToken(req);
  if (!token) return null;
  const aplicacao = db.obterAplicacaoPorToken(token);
  return aplicacao || null;
}

module.exports = {
  COOKIE_TOKEN,
  gerarToken,
  setToken,
  getToken,
  limparToken,
  loadCandidato,
};
