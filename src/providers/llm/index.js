'use strict';

// Interface de LLM (agnostica). O app chama llm.completar(...) sem saber qual
// provedor esta por tras. A selecao vem de env (LLM_PROVIDER).
//
// Contrato:
//   completar(mensagens, opcoes) -> Promise<{ texto, modelo, uso }>
//     mensagens: [{ papel: 'system'|'user'|'assistant', conteudo: string }]
//     opcoes:    { modelo?, temperatura?, maxTokens? }
//
// Fase 0: apenas roteia para o stub correspondente (que lanca "nao implementado").

const { config } = require('../../config');

const adaptadores = {
  openrouter: () => require('./openrouter'),
  anthropic: () => require('./anthropic'),
};

function selecionar() {
  const nome = config.provedores.llm.nome;
  const carregar = adaptadores[nome];
  if (!carregar) {
    throw new Error(
      `LLM_PROVIDER invalido: "${nome}". Use: ${Object.keys(adaptadores).join(' | ')}.`,
    );
  }
  return carregar();
}

async function completar(mensagens, opcoes = {}) {
  return selecionar().completar(mensagens, opcoes);
}

module.exports = { completar, selecionar };
