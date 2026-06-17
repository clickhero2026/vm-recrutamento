'use strict';

// Rotas de API (JSON).
// Fase 1B: POST /api/aplicacao implementado (upload de PDF + extracao + persistencia).
// As demais rotas seguem como stubs (501) ate suas fases.

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const { config } = require('../config');
const db = require('../db');
const session = require('../lib/session');
const { extrairTextoPdf } = require('../lib/curriculo');
const entrevista = require('../lib/entrevista');

const router = express.Router();

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (resposta de audio push-to-talk)

// Upload em memoria: validamos tipo/tamanho e so gravamos no disco depois de
// gerar o token (o nome do arquivo e <token>.pdf).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES },
  fileFilter(req, file, cb) {
    const ehPdf = file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname);
    if (!ehPdf) {
      const erro = new Error('Envie o currículo em formato PDF.');
      erro.code = 'TIPO_INVALIDO';
      return cb(erro);
    }
    cb(null, true);
  },
}).single('curriculo');

// Upload do audio de resposta (push-to-talk). Aceita audio/* (webm/ogg/mp4...).
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter(req, file, cb) {
    if (!/^audio\//.test(file.mimetype)) {
      const erro = new Error('Formato de áudio inválido.');
      erro.code = 'TIPO_INVALIDO';
      return cb(erro);
    }
    cb(null, true);
  },
}).single('audio');

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

// Exige candidato identificado (versao API: responde 401 JSON em vez de redirecionar).
function candidatoApi(req, res) {
  const candidato = session.loadCandidato(req);
  if (!candidato) {
    res.status(401).json({ ok: false, erro: 'Sessão expirada. Faça a identificação novamente.' });
    return null;
  }
  return candidato;
}

function naoImplementado(fase) {
  return (req, res) => {
    res.status(501).json({
      ok: false,
      erro: 'nao_implementado',
      mensagem: `${req.method} ${req.baseUrl}${req.path} sera implementado na ${fase}.`,
    });
  };
}

// ── POST /api/aplicacao ──
router.post('/aplicacao', (req, res) => {
  upload(req, res, async (err) => {
    // Erros de upload (multer) -> mensagens em PT-BR
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, erro: 'O currículo deve ter no máximo 10 MB.' });
      }
      if (err.code === 'TIPO_INVALIDO') {
        return res.status(400).json({ ok: false, erro: err.message });
      }
      return res
        .status(400)
        .json({ ok: false, erro: 'Não foi possível processar o upload do currículo.' });
    }

    try {
      const b = req.body || {};
      const nome = String(b.nome || '').trim();
      const sobrenome = String(b.sobrenome || '').trim();
      const email = String(b.email || '').trim();
      const ddi = String(b.ddi || '+55').trim();
      const telefoneNum = String(b.telefone || '').trim();
      const cidade = String(b.cidade || '').trim();
      const linkedin = String(b.linkedin_url || '').trim();

      // Validacao no servidor (a validacao do front e so conveniencia)
      const faltando = [];
      if (!nome) faltando.push('nome');
      if (!sobrenome) faltando.push('sobrenome');
      if (!email) faltando.push('e-mail');
      if (!telefoneNum) faltando.push('telefone');
      if (faltando.length) {
        return res
          .status(400)
          .json({ ok: false, erro: `Preencha os campos obrigatórios: ${faltando.join(', ')}.` });
      }
      if (!emailValido(email)) {
        return res.status(400).json({ ok: false, erro: 'Informe um e-mail válido.' });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, erro: 'Anexe seu currículo em PDF.' });
      }

      // Resolve a vaga (pelo slug enviado; senao, a vaga ativa)
      const slug = String(b.slug || '').trim();
      const vaga = slug ? db.obterVagaPorSlug(slug) : db.obterVagaAtiva();
      if (!vaga) {
        return res
          .status(400)
          .json({ ok: false, erro: 'Vaga não encontrada para esta candidatura.' });
      }

      const telefone = `${ddi} ${telefoneNum}`.trim();

      // Perguntas extras de vendas (Q1-Q6)
      const camposExtras = {
        anos_experiencia: Number.parseInt(b.anos_experiencia, 10) || 0,
        segmento: ['B2B', 'B2C', 'Ambos'].includes(b.segmento) ? b.segmento : null,
        crm: String(b.crm || '').trim(),
        pretensao: String(b.pretensao || '').trim(),
        disponibilidade_dias: Number.parseInt(b.disponibilidade_dias, 10) || 0,
        horas_semana: Number.parseInt(b.horas_semana, 10) || 0,
      };

      const token = session.gerarToken();

      // Salva o PDF no volume persistente (cria a pasta se nao existir)
      fs.mkdirSync(config.caminhoCurriculos, { recursive: true });
      const caminhoPdf = path.join(config.caminhoCurriculos, `${token}.pdf`);
      fs.writeFileSync(caminhoPdf, req.file.buffer);

      // Extrai o texto do PDF (truncado em ~20.000 caracteres no helper)
      const curriculoTexto = await extrairTextoPdf(req.file.buffer);

      // Persiste a application pela camada de dados agnostica
      db.criarAplicacao({
        job_id: vaga.id,
        nome,
        sobrenome,
        email,
        telefone,
        cidade,
        linkedin_url: linkedin,
        curriculo_path: caminhoPdf,
        curriculo_texto: curriculoTexto,
        campos_extras: camposExtras,
        token,
        status: 'aplicado',
      });

      // DEV ONLY: loga o token para testar a tela de Identificacao depois.
      // IMPORTANTE: nao logar token de candidato em producao (dado sensivel).
      if (!config.ehProducao) {
        console.log(
          `[dev] application criada — token=${token} (use em /identificacao). Este log NAO ocorre em producao.`,
        );
      }

      // Grava a sessao do candidato e manda o front redirecionar
      session.setToken(res, token);
      return res.json({ ok: true, redirect: '/preparacao' });
    } catch (erro) {
      console.error('[api/aplicacao] erro:', erro.message);
      return res
        .status(500)
        .json({ ok: false, erro: 'Erro interno ao registrar a candidatura. Tente novamente.' });
    }
  });
});

