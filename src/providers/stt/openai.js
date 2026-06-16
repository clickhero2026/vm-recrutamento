'use strict';

// Adaptador STT: OpenAI (Whisper) - fallback.
// STUB da Fase 0. Implementacao na Fase 3.

async function transcrever(_audio, _idioma = 'pt-BR') {
  throw new Error('Provedor STT "openai" ainda nao implementado - Fase 3.');
}

module.exports = { transcrever };
