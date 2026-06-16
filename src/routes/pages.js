'use strict';

// Rotas de PAGINA (HTML). Na Fase 0 sao placeholders que ja aplicam o layout base
// (cabeçalho, fontes, cores, botao laranja) e, onde faz sentido, a barra de progresso
// e o orbe. O conteudo funcional de cada tela entra nas Fases 1-4.

const express = require('express');
const db = require('../db');
const { pagina, escapeHtml } = require('../views');

const router = express.Router();

// Total de etapas do funil (telas 1-11) para calcular o progresso.
const TOTAL_ETAPAS = 11;
function progresso(etapa) {
  return { pct: (etapa / TOTAL_ETAPAS) * 100, label: `Etapa ${etapa} de ${TOTAL_ETAPAS}` };
}

// Botao primario (laranja) que leva a proxima tela.
function botao(href, texto, variante = 'primario') {
  return `<a class="vm-btn vm-btn--${variante}" href="${href}">${escapeHtml(texto)}</a>`;
}

// Bloco de placeholder padrao para as telas ainda nao implementadas.
function placeholder({ kicker, titulo, descricao, acao }) {
  return `
    <section class="vm-hero">
      ${kicker ? `<p class="vm-kicker">${escapeHtml(kicker)}</p>` : ''}
      <h1 class="vm-title">${escapeHtml(titulo)}</h1>
      <p class="vm-lead">${escapeHtml(descricao)}</p>
      <p class="vm-badge-fase">Placeholder · Fase 0</p>
      ${acao || ''}
    </section>`;
}

// ── Home / landing ──
router.get('/', (req, res) => {
  const vaga = db.obterVagaAtiva();
  const acao = vaga
    ? botao(`/vaga/${vaga.slug}`, 'Ver vaga aberta')
    : `<p class="vm-lead">Nenhuma vaga ativa no momento. Rode <code>npm run seed</code>.</p>`;
  res.send(
    pagina({
      titulo: 'Recrutamento de vendedores',
      tema: 'escuro',
      comOrbe: true,
      conteudo: placeholder({
        kicker: 'Vendedor Mestre',
        titulo: 'Recrutamento de elite para vendas',
        descricao:
          'Processo seletivo com entrevista conduzida pela agente Vera. Preto como forca, laranja como fogo.',
        acao,
      }),
    }),
  );
});

// ── Tela 1: Vaga ──
router.get('/vaga/:slug', (req, res) => {
  const vaga = db.obterVagaPorSlug(req.params.slug);
  if (!vaga) {
    return res
      .status(404)
      .send(
        pagina({
          titulo: 'Vaga nao encontrada',
          tema: 'claro',
          conteudo: placeholder({
            titulo: 'Vaga nao encontrada',
            descricao: 'O link da vaga pode estar incorreto ou a vaga foi encerrada.',
            acao: botao('/', 'Voltar ao inicio', 'secundario'),
          }),
        }),
      );
  }

  const chips = (vaga.skills || [])
    .map((s) => `<span class="vm-chip">${escapeHtml(s)}</span>`)
    .join('');

  const conteudo = `
    <section class="vm-hero">
      <p class="vm-kicker">Vaga aberta · Perfil ${escapeHtml(vaga.perfil)}</p>
      <h1 class="vm-title">${escapeHtml(vaga.titulo)}</h1>
      ${vaga.faixa_pagamento ? `<p class="vm-pay">${escapeHtml(vaga.faixa_pagamento)}</p>` : ''}
      ${vaga.descricao ? `<p class="vm-lead">${escapeHtml(vaga.descricao)}</p>` : ''}
      ${chips ? `<div class="vm-chips" aria-label="Skills exigidas">${chips}</div>` : ''}
      ${
        vaga.sobre_empresa
          ? `<div class="vm-card"><h2 class="vm-h2">Sobre a empresa</h2><p>${escapeHtml(vaga.sobre_empresa)}</p></div>`
          : ''
      }
      ${botao(`/aplicar/${vaga.slug}`, 'Aplicar agora')}
    </section>`;

  res.send(pagina({ titulo: vaga.titulo, tema: 'claro', conteudo }));
});

// ── Tela 2: Aplicacao ──
router.get('/aplicar/:slug', (req, res) => {
  const vaga = db.obterVagaPorSlug(req.params.slug);
  const titulo = vaga ? `Aplicar — ${vaga.titulo}` : 'Aplicar';
  res.send(
    pagina({
      titulo,
      tema: 'claro',
      progresso: progresso(2),
      conteudo: placeholder({
        kicker: vaga ? `Vaga: ${vaga.titulo}` : 'Aplicacao',
        titulo: 'Aplicacao em 2 passos',
        descricao:
          'Passo 1: dados + currículo (PDF). Passo 2: perguntas extras de vendas. Formulario chega na Fase 1.',
        acao: botao('/preparacao', 'Continuar'),
      }),
    }),
  );
});

