'use strict';

// Cria as tabelas a partir de schema.sql. Idempotente: pode rodar quantas
// vezes quiser (usa CREATE TABLE IF NOT EXISTS). Roda no boot do servidor e
// tambem via `npm run migrate`.

const { config } = require('../config');
const { aplicarSchema, getDb } = require('./sqlite');

// Adiciona uma coluna se ela ainda nao existir (idempotente, p/ bancos antigos).
// CREATE TABLE IF NOT EXISTS nao altera tabelas ja criadas, entao migracoes
// incrementais de coluna vivem aqui.
function adicionarColunaSeFaltar(tabela, coluna, definicao) {
  const db = getDb();
  const existe = db
    .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
    .get(tabela, coluna);
  if (!existe) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

function migrar() {
  aplicarSchema();
  // Migracoes incrementais (idempotentes) para bancos criados antes desta coluna.
  adicionarColunaSeFaltar('interviews', 'ultimo_resp_id', 'TEXT');
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
