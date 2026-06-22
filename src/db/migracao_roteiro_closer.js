'use strict';

// Migracao de DADOS (idempotente): substitui o conteudo do roteiro usado pela vaga
// ativa pelo roteiro Closer/BEI (src/db/roteiro_closer.json) e alinha a vaga ao perfil
// CLOSER. NAO cria registro novo quando o roteiro ja existe: faz UPDATE no roteiro da
// vaga ativa (por padrao id=1). Pode rodar quantas vezes quiser — converge sempre ao
// mesmo estado final.
//
// Seguranca: so escreve no SQLite. NAO toca em chaves nem chama APIs externas; e
// independente de INTERVIEW_MOCK. Roda migrar() antes para garantir schema/colunas.
//
// Uso: node src/db/migracao_roteiro_closer.js   (ou: npm run migrate:roteiro-closer)

const { migrar } = require('./migrate');
const { getDb } = require('./sqlite');

const NOME_ROTEIRO = 'Closer - BEI v1';

function migrarRoteiroCloser() {
  migrar(); // garante schema + colunas incrementais

  const estrutura = require('./roteiro_closer.json');
  const estruturaJson = JSON.stringify(estrutura);
  const db = getDb();

  // Alvo: o roteiro usado pela vaga ativa; na falta dela, o roteiro id=1.
  const vagaAtiva = db
    .prepare('SELECT id, roteiro_id FROM jobs WHERE ativo = 1 ORDER BY criado_em DESC LIMIT 1')
    .get();
  const roteiroId = (vagaAtiva && vagaAtiva.roteiro_id) || 1;
  const existente = db.prepare('SELECT id FROM roteiros WHERE id = ?').get(roteiroId);

  let idFinal = roteiroId;
  if (existente) {
    db.prepare(
      `UPDATE roteiros
         SET nome = ?, perfil = 'CLOSER', versao = 2, estrutura = ?, atualizado_em = datetime('now')
       WHERE id = ?`,
    ).run(NOME_ROTEIRO, estruturaJson, roteiroId);
    console.log(
      `[migracao-roteiro] roteiro id=${roteiroId} ATUALIZADO p/ "${NOME_ROTEIRO}" (perfil CLOSER).`,
    );
  } else {
    // Rede de seguranca: roteiro alvo nao existe -> cria e aponta a vaga p/ ele.
    const info = db
      .prepare("INSERT INTO roteiros (nome, perfil, versao, estrutura) VALUES (?, 'CLOSER', 2, ?)")
      .run(NOME_ROTEIRO, estruturaJson);
    idFinal = Number(info.lastInsertRowid);
    if (vagaAtiva) {
      db.prepare('UPDATE jobs SET roteiro_id = ? WHERE id = ?').run(idFinal, vagaAtiva.id);
    }
    console.log(`[migracao-roteiro] roteiro inexistente; CRIADO id=${idFinal} e vinculado a vaga.`);
  }

  // Alinha a vaga ativa ao perfil CLOSER (Decisao 3, opcao a).
  if (vagaAtiva) {
    db.prepare("UPDATE jobs SET perfil = 'CLOSER' WHERE id = ?").run(vagaAtiva.id);
    console.log(`[migracao-roteiro] vaga ativa id=${vagaAtiva.id} alinhada ao perfil CLOSER.`);
  } else {
    console.warn('[migracao-roteiro] nenhuma vaga ativa encontrada; perfil da vaga nao alterado.');
  }

  return idFinal;
}

if (require.main === module) {
  try {
    const id = migrarRoteiroCloser();
    console.log(`[migracao-roteiro] concluido (roteiro id=${id}).`);
  } catch (err) {
    console.error('[migracao-roteiro] falha:', err.message);
    process.exit(1);
  }
}

module.exports = { migrarRoteiroCloser, NOME_ROTEIRO };
