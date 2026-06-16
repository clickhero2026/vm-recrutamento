'use strict';

// Popula o banco com dados de exemplo: 1 roteiro (SDR) + 1 vaga ativa (SDR).
// Espelha a secao 8 do PLANEJAMENTO_IMPLEMENTACAO.md (roteiro orientado a dados).
// Idempotente: se a vaga/roteiro ja existirem (por slug/nome), nao duplica.

const { migrar } = require('./migrate');
const db = require('./index');

// Roteiro SDR (estrutura JSON: abertura + competencias + fechamento + rubrica)
const ROTEIRO_SDR = {
  nome: 'SDR - Padrao v1',
  perfil: 'SDR',
  versao: 1,
  estrutura: {
    perfil: 'SDR',
    blocos: {
      abertura: [
        'O que te atrai em trabalhar com vendas?',
        'Conte rapidamente sua experiencia mais recente na area.',
      ],
      competencias: [
        {
          nome: 'Resiliencia/volume',
          peso: 2,
          pergunta_semente:
            'Conte um dia de muitas tentativas e poucos retornos. Como manteve o ritmo?',
          boa_resposta:
            'Demonstra constancia, metodo para manter ritmo e nao terceiriza a culpa.',
        },
        {
          nome: 'Abordagem/comunicacao',
          peso: 1,
          pergunta_semente: 'Como aborda um lead frio nos primeiros 30 segundos?',
          boa_resposta:
            'Tem abertura clara, gera valor rapido e desperta interesse sem ser invasivo.',
        },
        {
          nome: 'Qualificacao',
          peso: 2,
          pergunta_semente:
            'Quando percebeu que um lead nao era qualificado? Como concluiu isso?',
          boa_resposta:
            'Usa criterios (ex.: BANT/perfil), faz perguntas certas e decide com objetividade.',
        },
        {
          nome: 'Organizacao/CRM',
          peso: 1,
          pergunta_semente:
            'Como se organiza para nao perder follow-ups? Que ferramentas usa?',
          boa_resposta: 'Tem rotina, cadencia e usa CRM/ferramentas de forma disciplinada.',
        },
      ],
      fechamento: [
        'Disponibilidade de inicio.',
        'Expectativa de remuneracao/comissao.',
        'Por que deveriamos te escolher?',
      ],
    },
    rubrica: {
      escala: '1-5',
      saida: 'nota + justificativa curta por competencia, mais resumo e pontos de atencao',
    },
  },
};

const VAGA_SDR = {
  slug: 'sdr-prevendas',
  titulo: 'SDR / Pre-vendas',
  perfil: 'SDR',
  faixa_pagamento: 'R$ 2.000 fixo + comissoes (OTE ate R$ 4.500)',
  skills: ['Prospeccao ativa', 'Qualificacao de leads', 'CRM', 'Resiliencia', 'Cadencia de follow-up'],
  descricao:
    'Buscamos um SDR para prospeccao e qualificacao de leads, com ritmo, organizacao e ' +
    'resiliencia. Voce sera a primeira voz do cliente e a porta de entrada do nosso funil.',
  sobre_empresa:
    'Somos uma operacao comercial orientada a metodo e performance. Aqui vendas e' +
    ' levado a serio: processo claro, ferramentas boas e cultura de alta exigencia.',
  ativo: true,
};

function semear() {
  migrar(); // garante que as tabelas existam

  // Roteiro (idempotente por nome)
  let roteiro = db.obterRoteiroPorNome(ROTEIRO_SDR.nome);
  let roteiroId;
  if (roteiro) {
    roteiroId = roteiro.id;
    console.log(`[seed] roteiro "${ROTEIRO_SDR.nome}" ja existe (id=${roteiroId}).`);
  } else {
    roteiroId = db.criarRoteiro(ROTEIRO_SDR);
    console.log(`[seed] roteiro criado (id=${roteiroId}).`);
  }

  // Vaga (idempotente por slug)
  const existente = db.obterVagaPorSlug(VAGA_SDR.slug);
  if (existente) {
    console.log(`[seed] vaga "${VAGA_SDR.slug}" ja existe (id=${existente.id}).`);
    return { roteiroId, vagaId: existente.id };
  }

  const vagaId = db.criarVaga({ ...VAGA_SDR, roteiro_id: roteiroId });
  console.log(`[seed] vaga criada (id=${vagaId}, slug=${VAGA_SDR.slug}).`);
  return { roteiroId, vagaId };
}

if (require.main === module) {
  try {
    const { roteiroId, vagaId } = semear();
    console.log(`[seed] concluido. roteiro_id=${roteiroId}, vaga_id=${vagaId}`);
  } catch (err) {
    console.error('[seed] falha:', err.message);
    process.exit(1);
  }
}

module.exports = { semear, ROTEIRO_SDR, VAGA_SDR };
