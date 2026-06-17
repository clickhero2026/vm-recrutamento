-- Esquema do banco (secao 3 do PLANEJAMENTO_IMPLEMENTACAO.md).
-- Escrito em SQL portavel; o que e especifico de SQLite fica isolado em sqlite.js.
-- migrate.js executa este arquivo de forma idempotente (CREATE TABLE IF NOT EXISTS).

-- Vagas (multi-vaga no banco, uma ativa na v1)
CREATE TABLE IF NOT EXISTS jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  titulo          TEXT NOT NULL,
  perfil          TEXT NOT NULL CHECK (perfil IN ('SDR', 'CLOSER')),
  faixa_pagamento TEXT,
  skills          TEXT,            -- JSON (array de strings)
  descricao       TEXT,
  sobre_empresa   TEXT,
  roteiro_id      INTEGER REFERENCES roteiros(id),
  ativo           INTEGER NOT NULL DEFAULT 1,  -- 0/1 (boolean)
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Roteiros de entrevista (orientados a dados, editaveis sem mexer no codigo)
CREATE TABLE IF NOT EXISTS roteiros (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL,
  perfil       TEXT NOT NULL CHECK (perfil IN ('SDR', 'CLOSER')),
  versao       INTEGER NOT NULL DEFAULT 1,
  estrutura    TEXT NOT NULL,     -- JSON: blocos + competencias + perguntas-semente + rubrica
  criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Aplicacoes (candidatos)
CREATE TABLE IF NOT EXISTS applications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id         INTEGER NOT NULL REFERENCES jobs(id),
  nome           TEXT,
  sobrenome      TEXT,
  email          TEXT,
  telefone       TEXT,
  cidade         TEXT,
  linkedin_url   TEXT,
  curriculo_path TEXT,            -- caminho do PDF
  curriculo_texto TEXT,           -- texto extraido p/ contexto do agente
  campos_extras  TEXT,            -- JSON (disponibilidade, pretensao, horas/semana, ...)
  token          TEXT UNIQUE,     -- acesso retomavel
  status         TEXT NOT NULL DEFAULT 'aplicado'
                   CHECK (status IN ('aplicado', 'em_entrevista', 'concluido')),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Entrevistas
CREATE TABLE IF NOT EXISTS interviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  perfil         TEXT NOT NULL CHECK (perfil IN ('SDR', 'CLOSER')),
  roteiro_id     INTEGER REFERENCES roteiros(id),
  status         TEXT NOT NULL DEFAULT 'iniciada',
  iniciado_em    TEXT NOT NULL DEFAULT (datetime('now')),
  finalizado_em  TEXT,
  ultimo_resp_id TEXT   -- id da ultima resposta processada (idempotencia: evita turnos duplicados em retry)
);

-- Turnos da conversa (turno a turno)
CREATE TABLE IF NOT EXISTS interview_turns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  interview_id INTEGER NOT NULL REFERENCES interviews(id),
  ordem        INTEGER NOT NULL,
  autor        TEXT NOT NULL CHECK (autor IN ('agente', 'candidato')),
  texto        TEXT,
  audio_path   TEXT,             -- opcional
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Relatorios
CREATE TABLE IF NOT EXISTS reports (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  interview_id           INTEGER NOT NULL REFERENCES interviews(id),
  resumo                 TEXT,
  pontuacoes             TEXT,   -- JSON por competencia
  destaque_pontos_fortes TEXT,
  destaque_atencao       TEXT,
  enviado_em             TEXT,
  destinatario           TEXT
);

-- Indices uteis
CREATE INDEX IF NOT EXISTS idx_jobs_ativo            ON jobs(ativo);
CREATE INDEX IF NOT EXISTS idx_applications_token    ON applications(token);
CREATE INDEX IF NOT EXISTS idx_applications_job      ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_turns_interview       ON interview_turns(interview_id, ordem);
