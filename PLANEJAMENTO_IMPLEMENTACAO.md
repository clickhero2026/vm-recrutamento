# Planejamento de Implementação — Recrutamento Automático de Vendedores (v2)

Documento de trabalho para guiar a construção via **Claude Code**, fase a fase.
Esta versão incorpora as decisões tomadas e a especificação visual baseada nas telas de referência (micro1).

---

## 0. Decisões já tomadas (resumo)

| Tema | Decisão |
|---|---|
| Front | HTML/CSS/JS vanilla, mobile-first |
| Back | Node.js + Express |
| Banco | **SQLite na v1** (arquivo único em volume persistente), camada de dados agnóstica para migrar a Postgres depois. Postgres "1 clique" disponível no EasyPanel se preferir. |
| LLM | **Multi-provedor** via camada de abstração + OpenRouter como gateway padrão; chaves diretas (DeepSeek, Kimi/Moonshot, Anthropic) como opção de custo |
| STT | **Groq (Whisper) padrão**, OpenAI como fallback |
| TTS | **Google Cloud TTS (voz pt-BR) padrão**, OpenAI TTS como alternativa (ambos baixo custo). **Sem ElevenLabs na v1** |
| E-mail | **Resend** |
| Hospedagem | **Contabo VPS + EasyPanel** (deploy via GitHub) |
| Entrevista | **Áudio**, mobile **e** desktop, **sem compartilhamento de tela e sem proctoring** (mobile-first) |
| Vídeo da entrevista | **Adiado** para evolução futura. v1 grava transcrição + áudio por resposta |
| Câmera | **Opcional**, só presença (não grava vídeo); pode ser pulada no celular |
| Vagas | Modelo **multi-vaga** no banco, operando **uma vaga ativa** na v1 |
| Roteiro | **Orientado a dados** (editável sem mexer em código) |

> **Decisões resolvidas:** entrevista **por áudio**, **sem compartilhamento de tela e sem proctoring**, funcionando **no celular e no desktop** (mobile-first, pois o público usa mais o celular). Câmera **opcional** (só presença, não grava). Banco **SQLite hospedado no próprio VPS via EasyPanel**, em volume persistente.

---

## 1. Visão geral da arquitetura

```
Navegador (candidato)                      Servidor (Node/Express)            Serviços (atrás de adaptadores)
─────────────────────                      ───────────────────────            ───────────────────────────────
Telas 1–9 (HTML/CSS/JS)  ── form/sessão ─►  Rotas + lógica de sessão  ──────►  Banco (SQLite → Postgres)
Tela 10: Entrevista
  • grava áudio (push-to-talk) ── áudio ─►  /api/interview/answer
                                              ├─ STT (transcreve)  ──────────►  Adaptador STT (Groq/OpenAI)
                                              ├─ LLM (próxima pergunta) ─────►  Adaptador LLM (OpenRouter/diretas)
                                              └─ TTS (gera voz)  ────────────►  Adaptador TTS (Google/ElevenLabs)
  • toca a pergunta (áudio)  ◄── áudio+texto ─┘
Tela 11: Finalização     ── encerra ─────►  Gera relatório ──────────────────►  E-mail p/ recrutador (Resend)
```

Princípio: **um único servidor leve**, servindo páginas estáticas e expondo poucas rotas de API. Todos os serviços externos (LLM, STT, TTS, e-mail) ficam atrás de **adaptadores trocáveis por variável de ambiente**.

---

## 2. Camada de abstração de provedores (decisão-chave de design)

Para nunca ficar preso a um fornecedor, todo serviço externo é acessado por uma interface interna:

```
llm.completar(mensagens, opcoes)      → adaptadores: openrouter | deepseek | moonshot(kimi) | anthropic
stt.transcrever(audioBlob, idioma)    → adaptadores: groq | openai | deepgram(futuro)
tts.sintetizar(texto, voz)            → adaptadores: google | openai
email.enviar(destinatario, assunto, html) → adaptador: resend
```

