'use strict';

// Cria as tabelas a partir de schema.sql. Idempotente: pode rodar quantas
// vezes quiser (usa CREATE TABLE IF NOT EXISTS). Roda no boot do servidor e
// tambem via `npm run migrate`.

const { config } = require('../config');
const { aplicarSchema } = require('./sqlite');

function migrar() {
  aplicarSchema();
  return config.caminhoBanco;
}

// Execucao direta: `node src/db/migrate.js` ou `npm run migrate`
if (require.main === module) {
  try {
    const caminho = migrar();
    console.log(`[migrate] schema aplicado em ${caminho}`);
  } catch (err) {
    console.error('[migrate] falha ao aplicar schema:', err.message);
    process.exit(1);
  }
}

module.exports = { migrar };
