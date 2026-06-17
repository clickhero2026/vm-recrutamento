'use strict';

// Interface de STT (transcricao de audio). Agnostica; selecao via env (STT_PROVIDER).
//
// Contrato:
//   transcrever(audio, idioma) -> Promise<{ texto, idioma, confianca? }>
//     audio:  Buffer | Blob (do MediaRecorder, push-to-talk = lote)
//     idioma: ex. 'pt-BR'
//
// Fase 0: roteia para o stub correspondente.

const { config } = require('../../config');

const adaptadores = {
  groq: () => require('./groq'),
  openai: () => require('./openai'),
};

function selecionar() {
  const nome = config.provedores.stt.nome;
  const carregar = adaptadores[nome];
  if (!carregar) {
    throw new Error(
      `STT_PROVIDER invalido: "${nome}". Use: ${Object.keys(adaptadores).join(' | ')}.`,
    );
  }
  return carregar();
}

// opcoes: { idioma='pt', mimetype }
async function transcrever(audio, opcoes = {}) {
  return selecionar().transcrever(audio, opcoes);
}

module.exports = { transcrever, selecionar };
