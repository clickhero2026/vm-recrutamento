'use strict';

// Extracao de texto de curriculo em PDF.
// O texto extraido e guardado em applications.curriculo_texto para o agente Vera
// referenciar a experiencia do candidato durante a entrevista (Fase 3).
//
// Requeremos o arquivo interno do pdf-parse (lib/pdf-parse.js) em vez do index.js
// para evitar o bloco de "debug" do pacote, que tenta ler um PDF de teste no disco.

const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const MAX_CARACTERES = 20000;

// Recebe um Buffer do PDF e devolve o texto extraido (truncado).
// Em caso de PDF ilegivel/protegido, devolve string vazia (nao quebra a candidatura).
async function extrairTextoPdf(buffer) {
  try {
    const dados = await pdfParse(buffer);
    const texto = (dados.text || '').replace(/\s+\n/g, '\n').trim();
    return texto.slice(0, MAX_CARACTERES);
  } catch (err) {
    console.error('[curriculo] falha ao extrair texto do PDF:', err.message);
    return '';
  }
}

module.exports = { extrairTextoPdf, MAX_CARACTERES };
