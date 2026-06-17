'use strict';

// Rotas de PAGINA (HTML). Na Fase 0 sao placeholders que ja aplicam o layout base
// (cabeçalho, fontes, cores, botao laranja) e, onde faz sentido, a barra de progresso
// e o orbe. O conteudo funcional de cada tela entra nas Fases 1-4.

const express = require('express');
const db = require('../db');
const session = require('../lib/session');
const { pagina, escapeHtml } = require('../views');

const router = express.Router();

// Botao primario (laranja) que leva a proxima tela.
function botao(href, texto, variante = 'primario') {
  return `<a class="vm-btn vm-btn--${variante}" href="${href}">${escapeHtml(texto)}</a>`;
}

// Gate de sessao: o middleware vive em lib/session.js (session.exigirCandidato).
const { exigirCandidato } = session;

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
    <article class="vm-vaga">
      <p class="vm-kicker">Vaga aberta · Perfil ${escapeHtml(vaga.perfil)}</p>
      <h1 class="vm-title">${escapeHtml(vaga.titulo)}</h1>
      ${
        vaga.faixa_pagamento
          ? `<p class="vm-pay-chip">${escapeHtml(vaga.faixa_pagamento)}</p>`
          : ''
      }
      ${vaga.descricao ? `<p class="vm-lead">${escapeHtml(vaga.descricao)}</p>` : ''}
      ${
        chips
          ? `<section class="vm-secao">
              <h2 class="vm-h2">Competências exigidas</h2>
              <div class="vm-chips">${chips}</div>
            </section>`
          : ''
      }
      ${
        vaga.sobre_empresa
          ? `<section class="vm-secao">
              <h2 class="vm-h2">Sobre a empresa</h2>
              <div class="vm-card"><p>${escapeHtml(vaga.sobre_empresa)}</p></div>
            </section>`
          : ''
      }
    </article>
    <div class="vm-cta-fixa">
      ${botao(`/aplicar/${vaga.slug}`, 'Aplicar')}
    </div>`;

  res.send(pagina({ titulo: vaga.titulo, tema: 'claro', conteudo }));
});

// ── Tela 2: Aplicacao (2 passos em um unico template, troca via JS) ──
function stepper(nome, valor, min, max, sufixo = '') {
  return `
    <div class="vm-stepper" data-stepper>
      <button type="button" class="vm-stepper__btn" data-acao="menos" aria-label="Diminuir">−</button>
      <input class="vm-stepper__input" type="number" name="${nome}" value="${valor}"
             min="${min}" max="${max}" inputmode="numeric" readonly>
      ${sufixo ? `<span class="vm-stepper__sufixo">${escapeHtml(sufixo)}</span>` : ''}
      <button type="button" class="vm-stepper__btn" data-acao="mais" aria-label="Aumentar">+</button>
    </div>`;
}

function formularioAplicacao(vaga) {
  const opcoesDdi = [
    ['+55', 'Brasil +55'],
    ['+1', 'EUA/Canadá +1'],
    ['+351', 'Portugal +351'],
    ['+44', 'Reino Unido +44'],
    ['+34', 'Espanha +34'],
  ]
    .map(
      ([v, rotulo], i) =>
        `<option value="${v}"${i === 0 ? ' selected' : ''}>${escapeHtml(rotulo)}</option>`,
    )
    .join('');

  const segmentos = ['B2B', 'B2C', 'Ambos']
    .map(
      (s) =>
        `<button type="button" class="vm-opcao" data-opcao data-grupo="segmento" data-valor="${s}">${s}</button>`,
    )
    .join('');

  return `
  <form id="form-aplicacao" class="vm-form" enctype="multipart/form-data" novalidate>
    <input type="hidden" name="slug" value="${escapeHtml(vaga.slug)}">
    <input type="hidden" name="segmento" value="">

    <p class="vm-form-erro" data-erro hidden role="alert"></p>

    <!-- PASSO 1 -->
    <section class="vm-passo" data-passo="1">
      <h1 class="vm-title">Candidate-se agora</h1>
      <p class="vm-lead">Vaga: ${escapeHtml(vaga.titulo)}</p>

      <div class="vm-grid2">
        <label class="vm-campo">Nome
          <input type="text" name="nome" autocomplete="given-name" required>
        </label>
        <label class="vm-campo">Sobrenome
          <input type="text" name="sobrenome" autocomplete="family-name" required>
        </label>
      </div>

      <label class="vm-campo">E-mail
        <input type="email" name="email" autocomplete="email" required>
      </label>

      <div class="vm-campo">Telefone
        <div class="vm-tel">
          <select name="ddi" aria-label="Código do país">${opcoesDdi}</select>
          <input type="tel" name="telefone" inputmode="tel" placeholder="(11) 90000-0000" required>
        </div>
      </div>

      <label class="vm-campo">Cidade <span class="vm-opcional">(opcional)</span>
        <input type="text" name="cidade" autocomplete="address-level2">
      </label>

      <label class="vm-campo">URL do LinkedIn
        <input type="url" name="linkedin_url" placeholder="https://linkedin.com/in/...">
      </label>

      <div class="vm-campo">Currículo (PDF)
        <label class="vm-upload" data-upload>
          <input type="file" name="curriculo" accept="application/pdf,.pdf" hidden>
          <span class="vm-upload__icone" aria-hidden="true">⬆</span>
          <span class="vm-upload__texto" data-upload-texto>Clique para enviar ou arraste seu PDF aqui</span>
          <span class="vm-upload__dica">Somente .pdf · até 10 MB</span>
        </label>
      </div>

      <button type="button" class="vm-btn vm-btn--primario" data-proximo>Próximo</button>
      <p class="vm-rodape-nota">
        Ao se candidatar, seus dados entram em nosso banco de talentos e podem ser usados para
        esta e futuras oportunidades de vendas. Você pode solicitar a remoção a qualquer momento.
      </p>
    </section>

    <!-- PASSO 2 -->
    <section class="vm-passo" data-passo="2" hidden>
      <h1 class="vm-title">Responda algumas perguntas para concluir sua candidatura</h1>

      <div class="vm-campo">Anos de experiência em vendas
        ${stepper('anos_experiencia', 0, 0, 50, 'anos')}
      </div>

      <div class="vm-campo">Segmento principal
        <div class="vm-opcoes" data-grupo-opcoes="segmento">${segmentos}</div>
      </div>

      <label class="vm-campo">Ferramentas de CRM que domina
        <input type="text" name="crm" placeholder="Ex.: HubSpot, Salesforce, Pipedrive">
      </label>

      <label class="vm-campo">Pretensão de remuneração (R$ fixo + variável/comissão)
        <span class="vm-moeda">
          <span class="vm-moeda__prefixo" aria-hidden="true">R$</span>
          <input type="text" name="pretensao" data-moeda
            placeholder="Ex.: 2.500 fixo + comissão (OTE 5k)">
        </span>
      </label>

      <div class="vm-campo">Disponibilidade para início
        ${stepper('disponibilidade_dias', 15, 0, 180, 'dias')}
      </div>

      <div class="vm-campo">Horas por semana disponíveis
        ${stepper('horas_semana', 40, 1, 80, 'h/sem')}
      </div>

      <div class="vm-acoes">
        <button type="button" class="vm-btn vm-btn--secundario" data-voltar>Voltar</button>
        <button type="submit" class="vm-btn vm-btn--primario" data-enviar>Candidatar-me</button>
      </div>
    </section>
  </form>`;
}

router.get('/aplicar/:slug', (req, res) => {
  const vaga = db.obterVagaPorSlug(req.params.slug);
  if (!vaga) {
    return res.status(404).send(
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

  res.send(
    pagina({
      titulo: `Candidatar-se — ${vaga.titulo}`,
      tema: 'claro',
      etapa: 1,
      conteudo: formularioAplicacao(vaga),
    }),
  );
});

// Resolve a vaga + roteiro do candidato (pela sessao) ou da vaga ativa.
function vagaERoteiroDaSessao(req) {
  const candidato = req.candidato || session.loadCandidato(req);
  const vaga = candidato ? db.obterVaga(candidato.job_id) : db.obterVagaAtiva();
  const roteiro = vaga && vaga.roteiro_id ? db.obterRoteiro(vaga.roteiro_id) : null;
  return { candidato, vaga, roteiro };
}

// Estima a duracao (faixa em minutos) a partir do roteiro (orientado a dados).
function estimarDuracao(roteiro) {
  const blocos = (roteiro && roteiro.estrutura && roteiro.estrutura.blocos) || {};
  const n =
    (blocos.abertura || []).length +
    (blocos.competencias || []).length +
    (blocos.fechamento || []).length;
  const perguntas = n || (blocos.competencias || []).length || 6;
  const min = Math.max(10, Math.round(perguntas * 1.5));
  const max = Math.round(perguntas * 2);
  return { min, max };
}

// ── Tela 3: Preparacao (protegida) ──
router.get('/preparacao', exigirCandidato, (req, res) => {
  const { candidato, vaga, roteiro } = vagaERoteiroDaSessao(req);
  const tituloVaga = vaga ? vaga.titulo : 'em aberto';
  const { min, max } = estimarDuracao(roteiro);

  const competencias = (roteiro && roteiro.estrutura && roteiro.estrutura.blocos
    ? roteiro.estrutura.blocos.competencias
    : []) || [];
  const chipsTopicos = competencias.length
    ? competencias
        .map((c) => `<span class="vm-chip">${escapeHtml(c.nome)}</span>`)
        .join('')
    : '<span class="vm-chip">Experiência e fechamento em vendas</span>';

  const conteudo = `
    <section class="vm-hero">
      ${candidato ? `<p class="vm-kicker">Olá, ${escapeHtml(candidato.nome)}</p>` : ''}
      <h1 class="vm-title">Preparação para a entrevista</h1>
      <p class="vm-lead">Você está a um passo de avançar para a vaga ${escapeHtml(tituloVaga)}.</p>
    </section>

    <section class="vm-secao">
      <h2 class="vm-h2">O que esperar</h2>
      <div class="vm-card">
        <dl class="vm-info">
          <dt>Formato</dt>
          <dd>Entrevista por áudio com a Vera, nossa agente de recrutamento.</dd>
          <dt>Duração estimada</dt>
          <dd>~${min}–${max} minutos.</dd>
          <dt>Áreas de foco</dt>
          <dd><div class="vm-chips">${chipsTopicos}</div></dd>
        </dl>
      </div>
    </section>

    <section class="vm-secao">
      <h2 class="vm-h2">Antes de começar</h2>
      <ul class="vm-lista">
        <li>Escolha um ambiente silencioso, sem interrupções.</li>
        <li>Use uma conexão de internet estável.</li>
        <li>Permita o acesso ao microfone quando solicitado (a câmera é opcional).</li>
        <li>Funciona no celular ou no computador.</li>
      </ul>
    </section>

    <p class="vm-aviso">Não atualize a página durante a entrevista.</p>
    <p class="vm-rodape-nota">Um link para esta entrevista também foi enviado ao seu e-mail.</p>

    ${botao('/instrucoes', 'Continuar')}`;

  res.send(
    pagina({ titulo: 'Preparação para a entrevista', tema: 'claro', etapa: 2, conteudo }),
  );
});

// ── Tela 4: Identificacao (fallback — so para quem volta sem sessao) ──
router.get('/identificacao', (req, res) => {
  const retomar = typeof req.query.retomar === 'string' ? req.query.retomar : '';
  const conteudo = `
    <form id="form-identificacao" class="vm-form" novalidate>
      <input type="hidden" name="retomar" value="${escapeHtml(retomar)}">
      <h1 class="vm-title">Informe seus dados</h1>
      <p class="vm-lead">Use o e-mail da sua candidatura e o código de acesso que enviamos para você.</p>

      <p class="vm-form-erro" data-erro hidden role="alert"></p>

      <label class="vm-campo">E-mail
        <input type="email" name="email" autocomplete="email" required>
      </label>

      <label class="vm-campo">Código de acesso
        <input type="text" name="codigo" autocomplete="one-time-code" placeholder="Código enviado por e-mail" required>
      </label>

      <button type="submit" class="vm-btn vm-btn--primario" data-enviar>Continuar</button>
    </form>`;

  res.send(pagina({ titulo: 'Identificação', tema: 'claro', etapa: 1, conteudo }));
});

// ── Tela 5: Instrucoes (protegida) ──
router.get('/instrucoes', exigirCandidato, (req, res) => {
  const regras = [
    'A entrevista é gravada em áudio e pode ser compartilhada com a equipe de recrutamento.',
    'Fique num ambiente silencioso. Use o botão "toque para falar" para gravar cada resposta.',
    'Sinta-se à vontade para pedir que a Vera repita uma pergunta se precisar de mais clareza.',
    'Toque para começar a responder e toque de novo para terminar cada resposta.',
  ]
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join('');

  const conteudo = `
    <section class="vm-hero vm-hero--centro">
      <p class="vm-kicker">Agente Vera</p>
      <h1 class="vm-title">Instruções da entrevista</h1>
    </section>

    <div class="vm-card vm-painel-regras">
      <h2 class="vm-h2">Antes de iniciar, leia com atenção</h2>
      <ol class="vm-regras">${regras}</ol>
    </div>

    ${botao('/permissao-camera', 'Pode começar, iniciar entrevista')}`;

  res.send(
    pagina({
      titulo: 'Instruções da entrevista',
      tema: 'escuro',
      etapa: 2,
      comOrbe: true,
      conteudo,
    }),
  );
});

// ── Tela 6: Permissao de camera (opcional, so presenca — nao grava video) ──
router.get('/permissao-camera', exigirCandidato, (req, res) => {
  const conteudo = `
    <section class="vm-hero vm-hero--centro">
      <p class="vm-kicker">Câmera (opcional)</p>
      <h1 class="vm-title">Permissão de câmera</h1>
      <p class="vm-lead">A câmera é opcional e serve apenas para confirmar sua presença. Não gravamos vídeo.</p>

      <p class="vm-form-erro" data-cam-erro hidden role="alert"></p>

      <div class="vm-acoes">
        <button type="button" class="vm-btn vm-btn--primario" data-permitir-camera>Permitir câmera</button>
        <a class="vm-btn vm-btn--secundario" href="/permissao-microfone" data-pular>Pular câmera</a>
      </div>

      <p class="vm-rodape-nota">
        No iPhone (Safari), a câmera exige conexão segura (HTTPS) e a permissão é solicitada ao tocar no botão.
      </p>
    </section>`;

  res.send(pagina({ titulo: 'Permissão de câmera', tema: 'escuro', etapa: 3, conteudo }));
});

// ── Tela 7: Teste de camera (preview ao vivo, sem gravar) ──
router.get('/teste-camera', exigirCandidato, (req, res) => {
  const conteudo = `
    <section class="vm-hero vm-hero--centro" data-tela-teste-camera>
      <p class="vm-kicker">Câmera (opcional)</p>
      <h1 class="vm-title">Confira sua câmera</h1>

      <div class="vm-video-wrap">
        <video data-preview-camera autoplay muted playsinline></video>
      </div>

      <p class="vm-lead">Está tudo certo? Você aparece na imagem?</p>
      <p class="vm-form-erro" data-cam-erro hidden role="alert"></p>

      <div class="vm-acoes">
        <a class="vm-btn vm-btn--primario" href="/permissao-microfone" data-continuar>Continuar</a>
        <a class="vm-btn vm-btn--secundario" href="/permissao-microfone" data-pular>Pular câmera</a>
      </div>
    </section>`;

  res.send(pagina({ titulo: 'Confira sua câmera', tema: 'escuro', etapa: 3, conteudo }));
});

// ── Tela 8: Permissao de microfone (obrigatorio — canal principal da entrevista) ──
router.get('/permissao-microfone', exigirCandidato, (req, res) => {
  const conteudo = `
    <section class="vm-hero vm-hero--centro">
      <p class="vm-kicker">Microfone</p>
      <h1 class="vm-title">Permissão de microfone</h1>
      <p class="vm-lead">A entrevista é por áudio. Precisamos do seu microfone para ouvir as suas respostas.</p>

      <p class="vm-form-erro" data-mic-erro hidden role="alert"></p>

      <div class="vm-acoes">
        <button type="button" class="vm-btn vm-btn--primario" data-permitir-mic>Permitir microfone</button>
        <button type="button" class="vm-btn vm-btn--secundario" data-tentar-mic hidden>Tentar de novo</button>
      </div>

      <p class="vm-rodape-nota">
        No iPhone (Safari), o microfone exige conexão segura (HTTPS) e a permissão é solicitada ao tocar no botão.
      </p>
    </section>`;

  res.send(pagina({ titulo: 'Permissão de microfone', tema: 'escuro', etapa: 3, conteudo }));
});

// ── Tela 9: Teste de microfone (medidor de nivel via Web Audio — sem gravar) ──
router.get('/teste-microfone', exigirCandidato, (req, res) => {
  const conteudo = `
    <section class="vm-hero vm-hero--centro" data-tela-teste-mic>
      <p class="vm-kicker">Microfone</p>
      <h1 class="vm-title">Teste seu microfone</h1>
      <p class="vm-lead">Toque em FALAR e leia a frase em voz alta.</p>

      <blockquote class="vm-frase-teste">"Testando, você me ouve, Vera?"</blockquote>

      <div class="vm-medidor" role="img" aria-label="Nível do microfone">
        <div class="vm-medidor__nivel" data-nivel-mic></div>
      </div>

      <p class="vm-status" data-status-mic aria-live="polite"></p>
      <p class="vm-form-erro" data-mic-erro hidden role="alert"></p>

      <div class="vm-acoes">
        <button type="button" class="vm-btn vm-btn--secundario" data-falar>Falar</button>
        <button type="button" class="vm-btn vm-btn--primario" data-continuar-mic disabled>Continuar</button>
      </div>

      <p class="vm-nota-seguranca" data-nota-seguranca aria-live="polite" hidden></p>
      <a class="vm-link-discreto" href="/entrevista" data-continuar-assim>Continuar mesmo assim</a>
    </section>`;

  res.send(pagina({ titulo: 'Teste seu microfone', tema: 'escuro', etapa: 3, conteudo }));
});

// ── Tela 10: Entrevista (push-to-talk com a Vera) ──
router.get('/entrevista', exigirCandidato, (req, res) => {
  const conteudo = `
    <div class="vm-entrevista" data-entrevista>
      <div class="vm-entrevista__topo">
        <div class="vm-chips vm-chips--progresso" data-chips aria-label="Progresso por tópico"></div>
        <div class="vm-timer" data-timer role="timer" aria-label="Tempo decorrido">00:00</div>
      </div>

      <div class="vm-orb vm-orb--idle" data-orbe aria-hidden="true">
        <div class="vm-orb__halo"></div>
        <div class="vm-orb__core"></div>
        <div class="vm-orb__ring"></div>
      </div>
      <p class="vm-vera-estado" data-estado-texto aria-live="polite"></p>

      <p class="vm-kicker">Vera pergunta</p>
      <p class="vm-pergunta" data-pergunta>Preparando sua entrevista…</p>

      <p class="vm-form-erro" data-erro hidden role="alert"></p>

      <div class="vm-entrevista__controles">
        <button type="button" class="vm-btn vm-btn--primario vm-ptt" data-ptt hidden>Toque para falar</button>
        <button type="button" class="vm-btn vm-btn--primario" data-retry hidden>Tentar de novo</button>
        <button type="button" class="vm-btn vm-btn--secundario" data-repetir hidden>Repetir pergunta</button>
      </div>

      <div class="vm-cam-thumb" data-cam-thumb hidden>
        <video data-cam-video autoplay muted playsinline></video>
      </div>

      <!-- Overlay inicial: destrava o audio no iOS (exige gesto do usuario) -->
      <div class="vm-iniciar" data-iniciar>
        <p class="vm-kicker">Agente Vera</p>
        <h1 class="vm-title">Tudo pronto?</h1>
        <p class="vm-lead">Toque para iniciar. A Vera vai falar e você responde com o botão de microfone.</p>
        <button type="button" class="vm-btn vm-btn--primario" data-iniciar-btn>Iniciar entrevista</button>
      </div>

      <audio data-audio playsinline></audio>
    </div>`;

  res.send(pagina({ titulo: 'Entrevista', tema: 'escuro', etapa: 4, conteudo }));
});

// ── Tela 11: Finalizacao ──
router.get('/finalizacao', (req, res) => {
  res.send(
    pagina({
      titulo: 'Entrevista concluida',
      tema: 'escuro',
      comOrbe: true,
      etapa: 4,
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
