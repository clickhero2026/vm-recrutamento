'use strict';

// Geracao do relatorio de entrevista + envio ao recrutador (Fase 4).
//
// gerarRelatorio(interviewId) e chamada em fire-and-forget pelo /api/interview/finish:
//   - NUNCA bloqueia a resposta ao candidato (o caller faz .catch e nunca propaga).
//   - o candidato nunca ve o relatorio; so o recrutador recebe, por e-mail.
//
// Modo mock (config.entrevista.mock=true, default em dev): NAO chama DeepSeek nem
// Resend de verdade — produz uma avaliacao deterministica e apenas LOGA o e-mail.
// Modo real (INTERVIEW_MOCK=false): chama o LLM (DeepSeek) e envia via Resend.
//
// Testabilidade: gerarRelatorio aceita deps injetaveis ({ llm, email,
// usarMockDeterministico }) para o teste de ponta a ponta com fakes (ETAPA G),
// sem tocar em APIs reais. `usarMockDeterministico` e um override LOCAL da chamada
// (nao confundir com a env INTERVIEW_MOCK): se omitido, herda config.entrevista.mock.

const { config } = require('../config');
const db = require('../db');
const { gerarToken } = require('./session');
const { truncar, comTimeout, normalizarEstrutura } = require('./entrevista');
const { calcularCustoDeepSeek } = require('./custos');
const { escapeHtml } = require('../views');

// ── Prompt de avaliacao (system + user) enviado ao DeepSeek ──
// Saida exigida: SOMENTE JSON (sem markdown), com resumo, pontuacoes[], pontos_fortes[], pontos_atencao[].
function montarMensagensAvaliacao({ roteiro, vaga, candidato, turns, agente }) {
  const { competencias: listaComp, rubrica } = normalizarEstrutura(roteiro);
  const competencias = listaComp
    .map((c) => `- ${c.nome} (peso ${c.peso || 1}): boa resposta = ${c.boa_resposta || 'n/d'}`)
    .join('\n');

  const nomeCandidato = nomeDoCandidato(candidato);
  const tituloVaga = (vaga && vaga.titulo) || 'vaga';
  const perfil = (vaga && vaga.perfil) || (roteiro && roteiro.perfil) || 'vendedor';

  // Teto de seguranca contra resposta anomala do STT (nao e budget de tokens: esta
  // e uma chamada unica pos-entrevista, sem o reenvio de historico do motor ao vivo).
  const transcricao = (turns || [])
    .map((t) => `${t.autor === 'agente' ? agente || 'Vera' : 'Candidato'}: ${truncar(t.texto, 4000)}`)
    .join('\n');

  const system = [
    'Voce e um avaliador senior de recrutamento de vendedores, em portugues do Brasil.',
    'Avalie a entrevista com OBJETIVIDADE, baseando-se SOMENTE no que o candidato disse.',
    'Nao invente fatos; se algo nao foi abordado, pontue com cautela e diga isso na justificativa.',
    '',
    `VAGA: ${tituloVaga} (perfil ${perfil}).`,
    `CANDIDATO: ${nomeCandidato}.`,
    '',
    'COMPETENCIAS A PONTUAR (com peso e o que caracteriza uma boa resposta):',
    competencias || '- (roteiro sem competencias definidas)',
    '',
    `ESCALA: ${rubrica.escala || '1-5'} por competencia (1 = muito fraco, 5 = excelente). ` +
      'Use a "boa resposta" como referencia do que seria nota alta.',
    '',
    'FORMATO DE SAIDA — responda SOMENTE com um JSON valido, sem markdown, sem cercas ``` e sem',
    'texto antes ou depois. Use EXATAMENTE este formato:',
    '{',
    '  "resumo": "2 a 4 frases com a avaliacao geral do candidato",',
    '  "pontuacoes": [',
    '    { "competencia": "<nome exato da competencia>", "nota": <inteiro 1-5>, "justificativa": "1 a 2 frases", "coberta": <true|false> }',
    '  ],',
    '  "pontos_fortes": ["item curto", "..."],',
    '  "pontos_atencao": ["item curto", "..."]',
    '}',
    'No campo "coberta": use false quando a competencia NAO foi efetivamente abordada na ' +
      'transcricao (a pergunta nao chegou a ser feita, ou a resposta nao tocou no tema); ' +
      'use true nos demais casos. Mesmo com coberta=false, atribua uma nota cautelosa e ' +
      'explique na justificativa que o tema nao foi coberto.',
    'Inclua TODAS as competencias listadas em "pontuacoes", usando o nome EXATO. Nao adicione campos extras.',
  ].join('\n');

  const user = [
    'TRANSCRICAO DA ENTREVISTA (turno a turno, em ordem):',
    '',
    transcricao || '(sem turnos registrados)',
  ].join('\n');

  return [
    { papel: 'system', conteudo: system },
    { papel: 'user', conteudo: user },
  ];
}

