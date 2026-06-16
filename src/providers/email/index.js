'use strict';

// Interface de e-mail (envio do relatorio ao recrutador). Agnostica.
// Na v1 o provedor e o Resend; mantemos a abstracao para trocar sem reescrever.
//
// Contrato:
//   enviar(destinatario, assunto, html) -> Promise<{ id }>
//
// Fase 0: roteia para o stub do Resend.

const adaptadores = {
  resend: () => require('./resend'),
};

function selecionar() {
  const nome = 'resend'; // unico provedor de e-mail na v1
  return adaptadores[nome]();
}

async function enviar(destinatario, assunto, html) {
  return selecionar().enviar(destinatario, assunto, html);
}

module.exports = { enviar, selecionar };
