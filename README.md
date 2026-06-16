# Vendedor Mestre — Recrutamento Automático de Vendedores

Sistema web de recrutamento para perfis de vendas (**SDR** e **Closer**), com entrevista conduzida por um agente de IA por áudio chamado **Vera**. Ao final, gera um relatório por candidato e envia ao recrutador.

> **Estado atual: Fase 0 (Fundação).** Base do projeto rodável e testável: servidor Express, banco SQLite com camada de dados agnóstica, layout base na identidade Vendedor Mestre e adaptadores (interfaces + *stubs*) para LLM, STT, TTS e e-mail. **A IA ainda não está implementada** (Fases 3 e 4).

Fontes da verdade: [`INSTRUCOES_PROJETO.md`](./INSTRUCOES_PROJETO.md) e [`PLANEJAMENTO_IMPLEMENTACAO.md`](./PLANEJAMENTO_IMPLEMENTACAO.md).

## Stack

- **Back:** Node.js + Express (servidor único).
- **Front:** HTML/CSS/JS vanilla, mobile-first. Sem frameworks de front.
- **Banco:** SQLite (`better-sqlite3`) num caminho configurável; camada de dados agnóstica para migrar a Postgres depois.
- **Serviços externos:** LLM, STT, TTS e e-mail atrás de adaptadores trocáveis por variável de ambiente (na Fase 0, apenas interfaces + stubs).
- **Hospedagem:** Contabo VPS + EasyPanel, deploy via GitHub.

## Princípios inegociáveis

- Leve por padrão; só adicionar dependência quando justificável.
- Mobile-first e responsivo.
- Baixo custo é lei (sem ElevenLabs; provedores baratos por padrão).
- Sem lock-in: todo serviço externo atrás de adaptador trocável por env.
- Segredos só em `.env`, nunca no código.
- Uma única instância do app (SQLite tem um escritor por vez).

## Rodar localmente

Pré-requisitos: **Node.js 20+** (testado no 22 LTS).

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite .env se quiser (os defaults já funcionam para desenvolvimento)

# 3. Popular o banco com 1 vaga (SDR) + 1 roteiro de exemplo
npm run seed

# 4. Subir o servidor (com reload automático)
npm run dev
```

Acesse:

- App: <http://localhost:3000>
- Vaga de exemplo: <http://localhost:3000/vaga/sdr-prevendas>
- Healthcheck: <http://localhost:3000/health> → `{ "ok": true, "banco": true, "agente": "Vera" }`

Scripts disponíveis:

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor com `--watch` (reload ao salvar). |
| `npm start` | Sobe o servidor (produção). |
| `npm run migrate` | Cria/atualiza as tabelas a partir de `src/db/schema.sql` (idempotente). |
| `npm run seed` | Insere a vaga SDR + roteiro de exemplo (idempotente). |

> O servidor roda as migrações automaticamente no boot — `npm run migrate` é só para rodar isoladamente.

## Estrutura

```
.
├── package.json
├── .env.example          # todas as chaves (placeholders, sem valores reais)
├── .gitignore            # ignora /node_modules, /data/*, .env
├── Dockerfile            # Node LTS; compila better-sqlite3; volume /data
├── README.md
├── data/                 # volume persistente: app.db vive aqui (gitignored)
├── public/
│   ├── css/{tokens,base}.css   # tokens VM + reset/layout/componentes
│   ├── js/app.js               # JS mínimo do cliente
│   ├── assets/                 # favicon + logo placeholder
│   └── partials/               # header (logo), barra de progresso, orbe da Vera
└── src/
    ├── server.js         # bootstrap Express, estáticos, rotas, GET /health
    ├── config.js         # lê e valida o .env (única fonte de config)
    ├── views.js          # renderização das páginas (layout base + parciais)
    ├── db/
    │   ├── index.js      # camada de dados AGNÓSTICA (funções de negócio)
    │   ├── sqlite.js     # implementação concreta (better-sqlite3) — isolada
    │   ├── migrate.js    # cria tabelas (idempotente)
    │   ├── schema.sql    # esquema (jobs, roteiros, applications, interviews, ...)
    │   └── seed.js       # 1 vaga SDR + 1 roteiro de exemplo
    ├── providers/        # adaptadores trocáveis por env (interfaces + stubs)
    │   ├── llm/{index,openrouter,deepseek,anthropic}.js
    │   ├── stt/{index,groq,openai}.js
    │   ├── tts/{index,google,openai}.js
    │   └── email/{index,resend}.js
    ├── routes/
    │   ├── pages.js      # 11 telas do funil (placeholders com layout base)
    │   └── api.js        # rotas de API (stubs que respondem 501)
    └── lib/
        └── session.js    # sessão + token (esqueleto)
