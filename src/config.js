'use strict';

// Le e valida as variaveis de ambiente. E a UNICA fonte de configuracao do app.
// Nada de process.env espalhado pelo codigo: tudo passa por aqui.

const path = require('node:path');
require('dotenv').config();

function bool(valor, padrao = false) {
  if (valor === undefined || valor === '') return padrao;
  return ['1', 'true', 'sim', 'yes'].includes(String(valor).toLowerCase());
}

function num(valor, padrao) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) ? n : padrao;
}

const ambiente = process.env.NODE_ENV || 'development';
const ehProducao = ambiente === 'production';

const config = {
  ambiente,
  ehProducao,

  porta: num(process.env.PORT, 3000),

  // Caminho do arquivo SQLite. Em producao aponta para o volume (/data/app.db).
  caminhoBanco: path.resolve(process.env.DATABASE_PATH || './data/app.db'),

  // Pasta de curriculos (PDFs), no mesmo volume persistente do banco (ex.: /data/curriculos).
  caminhoCurriculos: path.resolve(
    path.dirname(process.env.DATABASE_PATH || './data/app.db'),
    'curriculos',
  ),

  // Pasta dos audios de resposta das entrevistas (ex.: /data/entrevistas).
  caminhoEntrevistas: path.resolve(
    path.dirname(process.env.DATABASE_PATH || './data/app.db'),
    'entrevistas',
  ),

  sessao: {
    segredo: process.env.SESSION_SECRET || 'troque-isto',
  },

  agente: {
    nome: process.env.AGENT_NAME || 'Vera',
  },

  recrutador: {
    email: process.env.RECRUITER_EMAIL || '',
  },

  entrevista: {
    // Mock = sem chamadas externas (custo zero). Enquanto os providers reais
    // (STT/LLM/TTS) nao estao ligados, o mock e o unico caminho funcional.
    // Em producao real, defina INTERVIEW_MOCK=false (exige chaves de API).
    mock: bool(process.env.INTERVIEW_MOCK, true),
    maxDuracaoMin: num(process.env.MAX_DURACAO_MIN, 20),
  },

  // Selecao de provedores (os adaptadores reais chegam na Fase 3/4).
  provedores: {
    llm: {
      nome: process.env.LLM_PROVIDER || 'openrouter',
      modelo: process.env.LLM_MODEL || '',
      chaves: {
        openrouter: process.env.OPENROUTER_API_KEY || '',
        deepseek: process.env.DEEPSEEK_API_KEY || '',
        anthropic: process.env.ANTHROPIC_API_KEY || '',
      },
    },
    stt: {
      nome: process.env.STT_PROVIDER || 'groq',
      chaves: {
        groq: process.env.GROQ_API_KEY || '',
        openai: process.env.OPENAI_API_KEY || '',
      },
    },
    tts: {
      nome: process.env.TTS_PROVIDER || 'google',
      voz: process.env.TTS_VOICE || '',
      chaves: {
        google: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
        openai: process.env.OPENAI_API_KEY || '',
      },
    },
    email: {
      nome: 'resend',
      chaves: {
        resend: process.env.RESEND_API_KEY || '',
      },
    },
  },
};

// Validacao leve: avisa (sem derrubar) sobre configuracoes fracas em producao.
// Nesta fase nao exigimos chaves de API (os provedores ainda sao stubs).
function validar() {
  const avisos = [];
  if (config.ehProducao && config.sessao.segredo === 'troque-isto') {
    avisos.push('SESSION_SECRET esta no valor padrao em producao. Defina um segredo forte.');
  }
  if (!config.recrutador.email) {
    avisos.push('RECRUITER_EMAIL nao definido (necessario na Fase 4 para envio do relatorio).');
  }
  for (const aviso of avisos) {
    console.warn(`[config] aviso: ${aviso}`);
  }
  return avisos;
}

module.exports = { config, validar };
