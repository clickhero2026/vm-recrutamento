'use strict';

// Adaptador de armazenamento: Google Drive (gravacao de video da entrevista).
// REAPROVEITA a Service Account do TTS. Chamado apenas quando INTERVIEW_MOCK=false.
//
// Contrato: enviarVideo({ caminho, nomeArquivo, mimeType }) -> { id, link }
//
// Credencial (mesma ordem do TTS):
//   1) GOOGLE_TTS_CREDENTIALS_JSON   -> JSON inteiro da SA numa env (ideal p/ EasyPanel)
//   2) GOOGLE_APPLICATION_CREDENTIALS -> caminho do .json (ADC padrao do Google)
//
// O require do SDK (googleapis) e LAZY: so acontece quando este adaptador e usado,
// para o app subir em modo mock sem o pacote carregado.
//
// ⚠️  PASTA-DESTINO — gotcha operacional do Drive com Service Account:
//   Uma Service Account NAO tem um "My Drive" humano com cota utilizavel. Se este
//   adaptador CRIAR a pasta, ela nasce dentro da SA e o arquivo pode falhar por cota
//   ("storage quota exceeded") e/ou ficar invisivel para o Rafael. Caminho ROBUSTO:
//   pre-criar a pasta numa conta humana (ou Shared Drive), compartilha-la como Editor
//   com o e-mail da SA e definir GOOGLE_DRIVE_FOLDER_ID. Com o id setado, este modulo
//   nao cria nada — so envia para dentro dela (com suporte a Shared Drives).

const fs = require('node:fs');
const { config } = require('../../config');

let _drive = null;
let _pastaIdCache = null;

// Le a credencial da SA (JSON inline ou arquivo). Lanca erro claro se ausente.
function lerCredencial() {
  const cfg = config.provedores.drive;
  if (cfg.credentialsJson) {
    try {
      return JSON.parse(cfg.credentialsJson);
    } catch (err) {
      throw new Error('GOOGLE_TTS_CREDENTIALS_JSON invalido: nao e um JSON valido.');
    }
  }
  if (cfg.credentialsPath) {
    try {
      return JSON.parse(fs.readFileSync(cfg.credentialsPath, 'utf8'));
    } catch (err) {
      throw new Error(
        `Nao foi possivel ler a credencial do Google em ${cfg.credentialsPath}: ${err.message}`,
      );
    }
  }
  throw new Error(
    'Credencial do Google ausente para o Drive. Defina GOOGLE_TTS_CREDENTIALS_JSON (JSON inteiro) ' +
      'ou GOOGLE_APPLICATION_CREDENTIALS (caminho do .json).',
  );
}

// Cliente Drive autenticado (singleton). require lazy do googleapis.
function getDrive() {
  if (_drive) return _drive;
  const { google } = require('googleapis');
  const cred = lerCredencial();
  const auth = new google.auth.JWT({
    email: cred.client_email,
    key: cred.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

// Resolve o id da pasta-destino. Se GOOGLE_DRIVE_FOLDER_ID estiver setado, usa direto.
// Caso contrario, procura uma pasta com o nome configurado; se nao achar, cria.
async function resolverPastaId(drive) {
  const cfg = config.provedores.drive;
  if (cfg.pastaId) return cfg.pastaId;
  if (_pastaIdCache) return _pastaIdCache;

  const nome = cfg.pastaNome.replace(/'/g, "\\'");
  const busca = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${nome}' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const achada = busca.data.files && busca.data.files[0];
  if (achada) {
    _pastaIdCache = achada.id;
    return _pastaIdCache;
  }

  const criada = await drive.files.create({
    requestBody: {
      name: cfg.pastaNome,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  _pastaIdCache = criada.data.id;
  return _pastaIdCache;
}

// Sobe o arquivo e devolve { id, link } com link compartilhavel (leitura por qualquer
// pessoa com o link). deps injetavel ({ drive }) para teste sem rede.
async function enviarVideo({ caminho, nomeArquivo, mimeType } = {}, deps = {}) {
  if (!caminho || !fs.existsSync(caminho)) {
    throw new Error(`Arquivo de video nao encontrado para upload: ${caminho}`);
  }
  const drive = deps.drive || getDrive();
  const pastaId = await resolverPastaId(drive);

  const criado = await drive.files.create({
    requestBody: {
      name: nomeArquivo || 'entrevista.webm',
      parents: [pastaId],
    },
    media: {
      mimeType: mimeType || 'video/webm',
      body: fs.createReadStream(caminho),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const fileId = criado.data.id;

  // Link compartilhavel: leitura por qualquer pessoa com o link (o painel exibe o link
  // ao recrutador). Best-effort: se a permissao falhar, ainda devolvemos o link interno.
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });
  } catch (err) {
    console.error(`[drive] falha ao tornar o video ${fileId} compartilhavel: ${err.message}`);
  }

  const link = criado.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  return { id: fileId, link };
}

module.exports = { enviarVideo };
