'use strict';

// Bootstrap do servidor Express.
// - Roda as migracoes (idempotentes) no boot.
// - Serve estaticos de public/.
// - Monta rotas de pagina e de API.
// - Expoe GET /health para o healthcheck do EasyPanel.

const path = require('node:path');
const express = require('express');

const { config, validar } = require('./config');
const { migrar } = require('./db/migrate');
const db = require('./db');
const paginas = require('./routes/pages');
const api = require('./routes/api');

function criarApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Estaticos (CSS, JS, assets, partials).
  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      extensions: ['html'],
      maxAge: config.ehProducao ? '1h' : 0,
    }),
  );

  // Healthcheck: confirma processo no ar e banco acessivel.
  app.get('/health', (req, res) => {
    let banco = false;
    try {
      db.getDb().prepare('SELECT 1').get();
      banco = true;
    } catch {
      banco = false;
    }
    res.json({ ok: true, banco, agente: config.agente.nome });
  });

  // Rotas
  app.use('/api', api);
  app.use('/', paginas);

  // 404 simples
  app.use((req, res) => {
    res.status(404).json({ ok: false, erro: 'nao_encontrado', caminho: req.path });
  });

  // Tratador de erros
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[erro]', err.message);
    res.status(500).json({ ok: false, erro: 'erro_interno' });
  });

  return app;
}

function iniciar() {
  validar();

  // Migracoes no boot (idempotente).
  migrar();
  console.log(`[db] banco pronto em ${config.caminhoBanco}`);

  const app = criarApp();
  app.listen(config.porta, () => {
    console.log(`[server] no ar em http://localhost:${config.porta} (${config.ambiente})`);
    console.log(`[server] healthcheck: GET /health`);
  });
}

if (require.main === module) {
  iniciar();
}

module.exports = { criarApp, iniciar };
