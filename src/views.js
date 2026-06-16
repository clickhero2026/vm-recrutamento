'use strict';

// Renderizacao de paginas no servidor (sem framework de view).
// Monta o HTML base na identidade Vendedor Mestre: fontes Barlow via Google Fonts,
// tokens.css + base.css, cabecalho com logo e, quando pedido, barra de progresso
// e orbe do agente. As paginas de Fase 0 sao placeholders dentro deste layout.

const fs = require('node:fs');
const path = require('node:path');
const { config } = require('./config');

const PARTIALS_DIR = path.join(__dirname, '..', 'public', 'partials');

// Carrega os parciais uma vez no boot (sao pequenos e estaticos).
function carregarParcial(nome) {
  return fs.readFileSync(path.join(PARTIALS_DIR, `${nome}.html`), 'utf8');
}
const PARCIAIS = {
  header: carregarParcial('header'),
  progress: carregarParcial('progress'),
  orb: carregarParcial('orb'),
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Substituicao simples de tokens {{CHAVE}} num template.
function preencher(template, dados) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, chave) =>
    dados[chave] != null ? String(dados[chave]) : '',
  );
}

// Renderiza a barra de progresso para uma etapa do funil.
function barraProgresso({ pct = 0, label = '' }) {
  return preencher(PARCIAIS.progress, {
    PROGRESSO_PCT: Math.max(0, Math.min(100, Math.round(pct))),
    PROGRESSO_LABEL: escapeHtml(label),
  });
}

// Layout completo de uma pagina.
//   opcoes: { titulo, conteudo, tema: 'claro'|'escuro', progresso?:{pct,label}, comOrbe?:bool }
function pagina({ titulo, conteudo, tema = 'claro', progresso = null, comOrbe = false }) {
  const classeTema = tema === 'escuro' ? 'tema-escuro' : 'tema-claro';
  const tituloPagina = titulo ? `${titulo} · Vendedor Mestre` : 'Vendedor Mestre';

  return `<!doctype html>
<html lang="pt-BR" class="${classeTema}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0D0B0A">
  <title>${escapeHtml(tituloPagina)}</title>
  <meta name="description" content="Recrutamento de vendedores - entrevista com a agente ${escapeHtml(config.agente.nome)}.">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/base.css">
</head>
<body>
  ${PARCIAIS.header}
  ${progresso ? barraProgresso(progresso) : ''}
  <main class="vm-main">
    <div class="vm-container">
      ${comOrbe ? PARCIAIS.orb : ''}
      ${conteudo}
    </div>
  </main>
  <footer class="vm-footer">
    <span>Vendedor Mestre · Recrutamento</span>
  </footer>
  <script src="/js/app.js" defer></script>
</body>
</html>`;
}

module.exports = { pagina, escapeHtml };
