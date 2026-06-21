'use strict';

// Adaptador de e-mail: Resend (https://resend.com).
// Implementado na Fase 4 (relatorio + envio ao recrutador).
//
// Contrato (posicional, consistente com llm/stt/tts):
//   enviar(destinatario, assunto, html) -> Promise<{ id }>
//
// Le RESEND_API_KEY (chave) e o remetente (RESEND_FROM_EMAIL) via config.

const { config } = require('../../config');

async function enviar(destinatario, assunto, html) {
  const cfg = config.provedores.email;
  if (!cfg.resend.apiKey) {
    throw new Error('RESEND_API_KEY ausente. Defina a chave no .env para enviar e-mail via Resend.');
  }
  if (!destinatario) {
    throw new Error('Destinatario de e-mail ausente (verifique RECRUITER_EMAIL no .env).');
  }

  let resp;
  try {
    resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.resend.apiKey}`,
      },
      body: JSON.stringify({
        from: cfg.remetente,
        to: destinatario,
        subject: assunto,
        html,
      }),
    });
  } catch (err) {
    throw new Error(`Falha de rede ao enviar e-mail via Resend: ${err.message}`);
  }

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error(`Resend retornou erro ${resp.status}: ${detalhe.slice(0, 300)}`);
  }

  const dados = await resp.json().catch(() => ({}));
  return { id: dados.id || null };
}

module.exports = { enviar };
