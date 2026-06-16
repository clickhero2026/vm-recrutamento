'use strict';

// Adaptador STT: Groq (Whisper) - padrao (barato, rapido, bom PT-BR).
// STUB da Fase 0. Implementacao na Fase 3.

async function transcrever(_audio, _idioma = 'pt-BR') {
  throw new Error('Provedor STT "groq" ainda nao implementado - Fase 3.');
}

module.exports = { transcrever };
