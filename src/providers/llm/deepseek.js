'use strict';

// Adaptador LLM: DeepSeek (endpoint compativel com a API da OpenAI).
// Chamado apenas quando INTERVIEW_MOCK=false.
//
// Contrato: completar(mensagens, opcoes) -> { texto, modelo, uso }
//   mensagens: [{ papel: 'system'|'user'|'assistant', conteudo: string }]
//   opcoes:    { modelo?, temperatura?, maxTokens? }

const { config } = require('../../config');

async function completar(mensagens, opcoes = {}) {
  const cfg = config.provedores.llm.deepseek;
  if (!cfg.apiKey) {
    throw new Error('DEEPSEEK_API_KEY ausente. Defina a chave no .env para usar o LLM DeepSeek.');
  }

  const modelo = opcoes.modelo || config.provedores.llm.modelo || cfg.modelo;
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const messages = (mensagens || []).map((m) => ({ role: m.papel, content: m.conteudo }));

  const corpo = {
    model: modelo,
    messages,
    temperature: opcoes.temperatura != null ? opcoes.temperatura : 0.7,
    max_tokens: opcoes.maxTokens != null ? opcoes.maxTokens : 1024,
    // deepseek-v4-flash tem "thinking mode" ligado por padrao, o que pode deixar
    // message.content vazio (o texto sai em reasoning_content). Para o motor de
    // entrevista queremos a resposta direta — desabilitamos o thinking.
    // Doc: https://api-docs.deepseek.com/guides/thinking_mode
    thinking: { type: 'disabled' },
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(corpo),
    });
  } catch (err) {
    throw new Error(`Falha de rede ao chamar o LLM DeepSeek: ${err.message}`);
  }

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error(`LLM DeepSeek retornou erro ${resp.status}: ${detalhe.slice(0, 300)}`);
  }

  const dados = await resp.json();
  const mensagem =
    dados.choices && dados.choices[0] && dados.choices[0].message
      ? dados.choices[0].message
      : {};

  let texto = mensagem.content || '';

  // Rede de seguranca: com thinking desabilitado isso nao deveria ocorrer, mas
  // se o content vier vazio e houver reasoning_content, usamos como fallback
  // (evita silencio total caso a API mude de comportamento no futuro).
  if (!texto && mensagem.reasoning_content) {
    console.warn(
      '[llm/deepseek] content veio vazio; usando reasoning_content como fallback ' +
        '(verifique se o thinking mode foi mesmo desabilitado).',
    );
    texto = mensagem.reasoning_content;
  }

  return { texto, modelo, uso: dados.usage || null };
}

module.exports = { completar };
