'use strict';

// Encerramento de entrevista -> geracao de relatorio (correcao do bug em que 3 dos 4
// caminhos de encerramento NAO geravam relatorio).
//
// Apos a refatoracao, todo encerramento passa por entrevista.finalizarEntrevista(), que
// finaliza a interview, finaliza a application e dispara gerarRelatorio em fire-and-forget.
//
// Cobertura (tudo em modo MOCK — NENHUMA chamada real a DeepSeek/Resend/Groq/Google):
//   1. finalizarEntrevista direto: o "ralo" compartilhado para o qual os 3 caminhos
//      problematicos (mock-encerrar, teto de duracao, teto de perguntas) agora delegam
//      — uma unica linha identica em cada um. Provar a funcao prova o comportamento
//      herdado pelos 3.
//   2. /answer (modo mock) ao encerrar: fim natural da entrevista pela rota real,
//      provando a fiacao end-to-end (chamada de PRODUCAO, sem injecao de deps).
//   3. /finish: a rota mantida agora tambem delega ao ponto unico.
//
// Limite consciente: os ramos de modo REAL (tempoEstourou e encerrar via teto/marcador
// do LLM, dentro de /answer) executam a MESMA linha finalizarEntrevista(interviewId);
// nao sao dirigidos por HTTP aqui porque exigiriam STT/LLM/TTS reais (os providers sao
// require de modulo, nao injetaveis na rota). O teste 1 exercita exatamente a logica que
// esses ramos passaram a rodar.
//
// Isolamento: banco SQLite TEMPORARIO proprio. As envs DEVEM ser definidas antes de
// qualquer require que carregue ../src/config (ele le DATABASE_PATH/INTERVIEW_MOCK/
// RECRUITER_EMAIL/MAX_PERGUNTAS/SESSION_SECRET no momento do load).

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const TMP_DB = path.join(os.tmpdir(), `vm-test-finalizacao-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = TMP_DB;
process.env.INTERVIEW_MOCK = 'true';
process.env.RECRUITER_EMAIL = 'recrutador@teste.local';
process.env.MAX_PERGUNTAS = '1'; // garante que o 1o /answer (com a abertura ja feita) encerra
process.env.SESSION_SECRET = 'segredo-de-teste'; // determinismo da assinatura do cookie
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const { semear } = require('../src/db/seed');
const entrevista = require('../src/lib/entrevista');
const { criarApp } = require('../src/server');

const SECRET = process.env.SESSION_SECRET;

let vagaId;
let roteiroId;

// Deps que FALHAM se chamadas: em modo mock, LLM e e-mail nunca devem ser tocados.
function depsSemRede() {
  return {
    usarMockDeterministico: true,
    llm: {
      completar() {
        throw new Error('LLM NAO deveria ser chamado em modo mock');
      },
    },
    email: {
      enviar() {
        throw new Error('Email NAO deveria ser enviado em modo mock');
      },
    },
  };
}

// Assinatura de cookie identica a do cookie-parser/cookie-signature (HMAC-SHA256, base64
// sem '=' ao final). O valor no header vai prefixado por 's:' e URL-encoded.
function cookieAssinado(token) {
  const sig = crypto.createHmac('sha256', SECRET).update(token).digest('base64').replace(/=+$/, '');
  return `vm_token=${encodeURIComponent(`s:${token}.${sig}`)}`;
}

// Cria application + interview EM ANDAMENTO (com a abertura ja gravada) e devolve os ids.
function novaEntrevistaEmAndamento(sufixo) {
  const appId = db.criarAplicacao({
    job_id: vagaId,
    nome: 'Caso',
    sobrenome: sufixo,
    email: `caso-${sufixo}@teste.local`,
    token: `tok-${sufixo}`,
    status: 'em_entrevista',
  });
  const iid = db.criarInterview({
    application_id: appId,
    perfil: 'SDR',
    roteiro_id: roteiroId,
    status: 'iniciada',
  });
  // Abertura (1 turno do agente): conta como pergunta 1 -> com MAX_PERGUNTAS=1, encerra.
  db.criarTurno({ interview_id: iid, ordem: 1, autor: 'agente', texto: 'Pergunta de abertura.' });
  return { appId, iid, token: `tok-${sufixo}` };
}

// Espera o relatorio (gerado em fire-and-forget pos-resposta HTTP) aparecer no banco.
async function esperarReport(iid, tentativas = 100) {
  for (let i = 0; i < tentativas; i++) {
    const r = db.obterReportEnviadoPorInterview(iid);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  return null;
}

test.before(() => {
  const seeded = semear(); // roda migrar() internamente + cria roteiro/vaga
  roteiroId = seeded.roteiroId;
  vagaId = seeded.vagaId;
});

test.after(() => {
  for (const sufixo of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(TMP_DB + sufixo, { force: true });
    } catch {
      /* ignore */
    }
  }
});

test('finalizarEntrevista (mock): finaliza interview + application e GERA o relatorio', async () => {
  const { appId, iid } = novaEntrevistaEmAndamento('direto');
  db.criarTurno({ interview_id: iid, ordem: 2, autor: 'candidato', texto: 'Resposta.' });

  // Caminho de PRODUCAO dos 3 ramos de encerramento (mock-encerrar/duracao/perguntas):
  // exatamente esta chamada. Aguardamos a promise retornada (em producao e fire-and-forget).
  const report = await entrevista.finalizarEntrevista(iid, depsSemRede());

  assert.equal(db.obterInterview(iid).status, 'concluido');
  assert.equal(db.obterAplicacao(appId).status, 'concluido');
  assert.ok(report, 'gerarRelatorio deveria ter retornado o report');
  assert.equal(report.status, 'enviado'); // mock + RECRUITER_EMAIL definido -> 'enviado'
  assert.equal(report.interview_id, iid);

  // Persistido de fato (re-consulta pela camada de dados).
  const naBase = db.obterReportEnviadoPorInterview(iid);
  assert.ok(naBase, 'report deveria existir no banco');
  assert.equal(naBase.id, report.id);
});

test('finalizarEntrevista: interview inexistente -> lanca erro (nao silencia)', async () => {
  await assert.rejects(
    async () => entrevista.finalizarEntrevista(999999, depsSemRede()),
    /nao encontrada/i,
  );
});

test('POST /api/interview/answer (mock) ao encerrar -> gera relatorio (fiacao end-to-end)', async () => {
  const { iid, token } = novaEntrevistaEmAndamento('answer');

  const app = criarApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await fetch(`${base}/api/interview/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieAssinado(token),
      },
      body: new URLSearchParams({ interview_id: String(iid) }),
    });
    assert.equal(res.status, 200);
    const dados = await res.json();
    assert.equal(dados.ok, true);
    assert.equal(dados.encerrar, true); // MAX_PERGUNTAS=1 + abertura ja feita -> encerra

    // ANTES da correcao: nenhum relatorio era gerado por este caminho. AGORA gera.
    const report = await esperarReport(iid);
    assert.ok(report, 'o encerramento via /answer deveria ter gerado o relatorio');
    assert.equal(report.status, 'enviado');

    // Status fechados corretamente tambem.
    assert.equal(db.obterInterview(iid).status, 'concluido');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/interview/finish -> gera relatorio via ponto unico', async () => {
  const { iid, token } = novaEntrevistaEmAndamento('finish');

  const app = criarApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await fetch(`${base}/api/interview/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieAssinado(token),
      },
      body: new URLSearchParams({ interview_id: String(iid) }),
    });
    assert.equal(res.status, 200);
    const dados = await res.json();
    assert.equal(dados.ok, true);
    assert.equal(dados.redirect, '/finalizacao');

    const report = await esperarReport(iid);
    assert.ok(report, '/finish deveria ter gerado o relatorio');
    assert.equal(report.status, 'enviado');
    assert.equal(db.obterInterview(iid).status, 'concluido');
    assert.equal(db.obterAplicacao(db.obterInterview(iid).application_id).status, 'concluido');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