**LLM — por que é fácil ter várias opções:** DeepSeek e Kimi/Moonshot expõem endpoints **compatíveis com a API da OpenAI** (basta trocar `base_url` + `api_key` + `model`). O **OpenRouter** dá acesso a Claude, DeepSeek, Kimi e outros com **uma única chave**, trocando só o nome do modelo — é o gateway padrão recomendado. Chaves diretas ficam como opção de custo.

Ordem de custo aproximada (por 1M tokens, sujeita a variação): DeepSeek V4 Flash ~US$ 0,14/0,28 · Kimi K2.5 ~US$ 0,60/3,00 · Claude (mais caro). Como uma entrevista gasta poucos milhares de tokens, o LLM é a menor fatia do custo.

**STT (push-to-talk = transcrição em lote):** Groq/Whisper como padrão (mais barato e rápido, bom PT-BR), OpenAI como fallback. Deepgram entra só se migrarmos para streaming/VAD no futuro.

**TTS (voz do agente em pt-BR):** Google Cloud TTS (neural pt-BR) como padrão de custo; OpenAI TTS como alternativa. **Sem ElevenLabs na v1** — baixo custo é prioridade absoluta nesta fase.

**Custo estimado por entrevista (faixa, a refinar quando os provedores forem travados):**
- Stack econômico (Groq + DeepSeek + Google TTS): **~US$ 0,05–0,15**
- Stack médio (OpenAI STT + Claude + OpenAI TTS): **~US$ 0,25–0,50**

---

## 3. Modelo de dados (esquema inicial)

```
jobs (vagas)
  id, slug, titulo, perfil ('SDR'|'CLOSER'), faixa_pagamento,
  skills (JSON), descricao, sobre_empresa,
  roteiro_id, ativo, criado_em

roteiros (scripts de entrevista — orientados a dados)
  id, nome, perfil, versao,
  estrutura (JSON: blocos + competências + perguntas-semente + rubrica),
  criado_em, atualizado_em

applications (aplicações)
  id, job_id, nome, sobrenome, email, telefone, cidade,
  linkedin_url, curriculo_path (PDF), curriculo_texto (extraído p/ contexto do agente),
  campos_extras (JSON: disponibilidade, pretensão, horas/semana, etc.),
  token (acesso retomável), status ('aplicado'|'em_entrevista'|'concluido'),
  criado_em

interviews (entrevistas)
  id, application_id, perfil, roteiro_id, status,
  iniciado_em, finalizado_em

interview_turns (turnos da conversa)
  id, interview_id, ordem, autor ('agente'|'candidato'),
  texto, audio_path (opcional), criado_em

reports (relatórios)
  id, interview_id, resumo, pontuacoes (JSON por competência),
  destaque_pontos_fortes, destaque_atencao,
  enviado_em, destinatario
```

Status no `applications` controla a tela 4 (identificação): com `token` válido na sessão, o sistema reconhece o candidato; sem ele (retorno tardio), pede identificação.

`curriculo_texto`: ao receber o PDF, extraímos o texto e guardamos para **o agente referenciar a experiência do candidato** durante a entrevista (como faz o micro1).

---

## 4. Mapa de rotas e telas

**Páginas (servidas pelo servidor):**

| # | Rota | Tela | Observações |
|---|---|---|---|
| 1 | `GET /vaga/:slug` | Vaga | Título, faixa de pagamento, skills (chips), "sobre", botão Aplicar |
| 2 | `GET /aplicar/:slug` | Aplicação | 2 passos: (a) dados+currículo; (b) perguntas extras → cria `application` + `token` |
| 3 | `GET /preparacao` | Preparação | Duração estimada, tópicos, "o que esperar", "antes de começar" |
| 4 | `GET /identificacao` | Identificação | **Só** se não houver sessão/token válido (barra 1/3) |
| 5 | `GET /instrucoes` | Instruções da entrevista | Regras (gravação, não atualizar a página, etc.) |
| 6 | `GET /permissao-camera` | Permissão webcam | `getUserMedia({video})` |
| 7 | `GET /teste-camera` | Teste de câmera | Preview + "Continue" |
| 8 | `GET /permissao-microfone` | Permissão microfone | `getUserMedia({audio})` |
| 9 | `GET /teste-microfone` | Teste de microfone | "Speak" + frase de teste → "check complete" + aceite de termos |
| 10 | `GET /entrevista` | Área de entrevista | Loop de áudio push-to-talk com o agente |
| 11 | `GET /finalizacao` | Finalização | Dispara geração + envio do relatório |

