'use strict';

// Painel do recrutador (Fase 5). Area protegida por URL/cookie secreto, separada do
// funil do candidato. Server-rendered, identidade visual Vendedor Mestre (tema escuro:
// preto #0D0B0A, laranja #FF5500, off-white #F4F3F1; Barlow Condensed nos titulos).
//
// Seguranca: o middleware adminAuth abaixo protege TODAS as rotas deste router. O
// cookie de admin e ASSINADO com o SESSION_SECRET (mesmo cookie-parser do candidato);
// o valor comparado e o ADMIN_SECRET. Sem ADMIN_SECRET definido, o painel fica negado.

const express = require('express');
const { config } = require('../config');
const db = require('../db');
const { escapeHtml } = require('../views');

const router = express.Router();

const COOKIE_ADMIN = 'vm_admin';
const MAX_IDADE_ADMIN_MS = 8 * 60 * 60 * 1000; // 8 horas

// ── Middleware de acesso ao painel ──
// 1) cookie assinado vm_admin == ADMIN_SECRET -> libera;
// 2) ?secret=ADMIN_SECRET -> grava o cookie (8h) e redireciona p/ a URL sem o param;
// 3) caso contrario -> 403 com pagina HTML simples em pt-BR.
function adminAuth(req, res, next) {
  const segredo = config.admin.secret;

  // Painel nao configurado: nega tudo (evita que cookie vazio "case" com secret vazio).
  if (!segredo) {
    return res.status(403).send(paginaErroAdmin('Painel não configurado.'));
  }

  // 1) Ja autenticado pelo cookie assinado.
  if (req.signedCookies && req.signedCookies[COOKIE_ADMIN] === segredo) {
    return next();
  }

  // 2) Acesso pela URL secreta: grava cookie e limpa o parametro da URL.
  if (req.query && req.query.secret === segredo) {
    res.cookie(COOKIE_ADMIN, segredo, {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: config.ehProducao,
      maxAge: MAX_IDADE_ADMIN_MS,
      path: '/',
    });
    // Redireciona para o mesmo caminho SEM a query (tira o secret da barra/historico).
    return res.redirect(`${req.baseUrl}${req.path}`);
  }

  // 3) Sem acesso.
  return res.status(403).send(paginaErroAdmin('Acesso negado.'));
}

router.use(adminAuth);

// ── Helpers de apresentacao ──

// CSS do painel (tema escuro), embutido para nao tocar no pipeline de CSS do candidato.
const ESTILO_ADMIN = `
  :root { --preto:#0D0B0A; --laranja:#FF5500; --offwhite:#F4F3F1; --campo:#1a1816; --linha:#2a2724; --cinza:#b8b2ac; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--preto); color:var(--offwhite); font-family:'Barlow',system-ui,sans-serif; }
  .admin-wrap { max-width:1100px; margin:0 auto; padding:2rem 1.25rem 4rem; }
  .admin-cab { border-bottom:1px solid var(--linha); padding-bottom:1rem; margin-bottom:1.5rem; }
  .admin-logo { font-family:'Barlow Condensed',sans-serif; font-weight:900; text-transform:uppercase; color:var(--laranja); font-size:2rem; letter-spacing:.04em; margin:0; }
  .admin-sub { color:var(--offwhite); margin:.15rem 0 0; font-size:1.05rem; }
  h1,h2,h3 { font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.03em; }
  a { color:var(--laranja); }
  .admin-tab-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  table.admin-tab { width:100%; border-collapse:collapse; font-size:.95rem; min-width:760px; }
  table.admin-tab th, table.admin-tab td { text-align:left; padding:.6rem .7rem; border-bottom:1px solid var(--linha); white-space:nowrap; }
  table.admin-tab th { font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; color:var(--cinza); font-weight:700; }
  .badge { display:inline-block; padding:.15rem .55rem; border-radius:999px; font-size:.8rem; font-weight:600; }
  .badge--aplicado { background:var(--linha); color:var(--cinza); }
  .badge--entrevista { background:var(--laranja); color:var(--preto); }
  .badge--concluido { background:transparent; color:var(--offwhite); border:1px solid var(--offwhite); }
  .btn { display:inline-block; padding:.4rem .8rem; border-radius:6px; text-decoration:none; font-weight:600; font-size:.85rem; background:var(--laranja); color:var(--preto); border:none; cursor:pointer; }
  .btn--off { background:var(--linha); color:var(--cinza); pointer-events:none; }
  .btn--ghost { background:transparent; color:var(--offwhite); border:1px solid var(--linha); }
  .admin-rodape { margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--linha); color:var(--cinza); font-size:.9rem; }
  .rel-sec { margin:1.5rem 0; }
  .rel-id { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.5rem 1.5rem; }
  .rel-id dt { color:var(--cinza); font-size:.8rem; text-transform:uppercase; }
  .rel-id dd { margin:0 0 .5rem; }
  .comp { border:1px solid var(--linha); border-radius:8px; padding:.8rem 1rem; margin-bottom:.7rem; }
  .comp--off { opacity:.7; }
  .comp-cab { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
  .comp-nota { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:1.6rem; color:var(--laranja); }
  .comp-nota small { color:var(--cinza); font-size:.9rem; }
  .tag-off { display:inline-block; font-size:.75rem; color:var(--preto); background:var(--cinza); padding:.1rem .45rem; border-radius:4px; margin-left:.5rem; }
  .lista { margin:.3rem 0 0; padding-left:1.2rem; }
  .transc { font-size:.85rem; }
  .turno { padding:.5rem .8rem; border-radius:6px; margin-bottom:.4rem; background:var(--campo); }
  .turno-autor { font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; color:var(--laranja); font-weight:700; font-size:.8rem; }
  .turno--cand .turno-autor { color:var(--offwhite); }
  .campo { display:block; margin-bottom:1rem; }
  .campo > span { display:block; color:var(--cinza); font-size:.85rem; text-transform:uppercase; margin-bottom:.3rem; }
  .campo input[type=text], .campo textarea { width:100%; background:var(--campo); color:var(--offwhite); border:1px solid var(--linha); border-radius:6px; padding:.6rem .7rem; font:inherit; }
  .campo input[type=text]:focus, .campo textarea:focus { outline:none; border-color:var(--laranja); }
  .campo-check { display:flex; align-items:center; gap:.5rem; margin-bottom:1.2rem; }
  .aviso-ok { background:var(--linha); border-left:3px solid var(--laranja); padding:.6rem .9rem; border-radius:4px; margin-bottom:1rem; }
`;