// ── POST /api/identificacao ──
// Recupera a application por email + codigo (token). Restaura a sessao.
//
// TODO (Fase 4): o codigo/link de acesso sera enviado ao candidato por e-mail
// (Resend). Por enquanto, o codigo e o token logado em dev pelo POST /api/aplicacao.
// IMPORTANTE: nunca autenticar so por e-mail — exigimos email E token corretos
// para evitar acesso indevido a candidaturas de terceiros.
router.post('/identificacao', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const codigo = String((req.body && req.body.codigo) || '').trim();

  if (!email || !codigo) {
    return res.status(400).json({ ok: false, erro: 'Informe e-mail e código de acesso.' });
  }

  // Busca pela camada de dados (por token) e confere o e-mail como segundo fator.
  const aplicacao = db.obterAplicacaoPorToken(codigo);
  const emailConfere =
    aplicacao && String(aplicacao.email || '').trim().toLowerCase() === email;

  if (!aplicacao || !emailConfere) {
    return res
      .status(400)
      .json({ ok: false, erro: 'Não encontramos uma candidatura com esses dados.' });
  }

  session.setToken(res, aplicacao.token);
  return res.json({ ok: true, redirect: '/preparacao' });
});

// Resolve o roteiro de uma vaga (ou null).
function roteiroDaVaga(vaga) {
  return vaga && vaga.roteiro_id ? db.obterRoteiro(vaga.roteiro_id) : null;
}

// URL do audio da fala da Vera. Em mock, arquivo estatico. (Fase 3-real: TTS.)
function audioDaFala() {
  return entrevista.AUDIO_MOCK;
}

// ── POST /api/interview/start ── inicia a entrevista e devolve a 1a pergunta
router.post('/interview/start', (req, res) => {
  const candidato = candidatoApi(req, res);
  if (!candidato) return undefined;

  const vaga = db.obterVaga(candidato.job_id);
  const roteiro = roteiroDaVaga(vaga);
  const perguntas = entrevista.montarPerguntas(roteiro);

  const interviewId = db.criarInterview({
    application_id: candidato.id,
    perfil: vaga ? vaga.perfil : 'SDR',
    roteiro_id: vaga ? vaga.roteiro_id : null,
    status: 'iniciada',
  });
  db.atualizarStatusAplicacao(candidato.id, 'em_entrevista');

  // 1o turno do agente (Vera faz a 1a pergunta)
  db.criarTurno({ interview_id: interviewId, ordem: 1, autor: 'agente', texto: perguntas[0].texto });

  return res.json({
    ...entrevista.payloadPergunta({
      interviewId,
      perguntas,
      indice: 0,
      audioUrl: audioDaFala(),
    }),
    agente: config.agente.nome,
    max_duracao_min: config.entrevista.maxDuracaoMin,
    mock: config.entrevista.mock,
  });
});

