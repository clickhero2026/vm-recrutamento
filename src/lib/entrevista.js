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

// Audio mock da fala da Vera (substituido por TTS real na Fase 3-real).
const AUDIO_MOCK = '/assets/mock-fala.wav';

const FALA_FECHAMENTO =
  'Obrigada pelas suas respostas! Por aqui encerramos a entrevista. ' +
  'Vamos analisar tudo e a equipe de recrutamento entra em contato. Ate breve!';

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
function payloadPergunta({ interviewId, perguntas, indice, audioUrl }) {
  const p = perguntas[indice];
  return {
    ok: true,
    interview_id: interviewId,
    indice,
    total: perguntas.length,
    topico_atual: p.topico,
    topicos: estadoTopicos(perguntas, indice),
    pergunta: p.texto,
    audio_url: audioUrl,
    encerrar: false,
  };
}

module.exports = {
  AUDIO_MOCK,
  FALA_FECHAMENTO,
  montarPerguntas,
  topicosUnicos,
  estadoTopicos,
  payloadPergunta,
};