// Shell HTML do painel (sem o header/funil/app.js do candidato).
function paginaAdmin({ titulo, conteudo, subtitulo = 'Painel do Recrutador' }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(titulo)} · Vendedor Mestre</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@700;900&display=swap" rel="stylesheet">
  <style>${ESTILO_ADMIN}</style>
</head>
<body>
  <div class="admin-wrap">
    <header class="admin-cab">
      <p class="admin-logo">Vendedor Mestre</p>
      <p class="admin-sub">${escapeHtml(subtitulo)}</p>
    </header>
    ${conteudo}
  </div>
</body>
</html>`;
}

// Pagina de erro/403 simples (nao expoe estrutura interna).
function paginaErroAdmin(mensagem) {
  return paginaAdmin({
    titulo: 'Acesso negado',
    subtitulo: 'Painel do Recrutador',
    conteudo: `
      <section class="rel-sec">
        <h1>Acesso negado</h1>
        <p>${escapeHtml(mensagem)}</p>
      </section>`,
  });
}

// Formata 'YYYY-MM-DD HH:MM:SS' (UTC do SQLite) como 'dd/mm/aaaa hh:mm'.
function formatarDataHora(sqliteDt) {
  if (!sqliteDt) return '—';
  const m = String(sqliteDt).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(sqliteDt);
  const [, ano, mes, dia, hh, mm] = m;
  return `${dia}/${mes}/${ano} ${hh}:${mm}`;
}

// Rotulo + classe de badge por status.
function badgeStatus(status) {
  const mapa = {
    aplicado: ['Aplicado', 'badge--aplicado'],
    em_entrevista: ['Em entrevista', 'badge--entrevista'],
    concluido: ['Concluído', 'badge--concluido'],
  };
  const [rotulo, classe] = mapa[status] || [status || '—', 'badge--aplicado'];
  return `<span class="badge ${classe}">${escapeHtml(rotulo)}</span>`;
}

function nomeCompleto(linha) {
  const nome = [linha.nome, linha.sobrenome].filter(Boolean).join(' ').trim();
  return nome || linha.email || '—';
}

// ── GET /admin ── lista de candidatos ──
router.get('/', (req, res) => {
  const candidatos = db.listarAplicacoesComContexto();

  const linhas = candidatos
    .map((c) => {
      const podeVerRelatorio = c.status === 'concluido' && c.report_interview_id != null;
      const acao = podeVerRelatorio
        ? `<a class="btn" href="/admin/relatorio/${c.report_interview_id}">Ver relatório</a>`
        : `<span class="btn btn--off">Ver relatório</span>`;
      return `
        <tr>
          <td>${escapeHtml(nomeCompleto(c))}</td>
          <td>${escapeHtml(c.email || '—')}</td>
          <td>${escapeHtml(c.telefone || '—')}</td>
          <td>${escapeHtml(c.vaga_titulo || '—')}</td>
          <td>${badgeStatus(c.status)}</td>
          <td>${escapeHtml(formatarDataHora(c.criado_em))}</td>
          <td>${acao}</td>
        </tr>`;
    })
    .join('');

  const totalCandidatos = db.contarAplicacoes();
  const totalConcluidas = db.contarEntrevistasConcluidas();

  const conteudo = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">
      <h1 style="margin:0;">Candidatos</h1>
      <a class="btn btn--ghost" href="/admin/vaga">Editar vaga</a>
    </div>
    <div class="admin-tab-scroll">
      <table class="admin-tab">
        <thead>
          <tr>
            <th>Nome</th><th>E-mail</th><th>Telefone</th><th>Vaga</th>
            <th>Status</th><th>Criado em</th><th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${linhas || '<tr><td colspan="7">Nenhum candidato ainda.</td></tr>'}
        </tbody>
      </table>
    </div>
    <p class="admin-rodape">
      Total de candidatos: <b>${totalCandidatos}</b> ·
      Entrevistas concluídas: <b>${totalConcluidas}</b>
    </p>`;

  res.send(paginaAdmin({ titulo: 'Candidatos', conteudo }));
});

