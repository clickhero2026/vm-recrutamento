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

const router = express.Router();

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

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

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
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

// Recupera aplicacao por email + codigo (tela de Identificacao)
router.post('/identificacao', naoImplementado('Fase 1C'));

// Inicia entrevista, retorna 1a pergunta (texto + audio)
router.post('/interview/start', naoImplementado('Fase 3'));

// Recebe audio -> STT -> proxima pergunta (texto + audio)
router.post('/interview/answer', naoImplementado('Fase 3'));

// Encerra, gera relatorio, envia e-mail
router.post('/interview/finish', naoImplementado('Fase 4'));

module.exports = router;
