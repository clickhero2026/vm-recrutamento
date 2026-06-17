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
// Adaptadores agnosticos (interface). Os SDKs/chaves so sao tocados quando
// INTERVIEW_MOCK=false; em mock estes modulos nem sao exercitados.
const llm = require('../providers/llm');
const stt = require('../providers/stt');
const tts = require('../providers/tts');

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

// Sintetiza a fala da Vera (TTS real), salva o MP3 no volume e devolve a URL servida.
async function sintetizarESalvar(texto, interviewId, ordem) {
  const { audio } = await entrevista.comTimeout(
    tts.sintetizar(texto, {}),
    config.entrevista.timeoutMs,
    'TTS Google',
  );
  const dir = path.join(config.caminhoEntrevistas, String(interviewId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${ordem}.mp3`), audio);
  return `/api/interview/audio/${interviewId}/${ordem}.mp3`;
}

// Audio fixo "nao consegui ouvir": gera via TTS e cacheia UMA vez.
function caminhoNaoOuvi() {
  return path.join(config.caminhoEntrevistas, '_cache', 'nao-ouvi.mp3');
}
async function garantirNaoOuvi() {
  const caminho = caminhoNaoOuvi();
  if (fs.existsSync(caminho)) return;
  const { audio } = await entrevista.comTimeout(
    tts.sintetizar(entrevista.FRASE_NAO_OUVI, {}),
    config.entrevista.timeoutMs,
    'TTS Google',
  );
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, audio);
}

// ── POST /api/interview/start ── inicia a entrevista e devolve a 1a pergunta
router.post('/interview/start', async (req, res) => {
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

  // 1a pergunta da Vera = abertura do roteiro (deterministica, orientada a dados).
  const textoAbertura = perguntas[0].texto;
  db.criarTurno({ interview_id: interviewId, ordem: 1, autor: 'agente', texto: textoAbertura });

  // Audio: mock = arquivo estatico; real = TTS da abertura.
  let audioUrl = entrevista.AUDIO_MOCK;
  if (!config.entrevista.mock) {
    try {
      audioUrl = await sintetizarESalvar(textoAbertura, interviewId, 1);
    } catch (e) {
      console.error('[interview/start] falha no TTS de abertura:', e.message);
      return res
        .status(502)
        .json({ ok: false, erro: 'Não foi possível iniciar a voz da entrevista. Tente novamente.' });
    }
  }

  return res.json({
    ...entrevista.payloadPergunta({ interviewId, perguntas, indice: 0, audioUrl }),
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

    // Salva o audio do candidato no volume persistente (em mock e real).
    let audioPath = null;
    if (req.file) {
      try {
        const dir = path.join(config.caminhoEntrevistas, String(interviewId));
        fs.mkdirSync(dir, { recursive: true });
        audioPath = path.join(dir, `resp-${proximoIndice}.webm`);
        fs.writeFileSync(audioPath, req.file.buffer);
      } catch (e) {
        console.error('[interview/answer] falha ao salvar audio:', e.message);
        audioPath = null;
      }
    }

    // ───────────────── MODO MOCK (identico a Fase 3C) ─────────────────
    if (config.entrevista.mock) {
      db.criarTurno({
        interview_id: interviewId,
        ordem: db.contarTurnos(interviewId) + 1,
        autor: 'candidato',
        texto: '[resposta de áudio recebida — mock]',
        audio_path: audioPath,
      });

      if (proximoIndice >= perguntas.length) {
        db.finalizarInterview(interviewId);
        db.atualizarStatusAplicacao(candidato.id, 'concluido');
        return res.json({
          ok: true,
          encerrar: true,
          interview_id: interviewId,
          pergunta: entrevista.FALA_FECHAMENTO,
          audio_url: entrevista.AUDIO_MOCK,
          topicos: entrevista.topicosUnicos(perguntas).map((nome) => ({ nome, estado: 'concluido' })),
        });
      }

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
          audioUrl: entrevista.AUDIO_MOCK,
        }),
      );
    }

    // ───────────────── MODO REAL (STT -> LLM -> TTS) ─────────────────
    try {
      // 1) STT — transcreve o audio recebido (idioma pt).
      const { texto: transcricao } = await entrevista.comTimeout(
        stt.transcrever(req.file ? req.file.buffer : Buffer.alloc(0), {
          idioma: 'pt',
          mimetype: req.file ? req.file.mimetype : 'audio/webm',
        }),
        config.entrevista.timeoutMs,
        'STT Groq',
      );

      // STT vazio -> NAO chama o LLM; pede para repetir (audio fixo cacheado).
      if (!transcricao || !transcricao.trim()) {
        await garantirNaoOuvi();
        return res.json({
          ok: true,
          repetir: true,
          interview_id: interviewId,
          pergunta: entrevista.FRASE_NAO_OUVI,
          audio_url: '/api/interview/audio-padrao/nao-ouvi.mp3',
        });
      }

      // Registra a resposta transcrita do candidato.
      db.criarTurno({
        interview_id: interviewId,
        ordem: db.contarTurnos(interviewId) + 1,
        autor: 'candidato',
        texto: transcricao.trim(),
        audio_path: audioPath,
      });

      // 2) LLM — gera a proxima pergunta referenciando a resposta + curriculo.
      const systemPrompt = entrevista.montarSystemPrompt({
        roteiro,
        curriculoTexto: candidato.curriculo_texto,
        agente: config.agente.nome,
        maxPerguntas: config.entrevista.maxPerguntas,
      });
      const mensagens = entrevista.montarMensagensLLM({
        systemPrompt,
        turns: db.listarTurnos(interviewId),
        recentes: config.entrevista.historicoRecentes,
      });
      const resposta = await entrevista.comTimeout(
        llm.completar(mensagens, { maxTokens: 400 }),
        config.entrevista.timeoutMs,
        'LLM DeepSeek',
      );

      let { texto: falaVera, encerrar } = entrevista.extrairEncerrar(resposta.texto);
      if (!falaVera) falaVera = 'Pode me contar um pouco mais sobre isso?'; // fallback defensivo

      // Teto de perguntas (rede de seguranca contra entrevista infinita).
      const agentePosNovo = db.contarTurnos(interviewId, 'agente') + 1;
      if (agentePosNovo >= config.entrevista.maxPerguntas) encerrar = true;

      // 3) TTS — sintetiza a fala da Vera e salva o MP3.
      const ordemAgente = db.contarTurnos(interviewId) + 1;
      const audioUrl = await sintetizarESalvar(falaVera, interviewId, ordemAgente);
      db.criarTurno({
        interview_id: interviewId,
        ordem: ordemAgente,
        autor: 'agente',
        texto: falaVera,
      });

      if (encerrar) {
        db.finalizarInterview(interviewId);
        db.atualizarStatusAplicacao(candidato.id, 'concluido');
        return res.json({
          ok: true,
          encerrar: true,
          interview_id: interviewId,
          pergunta: falaVera,
          audio_url: audioUrl,
          topicos: entrevista.topicosUnicos(perguntas).map((nome) => ({ nome, estado: 'concluido' })),
        });
      }

      return res.json(
        entrevista.montarPayload({
          interviewId,
          perguntas,
          indice: proximoIndice,
          texto: falaVera,
          audioUrl,
          encerrar: false,
        }),
      );
    } catch (e) {
      console.error('[interview/answer] erro no modo real:', e.message);
      return res.status(502).json({
        ok: false,
        erro: 'Tivemos um problema ao processar sua resposta. Tente novamente em instantes.',
      });
    }
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

// ── GET /api/interview/audio/:interviewId/:arquivo ── serve o MP3 da fala da Vera (modo real)
// Protegido: so o candidato dono da entrevista acessa.
router.get('/interview/audio/:interviewId/:arquivo', (req, res) => {
  const candidato = candidatoApi(req, res);
  if (!candidato) return undefined;

  const arquivo = req.params.arquivo;
  if (!/^\d+\.mp3$/.test(arquivo)) {
    return res.status(400).json({ ok: false, erro: 'Arquivo inválido.' });
  }
  const interviewId = Number(req.params.interviewId);
  const entrevistaRow = db.obterInterview(interviewId);
  if (!entrevistaRow || entrevistaRow.application_id !== candidato.id) {
    return res.status(404).json({ ok: false, erro: 'Áudio não encontrado.' });
  }
  const caminho = path.join(config.caminhoEntrevistas, String(interviewId), arquivo);
  if (!fs.existsSync(caminho)) {
    return res.status(404).json({ ok: false, erro: 'Áudio não encontrado.' });
  }
  res.type('audio/mpeg');
  return res.sendFile(caminho);
});

// ── GET /api/interview/audio-padrao/nao-ouvi.mp3 ── audio fixo "nao consegui ouvir"
router.get('/interview/audio-padrao/nao-ouvi.mp3', async (req, res) => {
  const candidato = candidatoApi(req, res);
  if (!candidato) return undefined;
  try {
    await garantirNaoOuvi();
    res.type('audio/mpeg');
    return res.sendFile(caminhoNaoOuvi());
  } catch (e) {
    console.error('[interview/audio-padrao] erro:', e.message);
    return res.status(502).json({ ok: false, erro: 'Não foi possível gerar o áudio.' });
  }
});

module.exports = router;