function nomeDoCandidato(candidato) {
  if (!candidato) return 'Candidato';
  const nome = [candidato.nome, candidato.sobrenome].filter(Boolean).join(' ').trim();
  return nome || candidato.email || 'Candidato';
}

// Avaliacao deterministica usada no modo mock (custo zero, sem LLM).
function avaliacaoMock(roteiro) {
  const { competencias } = normalizarEstrutura(roteiro);
  const pontuacoes = competencias.length
    ? competencias.map((c, i) => {
        // Deterministico: a ULTIMA competencia simula uma NAO coberta (coberta=false),
        // exercitando esse caminho no mock/testes; as demais ficam coberta=true.
        const coberta = i < competencias.length - 1;
        return {
          competencia: c.nome,
          nota: coberta ? 4 : 2,
          justificativa: coberta
            ? '(mock) resposta consistente com o esperado para a competencia.'
            : '(mock) competencia nao abordada na entrevista; nota cautelosa.',
          coberta,
        };
      })
    : [{ competencia: 'Geral', nota: 4, justificativa: '(mock) avaliacao simulada.', coberta: true }];
  return {
    resumo: '(mock) Candidato com bom alinhamento ao perfil; avaliacao simulada sem chamada ao LLM.',
    pontuacoes,
    pontos_fortes: ['(mock) comunicacao clara', '(mock) postura resiliente'],
    pontos_atencao: ['(mock) aprofundar metricas de resultado'],
  };
}

// Parsing seguro do JSON do LLM. Remove cercas de markdown se vierem e valida o shape minimo.
function parseAvaliacao(texto) {
  let cru = String(texto || '').trim();
  // Remove cercas ```json ... ``` caso o modelo desobedeca a instrucao de "sem markdown".
  const fence = cru.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cru = fence[1].trim();
  // Recorta do primeiro { ao ultimo } (tolera texto residual ao redor).
  const ini = cru.indexOf('{');
  const fim = cru.lastIndexOf('}');
  if (ini !== -1 && fim !== -1 && fim > ini) cru = cru.slice(ini, fim + 1);

  let obj;
  try {
    obj = JSON.parse(cru);
  } catch (err) {
    throw new Error(`Resposta do LLM nao e JSON valido: ${err.message}. Trecho: ${cru.slice(0, 200)}`);
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.pontuacoes)) {
    throw new Error('JSON do LLM sem o campo "pontuacoes" (array) esperado.');
  }
  return {
    resumo: typeof obj.resumo === 'string' ? obj.resumo : '',
    pontuacoes: obj.pontuacoes
      .filter((p) => p && p.competencia)
      .map((p) => {
        // Fallback: se o LLM omitir "coberta" (ou mandar nao-booleano), assume true
        // (caso mais comum) e apenas loga — nao falha o parse so por isso.
        let coberta = true;
        if (typeof p.coberta === 'boolean') {
          coberta = p.coberta;
        } else {
          console.warn(
            `[relatorio] item de pontuacoes sem "coberta" booleano (competencia="${p.competencia}"); assumindo coberta=true.`,
          );
        }
        return {
          competencia: String(p.competencia),
          nota: Number.isFinite(Number(p.nota)) ? Number(p.nota) : null,
          justificativa: typeof p.justificativa === 'string' ? p.justificativa : '',
          coberta,
        };
      }),
    pontos_fortes: Array.isArray(obj.pontos_fortes) ? obj.pontos_fortes.map(String) : [],
    pontos_atencao: Array.isArray(obj.pontos_atencao) ? obj.pontos_atencao.map(String) : [],
  };
}

