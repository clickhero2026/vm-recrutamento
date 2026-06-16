'use strict';

// Implementacao concreta da camada de dados usando better-sqlite3.
// TODO o SQL especifico de SQLite vive aqui. As rotas NUNCA importam este arquivo
// diretamente: elas usam src/db/index.js (a interface de negocio agnostica).
//
// Para migrar a Postgres no futuro: crie src/db/postgres.js implementando o mesmo
// conjunto de funcoes exportadas aqui e troque o require em src/db/index.js.

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { config } = require('../config');

let _db = null;

// Conexao singleton (SQLite tem um escritor por vez; mantemos uma instancia).
function getDb() {
  if (_db) return _db;

  // Garante que a pasta do arquivo exista (ex.: ./data ou /data).
  const dir = path.dirname(config.caminhoBanco);
  fs.mkdirSync(dir, { recursive: true });

  _db = new Database(config.caminhoBanco);
  _db.pragma('journal_mode = WAL');   // melhor concorrencia leitura/escrita
  _db.pragma('foreign_keys = ON');
  return _db;
}

// Executa o schema.sql (idempotente). Usado por migrate.js.
function aplicarSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  getDb().exec(sql);
}

// ── Helpers de (de)serializacao de colunas JSON ──
function lerJson(valor, padrao) {
  if (valor == null || valor === '') return padrao;
  try {
    return JSON.parse(valor);
  } catch {
    return padrao;
  }
}

function jobDeLinha(linha) {
  if (!linha) return null;
  return {
    ...linha,
    skills: lerJson(linha.skills, []),
    ativo: Boolean(linha.ativo),
  };
}

function roteiroDeLinha(linha) {
  if (!linha) return null;
  return { ...linha, estrutura: lerJson(linha.estrutura, {}) };
}

function aplicacaoDeLinha(linha) {
  if (!linha) return null;
  return { ...linha, campos_extras: lerJson(linha.campos_extras, {}) };
}

// ──────────────────────────────────────────────────────────────
// Funcoes de negocio (a interface que index.js reexporta)
// ──────────────────────────────────────────────────────────────

// Vagas
function obterVaga(id) {
  const linha = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  return jobDeLinha(linha);
}

function obterVagaPorSlug(slug) {
  const linha = getDb().prepare('SELECT * FROM jobs WHERE slug = ?').get(slug);
  return jobDeLinha(linha);
}

function obterVagaAtiva() {
  const linha = getDb()
    .prepare('SELECT * FROM jobs WHERE ativo = 1 ORDER BY criado_em DESC LIMIT 1')
    .get();
  return jobDeLinha(linha);
}

function listarVagas() {
  return getDb().prepare('SELECT * FROM jobs ORDER BY criado_em DESC').all().map(jobDeLinha);
}

function criarVaga(vaga) {
  const stmt = getDb().prepare(`
    INSERT INTO jobs (slug, titulo, perfil, faixa_pagamento, skills, descricao, sobre_empresa, roteiro_id, ativo)
    VALUES (@slug, @titulo, @perfil, @faixa_pagamento, @skills, @descricao, @sobre_empresa, @roteiro_id, @ativo)
  `);
  const info = stmt.run({
    slug: vaga.slug,
    titulo: vaga.titulo,
    perfil: vaga.perfil,
    faixa_pagamento: vaga.faixa_pagamento || null,
    skills: JSON.stringify(vaga.skills || []),
    descricao: vaga.descricao || null,
    sobre_empresa: vaga.sobre_empresa || null,
    roteiro_id: vaga.roteiro_id || null,
    ativo: vaga.ativo === false ? 0 : 1,
  });
  return Number(info.lastInsertRowid);
}

// Roteiros
function obterRoteiro(id) {
  return roteiroDeLinha(getDb().prepare('SELECT * FROM roteiros WHERE id = ?').get(id));
}

function obterRoteiroPorNome(nome) {
  return roteiroDeLinha(getDb().prepare('SELECT * FROM roteiros WHERE nome = ?').get(nome));
}

function criarRoteiro(roteiro) {
  const info = getDb().prepare(`
    INSERT INTO roteiros (nome, perfil, versao, estrutura)
    VALUES (@nome, @perfil, @versao, @estrutura)
  `).run({
    nome: roteiro.nome,
    perfil: roteiro.perfil,
    versao: roteiro.versao || 1,
    estrutura: JSON.stringify(roteiro.estrutura || {}),
  });
  return Number(info.lastInsertRowid);
}

// Aplicacoes
function criarAplicacao(aplicacao) {
  const info = getDb().prepare(`
    INSERT INTO applications
      (job_id, nome, sobrenome, email, telefone, cidade, linkedin_url,
       curriculo_path, curriculo_texto, campos_extras, token, status)
    VALUES
      (@job_id, @nome, @sobrenome, @email, @telefone, @cidade, @linkedin_url,
       @curriculo_path, @curriculo_texto, @campos_extras, @token, @status)
  `).run({
    job_id: aplicacao.job_id,
    nome: aplicacao.nome || null,
    sobrenome: aplicacao.sobrenome || null,
    email: aplicacao.email || null,
    telefone: aplicacao.telefone || null,
    cidade: aplicacao.cidade || null,
    linkedin_url: aplicacao.linkedin_url || null,
    curriculo_path: aplicacao.curriculo_path || null,
    curriculo_texto: aplicacao.curriculo_texto || null,
    campos_extras: JSON.stringify(aplicacao.campos_extras || {}),
    token: aplicacao.token || null,
    status: aplicacao.status || 'aplicado',
  });
  return Number(info.lastInsertRowid);
}

function obterAplicacao(id) {
  return aplicacaoDeLinha(getDb().prepare('SELECT * FROM applications WHERE id = ?').get(id));
}

function obterAplicacaoPorToken(token) {
  return aplicacaoDeLinha(
    getDb().prepare('SELECT * FROM applications WHERE token = ?').get(token),
  );
}

function atualizarStatusAplicacao(id, status) {
  getDb().prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, id);
}

module.exports = {
  getDb,
  aplicarSchema,
  // vagas
  obterVaga,
  obterVagaPorSlug,
  obterVagaAtiva,
  listarVagas,
  criarVaga,
  // roteiros
  obterRoteiro,
  obterRoteiroPorNome,
  criarRoteiro,
  // aplicacoes
  criarAplicacao,
  obterAplicacao,
  obterAplicacaoPorToken,
  atualizarStatusAplicacao,
};
