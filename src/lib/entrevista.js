'use strict';

// Motor de entrevista (orientado a dados pelo roteiro).
//
// Fase 3C (mock): monta a sequencia de perguntas a partir do roteiro e caminha
// por ela sem chamar STT/LLM/TTS (custo zero). O audio e um arquivo estatico.
//
// Fase 3-real (futuro): trocar o mock por:
//   - STT: transcrever o audio do candidato (providers/stt)
//   - LLM: gerar a proxima pergunta referenciando a resposta + curriculo (providers/llm)
//   - TTS: sintetizar a fala da Vera (providers/tts) e servir o audio
// O contrato de payload abaixo NAO muda — so a origem dos dados.

// Audio mock da fala da Vera (usado quando INTERVIEW_MOCK=true).
const AUDIO_MOCK = '/assets/mock-fala.wav';

const FALA_FECHAMENTO =
  'Obrigada pelas suas respostas! Por aqui encerramos a entrevista. ' +
  'Vamos analisar tudo e a equipe de recrutamento entra em contato. Ate breve!';

// Marcador que o LLM adiciona ao FINAL da fala quando decide encerrar.
const MARCADOR_ENCERRAR = '[ENCERRAR]';

// Frase fixa quando o STT nao entende o audio (TTS gerado e cacheado uma vez).
const FRASE_NAO_OUVI = 'Desculpe, nao consegui ouvir direito. Pode repetir, por favor?';

// Trunca texto preservando o inicio (suficiente para contexto sem estourar tokens).
function truncar(texto, max) {
  const t = String(texto || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// Promise com timeout: rejeita se a chamada externa demorar demais (best-effort:
// limita a resposta HTTP; o socket subjacente pode ser descartado pelo runtime).
function comTimeout(promessa, ms, nome) {
  return Promise.race([
    promessa,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`Tempo esgotado ao chamar ${nome} (> ${ms}ms).`)), ms),
    ),
  ]);
}

// Monta o system prompt da Vera a partir do roteiro (dados) + resumo do curriculo.
function montarSystemPrompt({ roteiro, curriculoTexto, agente, maxPerguntas }) {
  const blocos = (roteiro && roteiro.estrutura && roteiro.estrutura.blocos) || {};
  const rubrica = (roteiro && roteiro.estrutura && roteiro.estrutura.rubrica) || {};
  const competencias = (blocos.competencias || [])
    .map((c) => `- ${c.nome} (peso ${c.peso || 1}): ${c.pergunta_semente || ''}`)
    .join('\n');
  const fechamento = (blocos.fechamento || []).map((q) => `- ${q}`).join('\n');
  const curriculo = truncar(curriculoTexto, 3000);

  return [
    `Voce e ${agente || 'Vera'}, uma entrevistadora de recrutamento de vendedores, em portugues do Brasil.`,
    'Conduza uma entrevista por audio, com tom profissional, direto e acolhedor.',
    '',
    'REGRAS IMPORTANTES:',
    '1. Faca UMA pergunta por vez (curta e clara, falavel em voz alta).',
    '2. Referencie o que o candidato acabou de dizer antes de fazer a proxima pergunta.',
    '3. Cubra a proxima competencia pendente do roteiro (na ordem, sem repetir as ja cobertas).',
    `4. Quando ja tiver coberto as competencias OU atingido ${maxPerguntas} perguntas, faca uma fala de encerramento e adicione, na ULTIMA linha, exatamente o marcador ${MARCADOR_ENCERRAR}.`,
    `5. Use o marcador ${MARCADOR_ENCERRAR} APENAS na fala final de encerramento, nunca antes.`,
    '6. Nao invente informacoes do candidato; baseie-se no curriculo e nas respostas.',
    '',
    'COMPETENCIAS A AVALIAR (roteiro):',
    competencias || '- (roteiro sem competencias definidas)',
    '',
    'FECHAMENTO (temas finais, antes de encerrar):',
    fechamento || '- disponibilidade, pretensao, por que te escolher',
    '',
    `RUBRICA: escala ${rubrica.escala || '1-5'} por competencia.`,
    '',
    'RESUMO DO CURRICULO DO CANDIDATO (para contexto):',
    curriculo || '(curriculo nao disponivel)',
  ].join('\n');
}