**API (JSON):**

| Método | Rota | Função |
|---|---|---|
| `POST` | `/api/aplicacao` | Cria aplicação, extrai texto do currículo, retorna token |
| `POST` | `/api/identificacao` | Recupera aplicação por email+código |
| `POST` | `/api/interview/start` | Inicia entrevista, retorna 1ª pergunta (texto+áudio) |
| `POST` | `/api/interview/answer` | Recebe áudio → STT → próxima pergunta (texto+áudio) |
| `POST` | `/api/interview/finish` | Encerra, gera relatório, envia e-mail |

---

## 5. Especificação visual (baseada nas telas de referência micro1)

**Tema/identidade — Vendedor Mestre (substitui o lavanda/azul do micro1):**
- **Paleta oficial (máx. 3 cores por tela):** Laranja Fogo `#FF5500` (destaque/CTA, com parcimônia), Preto Autoridade `#0D0B0A` (base/fundos/força), Off-White Limpo `#F4F3F1` (fundos claros). Branco `#FFFFFF` auxiliar; cinzas `#B8B6B2`/`#4A4845` para texto secundário.
- **Combinação principal** (telas de impacto/entrevista): fundo Preto + texto branco + destaques Laranja.
- **Combinação alternativa** (formulários/conteúdo): fundo Off-White + texto Preto + detalhes Laranja.
- **Tipografia:** Barlow Condensed (Black 900 / Bold 700, **sempre em caixa alta**) para títulos/headlines/logotipo; Barlow (400/500/600, sentence case) para corpo; DM Mono opcional para números. Via Google Fonts. **Sem serifas.**
- **Proibido:** azul, roxo, verde, amarelo, vermelho puro, gradientes e transparências coloridas. Botão primário é **Laranja Fogo** (não azul).
- **Personalidade:** autoritária, urgente, direta, sem ornamentos. "Preto como força, laranja como fogo."

**Agente de IA:**
- Representado por um **orbe central animado** (em **Laranja Fogo sobre fundo Preto Autoridade**) com estados visuais: *parado* (idle), *falando* (brilho pulsante laranja), *ouvindo/gravando* (anel "Gravando…").
- O agente de IA se chama **Vera**. O orbe representa a Vera; o nome aparece nas falas/instruções (ex.: "Testando, você me ouve, Vera?").

**Tela 1 — Vaga:** título da vaga, faixa de pagamento, chips de "skills exigidas", bloco "sobre a empresa", botão **Aplicar**. (Opcional: banner "indique e ganhe".)

**Tela 2 — Aplicação (2 passos):**
- Passo 1: nome, sobrenome, e-mail, telefone (com DDI; +55 pré-selecionado p/ BR), LinkedIn (URL), **upload de currículo (PDF)**.
- Passo 2: perguntas extras adaptadas a vendas (ex.: anos de experiência em vendas, segmento B2B/B2C, ferramentas de CRM, pretensão/OTE, disponibilidade de início, horas/semana). Botões **Voltar / Aplicar**.

**Tela 3 — Preparação:** duração estimada, lista de **tópicos** (chips) que serão abordados, "o que esperar" (formato, duração, prazo final), "antes de começar" (lugar silencioso, internet estável), aviso "não atualize a página", botão **Continuar**. Nota: o link da entrevista também é enviado por e-mail (casando com o token retomável).

**Tela 4 — Identificação (fallback):** "Informe seus dados" (nome, e-mail, telefone) com barra de progresso 1/3.

**Tela 5 — Instruções:** regras antes de iniciar (a entrevista é gravada em **áudio** para avaliação; estar em ambiente silencioso; usar push-to-talk para responder), botão **"Pode começar, iniciar entrevista"**. Sem compartilhamento de tela.

**Telas 6–9 — Permissões e testes:**
- Câmera (**opcional, só presença — não grava vídeo**): preview + "Continue". Pode ser pulada no celular.
- Microfone: botão **Speak**, frase de teste ("Testando, você me ouve?"), barra de nível, "Verificação concluída", checkbox de **aceite dos termos**. **Sem compartilhamento de tela.**

