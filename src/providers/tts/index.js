'use strict';

// Interface de TTS (voz do agente Vera). Agnostica; selecao via env (TTS_PROVIDER).
//
// Contrato:
//   sintetizar(texto, voz) -> Promise<{ audio, mime }>
//     texto: string (a fala do agente)
//     voz:   ex. 'pt-BR-Neural2-A' (default vem de config.provedores.tts.voz)
//     audio: Buffer
//
// Fase 0: roteia para o stub correspondente. (Sem ElevenLabs na v1.)

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

async function sintetizar(texto, voz = config.provedores.tts.voz) {
  return selecionar().sintetizar(texto, voz);
}

module.exports = { sintetizar, selecionar };