// Corpo do e-mail ao recrutador: resumo + tabela de pontuacoes + link p/ pagina completa.
function montarEmailHtml({ candidato, vaga, avaliacao, token }) {
  const link = `${config.baseUrl}/relatorio/${token}`;
  const linhas = avaliacao.pontuacoes
    .map(
      (p) =>
        `<tr>
           <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(p.competencia)}</td>
           <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center"><b>${p.nota != null ? p.nota : '—'}</b>/5</td>
           <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(p.justificativa)}</td>
         </tr>`,
    )
    .join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:640px">
    <h2 style="margin:0 0 4px">Relatorio de entrevista</h2>
    <p style="margin:0 0 16px;color:#555">
      <b>${escapeHtml(nomeDoCandidato(candidato))}</b> — ${escapeHtml((vaga && vaga.titulo) || 'vaga')}
    </p>
    <p>${escapeHtml(avaliacao.resumo)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0">
      <thead>
        <tr style="text-align:left;background:#f4f3f1">
          <th style="padding:6px 10px">Competencia</th>
          <th style="padding:6px 10px;text-align:center">Nota</th>
          <th style="padding:6px 10px">Justificativa</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <p style="margin:18px 0">
      <a href="${link}" style="background:#0d0b0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">
        Ver relatorio completo
      </a>
    </p>
    <p style="color:#888;font-size:12px">${escapeHtml(link)}</p>
  </div>`;
}

// Timestamp no formato do SQLite (UTC, igual a datetime('now')).
function agoraSqlite() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function gerarRelatorio(interviewId, deps = {}) {
  const llm = deps.llm || require('../providers/llm');
  const email = deps.email || require('../providers/email');
  const mock =
    deps.usarMockDeterministico != null ? deps.usarMockDeterministico : config.entrevista.mock;
  const timeoutMs = config.entrevista.timeoutMs;
  const agente = config.agente.nome;

  // ── Idempotencia: se ja existe report ENVIADO para esta entrevista, nao gera de novo. ──
  const jaEnviado = db.obterReportEnviadoPorInterview(interviewId);
  if (jaEnviado) {
    console.log(
      `[relatorio] interview ${interviewId} ja possui report enviado (id=${jaEnviado.id}); ignorando.`,
    );
    return jaEnviado;
  }

  // ── Coleta de dados ──
  const entrevista = db.obterInterview(interviewId);
  if (!entrevista) throw new Error(`Entrevista ${interviewId} nao encontrada.`);
  const candidato = db.obterAplicacao(entrevista.application_id);
  const vaga = candidato ? db.obterVaga(candidato.job_id) : null;
  const roteiro = entrevista.roteiro_id ? db.obterRoteiro(entrevista.roteiro_id) : null;
  const turns = db.listarTurnos(interviewId);

  // ── Geracao da avaliacao (mock deterministico ou LLM real) ──
  let avaliacao;
  if (mock) {
    avaliacao = avaliacaoMock(roteiro);
  } else {
    const mensagens = montarMensagensAvaliacao({ roteiro, vaga, candidato, turns, agente });
    const resp = await comTimeout(
      llm.completar(mensagens, { temperatura: 0.2, maxTokens: 1500 }),
      timeoutMs,
      'LLM (relatorio)',
    );

    // Log de uso/custo (best-effort: NUNCA interrompe a geracao do relatorio).
    try {
      const custo = calcularCustoDeepSeek(resp && resp.uso);
      db.registrarUsoApi({
        provedor: 'openrouter',
        modelo: resp && resp.modelo,
        origem: 'relatorio',
        interview_id: interviewId,
        uso: resp && resp.uso,
        custo_usd: custo,
      });
    } catch (e) {
      console.error('[custos] erro ao registrar uso (relatorio):', e);
    }

    avaliacao = parseAvaliacao(resp && resp.texto);
  }

  // ── Persiste o report (gera token, status 'gerado') ──
  const token = gerarToken();
  const reportId = db.criarReport({
    interview_id: interviewId,
    token,
    status: 'gerado',
    resumo: avaliacao.resumo,
    pontuacoes: avaliacao.pontuacoes,
    destaque_pontos_fortes: avaliacao.pontos_fortes,
    destaque_atencao: avaliacao.pontos_atencao,
  });

  // ── Envio ao recrutador (status 'enviado' em sucesso, 'erro' em falha) ──
  const destinatario = config.recrutador.email;
  try {
    if (!destinatario) throw new Error('RECRUITER_EMAIL nao definido; nao ha para quem enviar.');
    const assunto = `Relatorio de entrevista — ${nomeDoCandidato(candidato)} (${(vaga && vaga.titulo) || 'vaga'})`;
    const html = montarEmailHtml({ candidato, vaga, avaliacao, token });
    if (mock) {
      console.log(
        `[relatorio] (mock) e-mail NAO enviado. destinatario=${destinatario} assunto="${assunto}" link=${config.baseUrl}/relatorio/${token}`,
      );
    } else {
      await comTimeout(email.enviar(destinatario, assunto, html), timeoutMs, 'Resend');
    }
    db.atualizarStatusReport(reportId, 'enviado', { destinatario, enviado_em: agoraSqlite() });
  } catch (err) {
    db.atualizarStatusReport(reportId, 'erro', { destinatario });
    console.error(`[relatorio] falha ao enviar e-mail do report ${reportId}: ${err.message}`);
  }

  return db.obterReportPorToken(token);
}

module.exports = {
  gerarRelatorio,
  montarMensagensAvaliacao,
  parseAvaliacao,
  avaliacaoMock,
  montarEmailHtml,
};
