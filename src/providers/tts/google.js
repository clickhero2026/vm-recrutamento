'use strict';

// Adaptador TTS: Google Cloud TTS (voz neural pt-BR) — padrao de baixo custo.
// Chamado apenas quando INTERVIEW_MOCK=false.
//
// Contrato: sintetizar(texto, { voz, idioma }) -> { audio: Buffer(MP3), mime }
//
// Credencial (o adaptador tenta nesta ordem):
//   1) GOOGLE_TTS_CREDENTIALS_JSON  -> JSON inteiro da service account numa env (ideal p/ EasyPanel)
//   2) GOOGLE_APPLICATION_CREDENTIALS -> caminho do .json (ADC padrao do Google)
//
// O require do SDK e LAZY (so acontece quando este adaptador e usado), para o app
// subir normalmente em mock sem precisar do pacote carregado.

const { config } = require('../../config');

let _client = null;

function getClient() {
  if (_client) return _client;

  const cfg = config.provedores.tts.google;
  // require lazy: nao carrega o SDK no boot em modo mock
  const { TextToSpeechClient } = require('@google-cloud/text-to-speech');

  if (cfg.credentialsJson) {
    let creds;
    try {
      creds = JSON.parse(cfg.credentialsJson);
    } catch (err) {
      throw new Error('GOOGLE_TTS_CREDENTIALS_JSON invalido: nao e um JSON valido.');
    }
    _client = new TextToSpeechClient({
      projectId: creds.project_id,
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
  } else {
    // Usa GOOGLE_APPLICATION_CREDENTIALS (caminho) via ADC padrao.
    _client = new TextToSpeechClient();
  }
  return _client;
}

async function sintetizar(texto, opcoes = {}) {
  const cfg = config.provedores.tts.google;
  if (!cfg.credentialsJson && !cfg.credentialsPath) {
    throw new Error(
      'Credencial do Google TTS ausente. Defina GOOGLE_TTS_CREDENTIALS_JSON (JSON inteiro) ' +
        'ou GOOGLE_APPLICATION_CREDENTIALS (caminho do .json).',
    );
  }

  const voz = opcoes.voz || cfg.voz;
  const idioma = opcoes.idioma || cfg.idioma;

  let resposta;
  try {
    const cliente = getClient();
    [resposta] = await cliente.synthesizeSpeech({
      input: { text: texto },
      voice: { languageCode: idioma, name: voz },
      audioConfig: { audioEncoding: 'MP3' },
    });
  } catch (err) {
    throw new Error(`Falha ao sintetizar voz no Google TTS: ${err.message}`);
  }

  // audioContent ja vem como Buffer/Uint8Array no transporte gRPC.
  const audio = Buffer.isBuffer(resposta.audioContent)
    ? resposta.audioContent
    : Buffer.from(resposta.audioContent);
  return { audio, mime: 'audio/mpeg' };
}

module.exports = { sintetizar };