// ── GET /admin/relatorio/:interviewId ── relatorio individual ──
router.get('/relatorio/:interviewId', (req, res) => {
  const interviewId = Number(req.params.interviewId);
  const interview = Number.isFinite(interviewId) ? db.obterInterview(interviewId) : null;
  const report = interview ? db.obterReportPorInterview(interviewId) : null;

  if (!interview || !report) {
    return res.status(404).send(
      paginaAdmin({
        titulo: 'Relatório não disponível',
        conteudo: `
          <section class="rel-sec">
            <h1>Relatório não disponível</h1>
            <p>Não há relatório gerado para esta entrevista.</p>
            <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>
          </section>`,
      }),
    );
  }

  const candidato = db.obterAplicacao(interview.application_id);
  const vaga = candidato ? db.obterVaga(candidato.job_id) : null;
  const perfil = (vaga && vaga.perfil) || interview.perfil || '—';
  const turns = db.listarTurnos(interviewId);

  // Pontuacoes (array de { competencia, nota, justificativa, coberta }) — coberta vem
  // de dentro do JSON, nao de coluna.
  const comps = (report.pontuacoes || [])
    .map((p) => {
      const off = p.coberta === false;
      const nota = p.nota != null ? `${escapeHtml(String(p.nota))}<small>/5</small>` : '—';
      return `
        <div class="comp${off ? ' comp--off' : ''}">
          <div class="comp-cab">
            <h3 style="margin:0;">${escapeHtml(p.competencia || '')}${off ? '<span class="tag-off">Não abordada</span>' : ''}</h3>
            <span class="comp-nota">${nota}</span>
          </div>
          ${p.justificativa ? `<p style="margin:.4rem 0 0;">${escapeHtml(p.justificativa)}</p>` : ''}
        </div>`;
    })
    .join('');

  const itens = (lista) => (lista || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  const fortes = itens(report.destaque_pontos_fortes);
  const atencao = itens(report.destaque_atencao);

  const nomeCand = nomeCompleto(candidato || {});
  const transcricao = turns
    .map((t) => {
      const ehAgente = t.autor === 'agente';
      const autor = ehAgente ? 'VERA' : nomeCand;
      return `
        <div class="turno${ehAgente ? '' : ' turno--cand'}">
          <span class="turno-autor">${escapeHtml(autor)}</span>
          <p style="margin:.2rem 0 0;">${escapeHtml(t.texto || '')}</p>
        </div>`;
    })
    .join('');

  const conteudo = `
    <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>

    <section class="rel-sec">
      <h1 style="margin:0 0 .8rem;">${escapeHtml(nomeCand)}</h1>
      <dl class="rel-id">
        <div><dt>E-mail</dt><dd>${escapeHtml((candidato && candidato.email) || '—')}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml((candidato && candidato.telefone) || '—')}</dd></div>
        <div><dt>Vaga</dt><dd>${escapeHtml((vaga && vaga.titulo) || '—')}</dd></div>
        <div><dt>Perfil</dt><dd>${escapeHtml(perfil)}</dd></div>
        <div><dt>Início</dt><dd>${escapeHtml(formatarDataHora(interview.iniciado_em))}</dd></div>
        <div><dt>Fim</dt><dd>${escapeHtml(formatarDataHora(interview.finalizado_em))}</dd></div>
      </dl>
    </section>

    ${report.resumo ? `<section class="rel-sec"><h2>Resumo</h2><p>${escapeHtml(report.resumo)}</p></section>` : ''}

    <section class="rel-sec">
      <h2>Pontuação por competência</h2>
      ${comps || '<p>Sem competências pontuadas.</p>'}
    </section>

    <section class="rel-sec">
      <h2>Pontos fortes</h2>
      ${fortes ? `<ul class="lista">${fortes}</ul>` : '<p>—</p>'}
    </section>

    <section class="rel-sec">
      <h2>Pontos de atenção</h2>
      ${atencao ? `<ul class="lista">${atencao}</ul>` : '<p>—</p>'}
    </section>

    <section class="rel-sec transc">
      <h2>Transcrição</h2>
      ${transcricao || '<p>Sem turnos registrados.</p>'}
    </section>

    <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>`;

  res.send(paginaAdmin({ titulo: `Relatório — ${nomeCand}`, conteudo }));
});

module.exports = router;