// ── Tela 3: Preparacao ──
router.get('/preparacao', (req, res) => {
  res.send(
    pagina({
      titulo: 'Preparacao para a entrevista',
      tema: 'claro',
      progresso: progresso(3),
      conteudo: placeholder({
        kicker: 'Antes de comecar',
        titulo: 'Preparacao para a entrevista',
        descricao:
          'Duracao estimada, topicos abordados e dicas (lugar silencioso, internet estavel). Nao atualize a pagina durante a entrevista.',
        acao: botao('/instrucoes', 'Continuar'),
      }),
    }),
  );
});

// ── Tela 4: Identificacao (fallback) ──
router.get('/identificacao', (req, res) => {
  res.send(
    pagina({
      titulo: 'Identificacao',
      tema: 'claro',
      progresso: { pct: 33, label: 'Etapa 1 de 3' },
      conteudo: placeholder({
        kicker: 'Retomar aplicacao',
        titulo: 'Informe seus dados',
        descricao:
          'Aparece apenas quando voce volta depois (sem sessao ativa). Recupera sua aplicacao por e-mail e telefone.',
        acao: botao('/preparacao', 'Continuar'),
      }),
    }),
  );
});

// ── Tela 5: Instrucoes ──
router.get('/instrucoes', (req, res) => {
  res.send(
    pagina({
      titulo: 'Instrucoes da entrevista',
      tema: 'escuro',
      progresso: progresso(5),
      conteudo: placeholder({
        kicker: 'Regras',
        titulo: 'Instrucoes da entrevista',
        descricao:
          'A entrevista e gravada em audio para avaliacao. Use push-to-talk para responder. Sem compartilhamento de tela.',
        acao: botao('/permissao-camera', 'Pode comecar, iniciar entrevista'),
      }),
    }),
  );
});

// ── Tela 6: Permissao de camera ──
router.get('/permissao-camera', (req, res) => {
  res.send(
    pagina({
      titulo: 'Permissao de camera',
      tema: 'escuro',
      progresso: progresso(6),
      conteudo: placeholder({
        kicker: 'Camera (opcional)',
        titulo: 'Permissao de camera',
        descricao:
          'A camera e opcional (so presenca, nao grava video) e pode ser pulada no celular. getUserMedia chega na Fase 2.',
        acao: botao('/teste-camera', 'Permitir e continuar'),
      }),
    }),
  );
});

// ── Tela 7: Teste de camera ──
router.get('/teste-camera', (req, res) => {
  res.send(
    pagina({
      titulo: 'Teste de camera',
      tema: 'escuro',
      progresso: progresso(7),
      conteudo: placeholder({
        kicker: 'Camera',
        titulo: 'Teste de camera',
        descricao: 'Preview da camera e confirmacao. Funcionalidade chega na Fase 2.',
        acao: botao('/permissao-microfone', 'Continuar'),
      }),
    }),
  );
});

// ── Tela 8: Permissao de microfone ──
router.get('/permissao-microfone', (req, res) => {
  res.send(
    pagina({
      titulo: 'Permissao de microfone',
      tema: 'escuro',
      progresso: progresso(8),
      conteudo: placeholder({
        kicker: 'Microfone',
        titulo: 'Permissao de microfone',
        descricao: 'Necessario para a entrevista por audio. getUserMedia chega na Fase 2.',
        acao: botao('/teste-microfone', 'Permitir e continuar'),
      }),
    }),
  );
});

// ── Tela 9: Teste de microfone ──
router.get('/teste-microfone', (req, res) => {
  res.send(
    pagina({
      titulo: 'Teste de microfone',
      tema: 'escuro',
      progresso: progresso(9),
      conteudo: placeholder({
        kicker: 'Microfone',
        titulo: 'Teste de microfone',
        descricao:
          'Fale a frase de teste, confira o nivel e aceite os termos. Funcionalidade chega na Fase 2.',
        acao: botao('/entrevista', 'Verificacao concluida, continuar'),
      }),
    }),
  );
});

// ── Tela 10: Entrevista ──
router.get('/entrevista', (req, res) => {
  res.send(
    pagina({
      titulo: 'Entrevista',
      tema: 'escuro',
      comOrbe: true,
      progresso: progresso(10),
      conteudo: placeholder({
        kicker: 'Agente Vera',
        titulo: 'Area de entrevista',
        descricao:
          'Loop de audio push-to-talk com a Vera (pergunta, ouve, gera a proxima pergunta). Motor chega na Fase 3.',
        acao: botao('/finalizacao', 'Encerrar (placeholder)', 'secundario'),
      }),
    }),
  );
});

// ── Tela 11: Finalizacao ──
router.get('/finalizacao', (req, res) => {
  res.send(
    pagina({
      titulo: 'Entrevista concluida',
      tema: 'escuro',
      comOrbe: true,
      progresso: progresso(11),
      conteudo: placeholder({
        kicker: 'Tudo certo',
        titulo: 'Entrevista concluida',
        descricao:
          'Geramos o relatorio e enviamos ao recrutador. Geracao + envio (Resend) chegam na Fase 4.',
        acao: botao('/', 'Voltar ao inicio', 'secundario'),
      }),
    }),
  );
});

module.exports = router;
