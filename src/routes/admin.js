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
  .campo input[type=number] { width:6rem; background:var(--campo); color:var(--offwhite); border:1px solid var(--linha); border-radius:6px; padding:.6rem .7rem; font:inherit; }
  .campo input[type=number]:focus { outline:none; border-color:var(--laranja); }
  .bloco-card { border:1px solid var(--linha); border-radius:8px; padding:.2rem 1rem; margin-bottom:.7rem; }
  .bloco-card > summary { font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.03em; cursor:pointer; padding:.7rem 0; color:var(--offwhite); font-weight:700; }
  .bloco-card[open] > summary { border-bottom:1px solid var(--linha); margin-bottom:.8rem; }
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

// Inteiro com separador de milhar (pt-BR).
function fmtInt(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}
// Custo em USD: 6 casas nos totais, 8 nas linhas (custos por chamada sao minusculos).
function fmtUsd6(n) {
  return `$${Number(n || 0).toFixed(6)}`;
}
function fmtUsd8(n) {
  return `$${Number(n || 0).toFixed(8)}`;
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
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
        <a class="btn btn--ghost" href="/admin/vaga">Editar vaga</a>
        <a class="btn btn--ghost" href="/admin/roteiro">Editar roteiro</a>
        <a class="btn btn--ghost" href="/admin/uso">Custos / Uso API</a>
      </div>
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

// Resolve a vaga a editar: a ativa (primeira com ativo=1) ou, na falta, a de id=1.
function vagaParaEditar() {
  return db.obterVagaAtiva() || db.obterVaga(1) || null;
}

// ── GET /admin/vaga ── formulario de edicao da vaga ──
router.get('/vaga', (req, res) => {
  const vaga = vagaParaEditar();

  if (!vaga) {
    return res.send(
      paginaAdmin({
        titulo: 'Editar vaga',
        conteudo: `
          <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>
          <section class="rel-sec"><h1>Editar vaga</h1><p>Nenhuma vaga cadastrada.</p></section>`,
      }),
    );
  }

  const salvo = req.query.salvo === '1'
    ? '<p class="aviso-ok">Alterações salvas.</p>'
    : '';

  const conteudo = `
    <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>
    <h1>Editar vaga</h1>
    ${salvo}
    <form method="POST" action="/admin/vaga">
      <input type="hidden" name="id" value="${escapeHtml(String(vaga.id))}">

      <label class="campo">
        <span>Título da vaga</span>
        <input type="text" name="titulo" value="${escapeHtml(vaga.titulo || '')}" required>
      </label>

      <label class="campo">
        <span>Faixa de pagamento</span>
        <input type="text" name="faixa_pagamento" value="${escapeHtml(vaga.faixa_pagamento || '')}" placeholder="R$ 3.000 – R$ 6.000 + comissão">
      </label>

      <label class="campo">
        <span>Descrição da vaga</span>
        <textarea name="descricao" rows="6">${escapeHtml(vaga.descricao || '')}</textarea>
      </label>

      <label class="campo">
        <span>Sobre a empresa</span>
        <textarea name="sobre_empresa" rows="4">${escapeHtml(vaga.sobre_empresa || '')}</textarea>
      </label>

      <label class="campo-check">
        <input type="checkbox" name="ativo" value="1"${vaga.ativo ? ' checked' : ''}>
        <span style="color:var(--offwhite);text-transform:none;">Vaga ativa</span>
      </label>

      <button type="submit" class="btn">Salvar alterações</button>
    </form>`;

  res.send(paginaAdmin({ titulo: 'Editar vaga', conteudo }));
});

// ── POST /admin/vaga ── salva as alteracoes ──
router.post('/vaga', (req, res) => {
  const b = req.body || {};
  const id = Number(b.id);
  const titulo = String(b.titulo || '').trim();

  const vaga = Number.isFinite(id) ? db.obterVaga(id) : null;
  if (!vaga) {
    return res.status(404).send(paginaErroAdmin('Vaga não encontrada.'));
  }
  if (!titulo) {
    return res.status(400).send(
      paginaAdmin({
        titulo: 'Editar vaga',
        conteudo: `
          <p><a class="btn btn--ghost" href="/admin/vaga">← Voltar</a></p>
          <section class="rel-sec"><h1>Editar vaga</h1>
            <p>O título da vaga não pode ficar vazio.</p></section>`,
      }),
    );
  }

  db.atualizarVaga(id, {
    titulo,
    faixa_pagamento: String(b.faixa_pagamento || '').trim(),
    descricao: String(b.descricao || '').trim(),
    sobre_empresa: String(b.sobre_empresa || '').trim(),
    ativo: b.ativo === '1' || b.ativo === 'on',
  });

  res.redirect('/admin/vaga?salvo=1');
});

// ── Edicao do roteiro de entrevista (B.2) ──

// Resolve o roteiro a editar: SEMPRE o roteiro da vaga ativa (id=1 por padrao).
function roteiroParaEditar() {
  const vaga = db.obterVagaAtiva() || db.obterVaga(1);
  if (vaga && vaga.roteiro_id) {
    const r = db.obterRoteiro(vaga.roteiro_id);
    if (r) return r;
  }
  return db.obterRoteiro(1) || null;
}

// Textarea <-> array de strings (uma por linha).
function linhasDeArray(arr) {
  return Array.isArray(arr) ? arr.join('\n') : '';
}
function arrayDeLinhas(texto) {
  return String(texto || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// ── GET /admin/roteiro ── formulario de edicao do roteiro ──
router.get('/roteiro', (req, res) => {
  const roteiro = roteiroParaEditar();

  if (!roteiro) {
    return res.send(
      paginaAdmin({
        titulo: 'Editar roteiro',
        conteudo: `
          <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>
          <section class="rel-sec"><h1>Roteiro de entrevista</h1><p>Nenhum roteiro cadastrado.</p></section>`,
      }),
    );
  }

  const est = roteiro.estrutura || {};
  const instrucoes = Array.isArray(est.instrucoes_gerais) ? est.instrucoes_gerais : [];
  const competencias = Array.isArray(est.competencias) ? est.competencias : [];
  const blocos = Array.isArray(est.blocos) ? est.blocos : [];

  const salvo = req.query.salvo === '1' ? '<p class="aviso-ok">Roteiro salvo.</p>' : '';

  const compsHtml = competencias
    .map(
      (c, i) => `
      <div class="comp">
        <label class="campo">
          <span>Competência</span>
          <input type="text" name="comp_${i}_nome" value="${escapeHtml(c.nome || '')}">
        </label>
        <label class="campo">
          <span>Peso (1–2)</span>
          <input type="number" name="comp_${i}_peso" min="1" max="2" value="${escapeHtml(String(c.peso || 1))}">
        </label>
        <label class="campo">
          <span>Boa resposta</span>
          <textarea name="comp_${i}_boa_resposta" rows="3">${escapeHtml(c.boa_resposta || '')}</textarea>
        </label>
      </div>`,
    )
    .join('');

  const blocosHtml = blocos
    .map((b, i) => {
      const temSemente = Object.prototype.hasOwnProperty.call(b, 'pergunta_semente');
      const temInstrucao = Object.prototype.hasOwnProperty.call(b, 'instrucao_vera');
      const temSondas = Array.isArray(b.sondas_bei);
      const semente = temSemente
        ? `
        <label class="campo">
          <span>Pergunta-semente</span>
          <textarea name="bloco_${i}_pergunta_semente" rows="3">${escapeHtml(b.pergunta_semente || '')}</textarea>
        </label>`
        : '';
      const instrucao = temInstrucao
        ? `
        <label class="campo">
          <span>Instrução para a Vera</span>
          <textarea name="bloco_${i}_instrucao_vera" rows="3">${escapeHtml(b.instrucao_vera || '')}</textarea>
        </label>`
        : '';
      const sondas = temSondas
        ? `
        <label class="campo">
          <span>Sondas BEI (uma por linha)</span>
          <textarea name="bloco_${i}_sondas_bei" rows="4">${escapeHtml(linhasDeArray(b.sondas_bei))}</textarea>
        </label>`
        : '';
      const aberto = b.obrigatorio !== false ? ' open' : '';
      return `
      <details class="bloco-card"${aberto}>
        <summary>${escapeHtml(b.nome || b.id || `Bloco ${i + 1}`)}</summary>
        <label class="campo-check">
          <input type="checkbox" name="bloco_${i}_obrigatorio" value="1"${b.obrigatorio !== false ? ' checked' : ''}>
          <span style="color:var(--offwhite);text-transform:none;">Bloco obrigatório</span>
        </label>
        ${semente}${instrucao}${sondas}
      </details>`;
    })
    .join('');

  const conteudo = `
    <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>
    <h1>Roteiro de entrevista</h1>
    ${salvo}
    <form method="POST" action="/admin/roteiro">
      <input type="hidden" name="id" value="${escapeHtml(String(roteiro.id))}">

      <label class="campo">
        <span>Instruções gerais da Vera (uma por linha)</span>
        <textarea name="instrucoes_gerais" rows="6">${escapeHtml(linhasDeArray(instrucoes))}</textarea>
      </label>

      <h2>Competências</h2>
      ${compsHtml || '<p>Nenhuma competência cadastrada.</p>'}

      <h2>Blocos</h2>
      ${blocosHtml || '<p>Nenhum bloco cadastrado.</p>'}

      <button type="submit" class="btn">Salvar roteiro</button>
    </form>`;

  res.send(paginaAdmin({ titulo: 'Editar roteiro', conteudo }));
});

// ── POST /admin/roteiro ── salva as alteracoes do roteiro ──
router.post('/roteiro', (req, res) => {
  const b = req.body || {};
  const id = Number(b.id);
  const roteiro = Number.isFinite(id) ? db.obterRoteiro(id) : null;
  if (!roteiro) {
    return res.status(404).send(paginaErroAdmin('Roteiro não encontrado.'));
  }

  // Parte da estrutura ATUAL (fonte da verdade) e sobrescreve SO os campos editaveis.
  // Assim preservamos campos fora do formulario: id/competencias_alvo/pergunta_secundaria/
  // objecao_padrao/o_que_observar/perguntas (fechamento)/metodo/rubrica.
  const est = JSON.parse(JSON.stringify(roteiro.estrutura || {}));

  est.instrucoes_gerais = arrayDeLinhas(b.instrucoes_gerais);

  const competencias = Array.isArray(est.competencias) ? est.competencias : [];
  competencias.forEach((c, i) => {
    if (b[`comp_${i}_nome`] != null) c.nome = String(b[`comp_${i}_nome`]).trim();
    if (b[`comp_${i}_boa_resposta`] != null) c.boa_resposta = String(b[`comp_${i}_boa_resposta`]).trim();
    const peso = parseInt(b[`comp_${i}_peso`], 10);
    if (Number.isFinite(peso)) c.peso = Math.min(2, Math.max(1, peso));
  });

  const blocos = Array.isArray(est.blocos) ? est.blocos : [];
  const faltando = [];
  blocos.forEach((bl, i) => {
    const obrigatorio =
      b[`bloco_${i}_obrigatorio`] === '1' || b[`bloco_${i}_obrigatorio`] === 'on';
    bl.obrigatorio = obrigatorio;

    if (Object.prototype.hasOwnProperty.call(bl, 'pergunta_semente')) {
      bl.pergunta_semente = String(b[`bloco_${i}_pergunta_semente`] || '').trim();
      // Validacao: pergunta-semente de bloco obrigatorio nao pode ficar vazia.
      if (obrigatorio && !bl.pergunta_semente) {
        faltando.push(bl.nome || bl.id || `Bloco ${i + 1}`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(bl, 'instrucao_vera')) {
      bl.instrucao_vera = String(b[`bloco_${i}_instrucao_vera`] || '').trim();
    }
    if (Array.isArray(bl.sondas_bei)) {
      bl.sondas_bei = arrayDeLinhas(b[`bloco_${i}_sondas_bei`]);
    }
  });

  if (faltando.length) {
    return res.status(400).send(
      paginaAdmin({
        titulo: 'Editar roteiro',
        conteudo: `
          <p><a class="btn btn--ghost" href="/admin/roteiro">← Voltar</a></p>
          <section class="rel-sec"><h1>Roteiro de entrevista</h1>
            <p>A pergunta-semente não pode ficar vazia em blocos obrigatórios: <b>${escapeHtml(faltando.join(', '))}</b>.</p>
          </section>`,
      }),
    );
  }

  db.atualizarEstruturaRoteiro(id, est);
  res.redirect('/admin/roteiro?salvo=1');
});

// ── GET /admin/uso ── monitoramento de custos das chamadas ao LLM ──
router.get('/uso', (req, res) => {
  const total = db.resumoUsoApi();
  const porOrigem = db.usoApiPorOrigem();
  const ultimas = db.ultimasChamadasApi(30);

  // Bloco 2 — por origem.
  const linhasOrigem = porOrigem
    .map(
      (o) => `
        <tr>
          <td>${escapeHtml(o.origem)}</td>
          <td>${fmtInt(o.chamadas)}</td>
          <td>${fmtInt(o.tokens_entrada)}</td>
          <td>${fmtInt(o.tokens_saida)}</td>
          <td>${escapeHtml(fmtUsd6(o.custo_usd))}</td>
        </tr>`,
    )
    .join('');

  // Bloco 3 — ultimas 30 chamadas.
  const linhasUltimas = ultimas
    .map(
      (u) => `
        <tr>
          <td>${escapeHtml(formatarDataHora(u.criado_em))}</td>
          <td>${escapeHtml(u.origem)}</td>
          <td>${u.interview_id != null ? escapeHtml(String(u.interview_id)) : '—'}</td>
          <td>${fmtInt(u.cache_hit_tokens)}</td>
          <td>${fmtInt(u.cache_miss_tokens)}</td>
          <td>${fmtInt(u.completion_tokens)}</td>
          <td>${escapeHtml(fmtUsd8(u.custo_usd))}</td>
        </tr>`,
    )
    .join('');

  const conteudo = `
    <p><a class="btn btn--ghost" href="/admin">← Voltar ao painel</a></p>
    <h1>Custos / Uso da API</h1>

    <section class="rel-sec">
      <h2>Totais gerais</h2>
      <dl class="rel-id">
        <div><dt>Total gasto (USD)</dt><dd><b>${escapeHtml(fmtUsd6(total.custo_usd))}</b></dd></div>
        <div><dt>Total de chamadas</dt><dd>${fmtInt(total.chamadas)}</dd></div>
        <div><dt>Tokens de entrada</dt><dd>${fmtInt(total.cache_hit_tokens)} cache hit · ${fmtInt(total.cache_miss_tokens)} cache miss</dd></div>
        <div><dt>Tokens de saída</dt><dd>${fmtInt(total.completion_tokens)}</dd></div>
      </dl>
    </section>

    <section class="rel-sec">
      <h2>Por origem</h2>
      <div class="admin-tab-scroll">
        <table class="admin-tab">
          <thead>
            <tr><th>Origem</th><th>Chamadas</th><th>Tokens entrada</th><th>Tokens saída</th><th>Custo USD</th></tr>
          </thead>
          <tbody>
            ${linhasOrigem || '<tr><td colspan="5">Nenhuma chamada registrada.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="rel-sec">
      <h2>Últimas 30 chamadas</h2>
      <div class="admin-tab-scroll">
        <table class="admin-tab">
          <thead>
            <tr><th>Data/hora</th><th>Origem</th><th>Interview ID</th><th>Cache hit</th><th>Cache miss</th><th>Output</th><th>Custo USD</th></tr>
          </thead>
          <tbody>
            ${linhasUltimas || '<tr><td colspan="7">Nenhuma chamada registrada.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <p class="admin-rodape">
      Os custos só são registrados em modo real (INTERVIEW_MOCK=false). Preços DeepSeek
      V4-Flash (jun/2026): cache hit $0,0028 / cache miss $0,14 / output $0,28 por 1M tokens.
    </p>`;

  res.send(paginaAdmin({ titulo: 'Custos / Uso da API', conteudo }));
});

module.exports = router;
