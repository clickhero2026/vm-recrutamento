'use strict';

// Interface de TTS (voz do agente Vera). Agnostica; selecao via env (TTS_PROVIDER).
//
// Contrato:
//   sintetizar(texto, opcoes) -> Promise<{ audio, mime }>
//     texto:  string (a fala do agente)
//     opcoes: { voz, idioma } (defaults vem do bloco do provedor no config)
//     audio:  Buffer (MP3 no Google)
//
// Sem ElevenLabs na v1 (baixo custo). Os adaptadores reais so sao chamados
// quando INTERVIEW_MOCK=false.

const { config } = require('../../config');

const adaptadores = {
  google: () => require('./google'),
  openai: () => require('./openai'),
};

function selecionar() {
  const nome = config.provedores.tts.nome;
  const carregar = adaptadores[nome];
  if (!carregar) {
    throw new Error(
      `TTS_PROVIDER invalido: "${nome}". Use: ${Object.keys(adaptadores).join(' | ')}.`,
    );
  }
  return carregar();
}

async function sintetizar(texto, opcoes = {}) {
  return selecionar().sintetizar(texto, opcoes);
}

module.exports = { sintetizar, selecionar };
