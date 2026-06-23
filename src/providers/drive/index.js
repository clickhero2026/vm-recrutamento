'use strict';

// Interface de armazenamento de video (gravacao da entrevista). Agnostica; hoje so
// existe o adaptador Google Drive. Os adaptadores reais so sao chamados quando
// INTERVIEW_MOCK=false (o caller decide; em mock nem importamos o SDK).
//
// Contrato:
//   enviarVideo({ caminho, nomeArquivo, mimeType }) -> Promise<{ id, link }>
//     caminho:     caminho do arquivo temporario no disco
//     nomeArquivo: nome final no Drive (ex.: "entrevista-12-fulano.webm")
//     mimeType:    'video/webm' | 'video/mp4'
//     retorno:     { id (fileId do Drive), link (URL compartilhavel) }

const adaptadores = {
  google: () => require('./google'),
};

// So existe 'google' por enquanto; mantido o mesmo padrao de selecao dos demais
// provedores para facilitar troca futura.
function selecionar() {
  return adaptadores.google();
}

async function enviarVideo(opcoes) {
  return selecionar().enviarVideo(opcoes);
}

module.exports = { enviarVideo, selecionar };