**Tela 10 — Entrevista (layout):**
- Orbe do agente no centro.
- **Texto da pergunta** à direita (acessibilidade — sempre visível junto do áudio).
- **Thumbnail da webcam** + seletor de microfone no canto inferior esquerdo.
- **Chips de progresso por tópico** no topo; **timer** no canto superior direito.
- Botão grande **push-to-talk** ("toque para falar / Recording…") abaixo da pergunta.

**Tela 11 — Finalização:** confirmação de conclusão e disparo do relatório.

---

## 6. Motor de entrevista (o coração do sistema)

Fluxo de um turno:

1. **Início:** `/api/interview/start` monta o *system prompt* a partir do **roteiro (dados)** do perfil (SDR ou Closer) + **texto do currículo** do candidato, e devolve a 1ª pergunta (texto + áudio TTS).
2. **Candidato responde:** front captura com `MediaRecorder` (**push-to-talk**: toca para começar, toca para parar) e envia o blob para `/api/interview/answer`.
3. **Servidor processa:** STT transcreve → salva turno do candidato → LLM gera a próxima pergunta **referenciando o que o candidato disse** e cobrindo as competências pendentes → TTS gera o áudio → salva turno do agente → devolve texto + áudio.
4. **Loop** até cobrir as competências / atingir nº de perguntas / o agente decidir encerrar.
5. **Encerramento:** `/api/interview/finish` gera o relatório (resumo + pontuação por competência + transcrição) e envia ao recrutador.

Decisões de design:
- **Push-to-talk** (não VAD) na v1 — confiável no celular. VAD/streaming = melhoria futura (Deepgram).
- **Texto sempre visível** junto do áudio.
- **Barreiras:** limite de tempo por resposta, botão "repetir pergunta", tratamento de silêncio/erro de STT.
- **Estado no servidor:** a conversa fica no banco; o front guarda só o `interview_id`.

---

## 7. Roteiro orientado a dados (modular e editável)

O roteiro é uma estrutura de dados, não código. Exemplo de esquema:

```
roteiro = {
  perfil: "SDR",
  blocos: {
    abertura: ["O que te atrai em vendas?", "Conte sua experiência recente."],
    competencias: [
      { nome: "Resiliência/volume", peso: 2,
        pergunta_semente: "Conte um dia de muitas tentativas e poucos retornos...",
        boa_resposta: "Demonstra constância, método para manter ritmo, não terceiriza culpa." },
      { nome: "Qualificação", peso: 2, pergunta_semente: "...", boa_resposta: "..." },
      ...
    ],
    fechamento: ["Disponibilidade", "Pretensão/comissão", "Por que te escolher?"]
  },
  rubrica: { escala: "1-5", saida: "nota + justificativa curta por competência" }
}
```

O motor **gera o system prompt a partir desse objeto**. Editar competências/perguntas/pesos muda a entrevista **sem tocar no código**. Na v1: JSON versionado ou registros na tabela `roteiros`. Na Fase 5: editor visual no painel do recrutador.

---

## 8. Roteiro de entrevista sugerido (conteúdo inicial)

### Abertura (ambos)
- O que te atrai em trabalhar com vendas?
- Conte rapidamente sua experiência mais recente na área.

### SDR / Pré-vendas — competências
- **Resiliência/volume:** "Conte um dia de muitas tentativas e poucos retornos. Como manteve o ritmo?"
- **Abordagem/comunicação:** "Como aborda um lead frio nos primeiros 30 segundos?"
- **Qualificação:** "Quando percebeu que um lead não era qualificado? Como concluiu isso?"
- **Organização/CRM:** "Como se organiza para não perder follow-ups? Que ferramentas usa?"
- **Lidar com rejeição:** "Conte uma sequência de 'nãos'. O que fez para não desanimar?"
- **Situacional:** "Um lead diz 'não tenho tempo agora'. O que você responde?"