// ── POST /api/interview/answer ── recebe o audio e devolve a proxima pergunta
router.post('/interview/answer', (req, res) => {
  uploadAudio(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, erro: 'O áudio enviado é muito grande.' });
      }
      return res.status(400).json({ ok: false, erro: 'Não foi possível processar o áudio.' });
    }

    const candidato = candidatoApi(req, res);
    if (!candidato) return undefined;

    const interviewId = Number(req.body.interview_id);
    const entrevistaRow = db.obterInterview(interviewId);
    if (!entrevistaRow || entrevistaRow.application_id !== candidato.id) {
      return res.status(404).json({ ok: false, erro: 'Entrevista não encontrada.' });
    }

    const roteiro = entrevistaRow.roteiro_id ? db.obterRoteiro(entrevistaRow.roteiro_id) : null;
    const perguntas = entrevista.montarPerguntas(roteiro);

    // Quantas perguntas a Vera ja fez -> proxima e o indice seguinte (0-based).
    const proximoIndice = db.contarTurnos(interviewId, 'agente');

    // Salva o turno do candidato. Em mock, nao transcrevemos (STT e Fase 3-real),
    // mas guardamos o audio no volume persistente para exercitar a persistencia.
    let audioPath = null;
    if (req.file) {
      try {
        const dir = path.join(config.caminhoEntrevistas, String(interviewId));
        fs.mkdirSync(dir, { recursive: true });
        audioPath = path.join(dir, `${proximoIndice}.webm`);
        fs.writeFileSync(audioPath, req.file.buffer);
      } catch (e) {
        console.error('[interview/answer] falha ao salvar audio:', e.message);
        audioPath = null;
      }
    }
    const textoCandidato = config.entrevista.mock
      ? '[resposta de áudio recebida — transcrição na Fase 3-real]'
      : '';
    db.criarTurno({
      interview_id: interviewId,
      ordem: db.contarTurnos(interviewId) + 1,
      autor: 'candidato',
      texto: textoCandidato,
      audio_path: audioPath,
    });

    // Acabaram as perguntas -> encerra.
    if (proximoIndice >= perguntas.length) {
      db.finalizarInterview(interviewId);
      db.atualizarStatusAplicacao(candidato.id, 'concluido');
      return res.json({
        ok: true,
        encerrar: true,
        interview_id: interviewId,
        pergunta: entrevista.FALA_FECHAMENTO,
        audio_url: audioDaFala(),
        topicos: entrevista.topicosUnicos(perguntas).map((nome) => ({ nome, estado: 'concluido' })),
      });
    }

    // Proxima pergunta da Vera.
    db.criarTurno({
      interview_id: interviewId,
      ordem: db.contarTurnos(interviewId) + 1,
      autor: 'agente',
      texto: perguntas[proximoIndice].texto,
    });

    return res.json(
      entrevista.payloadPergunta({
        interviewId,
        perguntas,
        indice: proximoIndice,
        audioUrl: audioDaFala(),
      }),
    );
  });
});

// ── POST /api/interview/finish ── encerra a entrevista
// TODO (Fase 4): gerar relatorio (resumo + pontuacoes) e enviar ao recrutador (Resend).
router.post('/interview/finish', (req, res) => {
  const candidato = candidatoApi(req, res);
  if (!candidato) return undefined;

  const interviewId = Number(req.body.interview_id);
  const entrevistaRow = db.obterInterview(interviewId);
  if (!entrevistaRow || entrevistaRow.application_id !== candidato.id) {
    return res.status(404).json({ ok: false, erro: 'Entrevista não encontrada.' });
  }
  db.finalizarInterview(interviewId);
  db.atualizarStatusAplicacao(candidato.id, 'concluido');
  return res.json({ ok: true, redirect: '/finalizacao' });
});

module.exports = router;
