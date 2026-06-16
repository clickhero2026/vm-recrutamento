# Instruções do Projeto — Sistema de Recrutamento Automático de Vendedores

> Cole este texto no campo **"Instruções"** do Projeto. Ele é o contexto persistente que toda conversa (incluindo o Claude Code) deve carregar.

## 1. O que estamos construindo

Um sistema **web** de recrutamento **automático** para profissionais de vendas. O candidato percorre um funil de telas, do anúncio da vaga até uma **entrevista conduzida por um agente de IA por áudio**, e ao final o sistema gera um **relatório por candidato** e envia ao recrutador.

A referência visual/estrutural é o **micro1** (sistema de recrutamento automático para profissionais de After Effects), adaptado aqui para **vendedores**.

## 2. Para quem (personas de candidato)

- **SDR / Pré-vendas:** prospecção, qualificação de leads, volume e ritmo, resiliência à rejeição, organização e uso de CRM.
- **Closer / Consultor comercial:** condução de reunião, descoberta de dor, construção de valor, negociação, contorno de objeções e fechamento.

A vaga (e o roteiro de entrevista) deve poder ser configurada para um desses dois perfis.

## 3. Princípios técnicos (inegociáveis)

- **Leve por padrão:** HTML + CSS + JavaScript mínimo no front. Sem frameworks pesados sem necessidade real.
- **Mobile-first e responsivo:** o candidato responde tudo, incluindo a entrevista por áudio, pelo celular.
- **Acessível:** toda fala do agente também aparece em texto na tela; controles grandes e claros (push-to-talk).
- **Privacidade e consentimento explícitos:** webcam/microfone só são acionados após telas dedicadas de permissão e teste.
- **Dados organizados:** tudo que o candidato preenche e responde é persistido de forma estruturada num banco de dados.
- **Continuidade sem reescrever dados:** no fluxo contínuo, o sistema reconhece os dados já preenchidos (sessão/token). A tela de identificação só aparece quando o candidato retorna depois (link com token).
- **Sem lock-in:** todo serviço externo (LLM, STT, TTS, e-mail) fica atrás de um **adaptador trocável por variável de ambiente**.

## 4. Etapas do funil (telas)

1. Página da Vaga
2. Página de Aplicação (2 passos: dados + currículo PDF; depois perguntas extras)
3. Página de Preparação para Entrevista
4. Página de Identificação (fallback — só quando o candidato volta horas depois)
5. Instruções para início da entrevista
6. Permissão de webcam
7. Teste de câmera
8. Permissão de microfone
9. Teste de microfone
10. Área de Entrevista (agente de IA por áudio: pergunta, ouve e incorpora o que o candidato disse nas próximas perguntas)
11. Finalização da entrevista

## 5. Requisitos funcionais centrais

- **Entrevista por áudio com IA:** o agente faz perguntas faladas (TTS), ouve a resposta (STT) e gera a próxima pergunta referenciando o que o candidato respondeu. Roteiro adaptado ao perfil (SDR ou Closer) e ao currículo do candidato.
- **Persistência completa:** dados do formulário + transcrição turno a turno + áudio por resposta + metadados (timestamps, perfil).
- **Relatório automático:** ao finalizar, gerar relatório por candidato (resumo, pontuação por competência, transcrição) e enviar ao recrutador.

## 6. Stack confirmada

- **Front:** HTML/CSS/JS vanilla, mobile-first. **Identidade Vendedor Mestre**: Preto Autoridade `#0D0B0A`, Laranja Fogo `#FF5500` (destaque/CTA, com parcimônia), Off-White Limpo `#F4F3F1`; fontes Barlow Condensed (títulos, caixa alta) + Barlow (corpo). Botão primário laranja. Proibido azul/roxo/gradiente. Agente de IA chamado **Vera**, representado por um orbe animado (laranja sobre preto).
- **Back:** Node.js + Express (single server).
- **Banco:** **SQLite na v1** (arquivo único em volume persistente), com camada de dados agnóstica para migrar a Postgres depois. Postgres "1 clique" disponível no EasyPanel se preferir.
- **LLM:** **multi-provedor** via camada de abstração. Gateway padrão **OpenRouter** (uma chave → Claude, DeepSeek, Kimi e outros); chaves diretas (DeepSeek, Moonshot/Kimi, Anthropic) como opção de custo.
- **STT:** **Groq (Whisper) padrão**, OpenAI como fallback. (Push-to-talk = transcrição em lote.)
- **TTS:** **Google Cloud TTS (voz pt-BR) padrão**, OpenAI TTS como alternativa. **Sem ElevenLabs na v1** (baixo custo é prioridade).
- **E-mail:** **Resend**.
- **Captura no navegador:** `getUserMedia` + `MediaRecorder`, **push-to-talk** (mais confiável no mobile).
- **Hospedagem:** **Contabo VPS + EasyPanel**, deploy via GitHub.

## 7. Como o Claude deve trabalhar neste projeto

- Responder e escrever código/comentários em **português do Brasil**.
- **Confirmar antes** de ações irreversíveis ou de custo (configurar provedores pagos, enviar e-mails de verdade, apagar dados).
- Preferir incrementos pequenos e testáveis; entregar uma etapa funcionando antes de seguir.
- Manter o código simples e legível; só adicionar dependência quando justificável.
- Manter todo serviço externo atrás de adaptador trocável por env; segredos só em variáveis de ambiente, nunca no código.
- Roteiro de entrevista é **orientado a dados** (editável sem mexer no código).
- Sempre que tocar em câmera/microfone, garantir consentimento e fallbacks (permissão negada, dispositivo ausente).

## 8. Decisões fechadas

- **Entrevista:** por **áudio**, funcionando **no celular e no desktop** (mobile-first), **sem compartilhamento de tela e sem proctoring**.
- **Câmera:** opcional (só presença, não grava vídeo); pode ser pulada no celular.
- **Banco:** **SQLite**, hospedado no próprio VPS via EasyPanel em **volume persistente** (ex.: `/data/app.db`); uma única instância do app; camada de dados agnóstica para migrar a Postgres se escalar.
- **Vídeo da entrevista:** adiado como evolução futura.

## 9. Estado atual

- Fase: **pronto para iniciar a implementação (Fase 0)**.
- Próximo passo: estrutura do projeto + banco SQLite (volume persistente no EasyPanel) + layout base, com deploy via GitHub no EasyPanel.