### Closer / Consultor comercial — competências
- **Condução:** "Como estrutura uma reunião de venda do início ao fim?"
- **Descoberta de dor:** "Como descobre a real dor antes de apresentar a solução?"
- **Objeção/fechamento:** "A venda mais difícil que fechou: qual a objeção e como contornou?"
- **Negociação/valor:** "Uma negociação de preço: como defendeu valor sem só dar desconto?"
- **Autocrítica:** "Um negócio que perdeu: o que aprendeu e mudou depois?"
- **Gestão de pipeline:** "Como prioriza com muitas oportunidades abertas?"
- **Track record:** "Qual seu ticket médio e ciclo de vendas no último trabalho?"

### Fechamento (ambos)
Disponibilidade, expectativa de remuneração/comissão e por que deveríamos te escolher.

### Rubrica
Cada competência de 1 a 5 com justificativa curta extraída das respostas + resumo, pontos fortes e pontos de atenção.

---

## 9. Fases de implementação (para o Claude Code)

### Fase 0 — Fundação
- Estrutura do projeto (Express, `public/`, `.env`, scripts), pronta para deploy no EasyPanel via GitHub.
- Banco SQLite + migrações (esquema da seção 3) com **camada de dados agnóstica**.
- Layout base responsivo (tema lavanda/azul, componentes de botão/cabeçalho/orbe/progresso).

### Fase 1 — Funil sem IA (telas 1–5)
- Vaga (lê de `jobs`), Aplicação em 2 passos (+ upload e extração de currículo), Preparação, Identificação (fallback), Instruções.
- Sessão + token; barra de progresso das etapas.

### Fase 2 — Mídia (telas 6–9)
- Permissão e teste de câmera (verificação de presença) e microfone (gravar/reproduzir, nível).
- Tratamento de permissão negada / dispositivo ausente, com instruções por SO/navegador.

### Fase 3 — Motor de entrevista (tela 10)
- Adaptadores STT, LLM e TTS (trocáveis por env).
- Loop push-to-talk completo, texto + áudio, tratamento de erros.
- Persistência turno a turno (+ áudio por resposta).
- System prompt gerado do roteiro (dados) + contexto do currículo.

### Fase 4 — Relatório e envio (tela 11)
- Relatório (resumo + pontuação por competência + transcrição).
- Envio ao recrutador via Resend (+ versão visualizável por link).

### Fase 5 — Painel e ajustes
- Painel do recrutador: listar candidatos, abrir relatórios, **editar roteiros** e **gerenciar múltiplas vagas**.
- Polimento responsivo, acessibilidade, mensagens de erro.
- (Opcional/futuro) Gravação de vídeo + proctoring (provavelmente desktop-only), VAD/streaming, multi-idioma.

Cada fase termina com algo **rodável e testável** antes de avançar.

---

## 10. Riscos e pontos de atenção

- **Áudio no mobile (iOS/Safari):** autoplay exige interação; `MediaRecorder` varia por navegador. Mitigação: push-to-talk + testar cedo no iPhone real.
- **Latência STT→LLM→TTS:** mostrar "pensando…", tocar áudio assim que possível, usar modelos rápidos (Groq).
- **Custo por entrevista:** somar STT+LLM+TTS; definir limite de duração e nº de perguntas.
- **LGPD/consentimento:** deixar claro que áudio (e, no futuro, vídeo) é gravado e para qual finalidade; base legal e política de retenção.
- **STT em PT-BR com ruído:** oferecer "repetir pergunta" e fallback de texto.
- **Persistência/hospedagem do SQLite:** o arquivo `.db` fica num **volume persistente** do app no EasyPanel (ex.: `/data/app.db`), mapeado para o disco do VPS — senão zera a cada redeploy. Manter **uma única instância** do app (SQLite tem um escritor por vez); escalar horizontalmente é o gatilho para migrar a Postgres. Backup: cópia do arquivo via cron ou backup do EasyPanel p/ S3.

---

## 11. Próximo passo imediato

Decisões fechadas. Iniciar a **Fase 0** no Claude Code: estrutura do projeto (Express + `public/` + `.env`), banco **SQLite em volume persistente**, layout base responsivo (tema lavanda/azul + orbe do agente), tudo já preparado para deploy via GitHub no **EasyPanel**.