```

### Camada de dados agnóstica

As rotas importam só de `src/db/index.js`, que expõe **funções de negócio** (`obterVagaAtiva`, `criarAplicacao`, `criarRoteiro`, …). Toda query SQLite vive em `src/db/sqlite.js`. Para migrar a Postgres: criar `src/db/postgres.js` com o mesmo contrato e trocar o `require` em `index.js` — sem tocar nas rotas.

### Adaptadores de serviços externos

Cada serviço tem uma interface (`index.js`) que seleciona o provedor por env e roteia para o adaptador. Na Fase 0 os adaptadores são *stubs* que lançam erro claro (ex.: `Provedor LLM "openrouter" ainda não implementado - Fase 3.`).

| Serviço | Variável | Opções | Padrão |
|---|---|---|---|
| LLM | `LLM_PROVIDER` | `openrouter` \| `deepseek` \| `anthropic` | `openrouter` |
| STT | `STT_PROVIDER` | `groq` \| `openai` | `groq` |
| TTS | `TTS_PROVIDER` | `google` \| `openai` | `google` |
| E-mail | (fixo) | `resend` | `resend` |

## Identidade visual (Vendedor Mestre)

Definida em `public/css/tokens.css`. Regras: **máximo 3 cores por tela**; laranja é destaque (com parcimônia); **botão primário é laranja**. Combinação principal = fundo preto + texto branco + destaque laranja; alternativa = fundo off-white + texto preto + detalhe laranja. **Proibido:** azul, roxo, verde, amarelo, vermelho puro, gradientes e transparências coloridas. Fontes Barlow Condensed (títulos, caixa alta) + Barlow (corpo) via Google Fonts.

## Deploy no EasyPanel (Contabo VPS)

O deploy é a partir do GitHub. O `Dockerfile` já está pronto (também compatível com Nixpacks).

1. **Subir o código no GitHub** (este repositório).
2. No EasyPanel, criar um **App service** apontando para o repositório GitHub (branch principal).
   - Build: o EasyPanel detecta o `Dockerfile` automaticamente.
3. **Variáveis de ambiente** (Environment): preencher conforme `.env.example`.
   - **Obrigatórias nesta fase:** `SESSION_SECRET` (um valor forte), `RECRUITER_EMAIL`.
   - `DATABASE_PATH=/data/app.db` (aponta para o volume — veja abaixo).
   - `PORT` pode ficar no default `3000` (o EasyPanel mapeia para a porta pública).
   - As chaves de API (LLM/STT/TTS/Resend) só são necessárias a partir das Fases 3/4.
4. **Volume persistente:** criar um **Mount** em `/data`.
   - ⚠️ **Sem isso o banco zera a cada redeploy.** O arquivo `app.db` vive nesse volume.
5. **SSL:** ativar o certificado (Let's Encrypt) para o domínio.
6. **Deploy.** Na inicialização, o app roda as migrações automaticamente e expõe `GET /health` — use essa rota como healthcheck.
7. (Opcional) Rodar o seed uma vez no ambiente, via console do serviço: `npm run seed`.

**Backup:** copiar periodicamente o `app.db` do volume (cron ou backup do EasyPanel para S3). Escalar horizontalmente é o gatilho para migrar a Postgres (SQLite = um escritor por vez).

## Próxima fase

**Fase 1 — Funil sem IA (telas 1–5):** vaga (lê de `jobs`), aplicação em 2 passos (+ upload e extração de currículo), preparação, identificação (fallback) e instruções, com sessão + token.