// Monta as mensagens para o LLM: system + (resumo dos turns antigos) + ultimos N turns.
//   turns: [{ autor: 'agente'|'candidato', texto }] em ordem
function montarMensagensLLM({ systemPrompt, turns, recentes }) {
  const mensagens = [{ papel: 'system', conteudo: systemPrompt }];
  const lista = turns || [];

  if (lista.length > recentes) {
    const antigos = lista.slice(0, lista.length - recentes);
    const resumo = antigos
      .map((t) => `${t.autor === 'agente' ? 'Vera' : 'Candidato'}: ${truncar(t.texto, 240)}`)
      .join('\n');
    mensagens.push({
      papel: 'system',
      conteudo: `RESUMO DOS TURNOS ANTERIORES (mais antigos):\n${resumo}`,
    });
  }

  for (const t of lista.slice(-recentes)) {
    mensagens.push({
      papel: t.autor === 'agente' ? 'assistant' : 'user',
      conteudo: t.texto || '',
    });
  }
  return mensagens;
}

// Separa o marcador de encerramento da fala da Vera.
function extrairEncerrar(texto) {
  const t = String(texto || '');
  if (t.includes(MARCADOR_ENCERRAR)) {
    return { texto: t.split(MARCADOR_ENCERRAR).join('').trim(), encerrar: true };
  }
  return { texto: t.trim(), encerrar: false };
}

// Monta a lista linear de perguntas a partir do roteiro (abertura + competencias + fechamento).
function montarPerguntas(roteiro) {
  const blocos = (roteiro && roteiro.estrutura && roteiro.estrutura.blocos) || {};
  const perguntas = [];

  for (const q of blocos.abertura || []) {
    perguntas.push({ fase: 'abertura', topico: 'Abertura', texto: q });
  }
  for (const c of blocos.competencias || []) {
    perguntas.push({
      fase: 'competencia',
      topico: c.nome,
      texto: c.pergunta_semente || `Conte sobre ${c.nome}.`,
    });
  }
  for (const q of blocos.fechamento || []) {
    perguntas.push({ fase: 'fechamento', topico: 'Fechamento', texto: q });
  }

  // Fallback minimo caso o roteiro venha vazio.
  if (!perguntas.length) {
    perguntas.push({ fase: 'abertura', topico: 'Abertura', texto: 'Conte sobre sua experiencia em vendas.' });
  }
  return perguntas;
}

// Lista ordenada de topicos unicos (para os chips de progresso).
function topicosUnicos(perguntas) {
  const vistos = [];
  for (const p of perguntas) if (!vistos.includes(p.topico)) vistos.push(p.topico);
  return vistos;
}

// Estado de cada topico em relacao a pergunta atual (para os chips).
function estadoTopicos(perguntas, indice) {
  const unicos = topicosUnicos(perguntas);
  const topicoAtual = perguntas[indice] ? perguntas[indice].topico : null;
  const posAtual = unicos.indexOf(topicoAtual);
  return unicos.map((nome, i) => ({
    nome,
    estado: i < posAtual ? 'concluido' : i === posAtual ? 'atual' : 'futuro',
  }));
}

// Monta o payload de uma pergunta (contrato consumido pelo front).
// O progresso/chips e derivado pela POSICAO (indice), tanto no mock quanto no real
// — no modo real o texto vem do LLM, mas os chips avancam pela contagem de turnos.
function montarPayload({ interviewId, perguntas, indice, texto, audioUrl, encerrar = false }) {
  const idxChips = Math.min(indice, perguntas.length - 1);
  return {
    ok: true,
    interview_id: interviewId,
    indice,
    total: perguntas.length,
    topico_atual: perguntas[idxChips] ? perguntas[idxChips].topico : null,
    topicos: estadoTopicos(perguntas, idxChips),
    pergunta: texto,
    audio_url: audioUrl,
    encerrar,
  };
}

function payloadPergunta({ interviewId, perguntas, indice, audioUrl }) {
  return montarPayload({
    interviewId,
    perguntas,
    indice,
    texto: perguntas[indice].texto,
    audioUrl,
  });
}

module.exports = {
  AUDIO_MOCK,
  FALA_FECHAMENTO,
  MARCADOR_ENCERRAR,
  FRASE_NAO_OUVI,
  montarPerguntas,
  topicosUnicos,
  estadoTopicos,
  payloadPergunta,
  montarPayload,
  truncar,
  comTimeout,
  montarSystemPrompt,
  montarMensagensLLM,
  extrairEncerrar,
};
