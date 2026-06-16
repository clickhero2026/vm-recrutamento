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

async function transcrever(audio, idioma = 'pt-BR') {
  return selecionar().transcrever(audio, idioma);
}

module.exports = { transcrever, selecionar };
