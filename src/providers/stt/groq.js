'use strict';

// Adaptador STT: Groq (Whisper) — padrao (barato, rapido, bom PT-BR).
// Chamado apenas quando INTERVIEW_MOCK=false. Usa fetch + FormData nativos (Node 22).
//
// Contrato: transcrever(audioBuffer, { idioma='pt', mimetype }) -> { texto }

const { config } = require('../../config');

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Extensao de arquivo a partir do mimetype (Whisper usa o nome do arquivo como dica).
function extensaoDe(mimetype) {
  if (!mimetype) return 'webm';
  if (mimetype.includes('webm')) return 'webm';
  if (mimetype.includes('ogg')) return 'ogg';
  if (mimetype.includes('mp4') || mimetype.includes('m4a')) return 'm4a';
  if (mimetype.includes('mpeg') || mimetype.includes('mp3')) return 'mp3';
  if (mimetype.includes('wav')) return 'wav';
  return 'webm';
}

async function transcrever(audioBuffer, opcoes = {}) {
  const cfg = config.provedores.stt.groq;
  if (!cfg.apiKey) {
    throw new Error('GROQ_API_KEY ausente. Defina a chave no .env para usar o STT Groq.');
  }

  const idioma = opcoes.idioma || 'pt';
  const mimetype = opcoes.mimetype || 'audio/webm';

  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimetype });
  form.append('file', blob, `audio.${extensaoDe(mimetype)}`);
  form.append('model', cfg.modelo);
  form.append('language', idioma); // sempre fixamos o idioma (pt por padrao)
  form.append('response_format', 'json');

  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
    });
  } catch (err) {
    throw new Error(`Falha de rede ao chamar o STT Groq: ${err.message}`);
  }

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error(`STT Groq retornou erro ${resp.status}: ${detalhe.slice(0, 300)}`);
  }

  const dados = await resp.json();
  return { texto: dados.text || '' };
}

module.exports = { transcrever };
