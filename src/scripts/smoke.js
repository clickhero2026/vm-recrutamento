'use strict';

// Smoke test dos provedores REAIS (LLM / STT / TTS).
//
// ⚠️  ATENCAO: ESTE SCRIPT FAZ CHAMADAS PAGAS DE VERDADE (gasta centavos reais).
//     So rode com as suas chaves no .env. Cada etapa e independente: se faltar a
//     chave do provedor selecionado, a etapa e PULADA com aviso (nao falha tudo).
//
// Uso: npm run smoke:providers

const fs = require('node:fs');
const path = require('node:path');

const { config } = require('../config');
const llm = require('../providers/llm');
const stt = require('../providers/stt');
const tts = require('../providers/tts');

// Chave do provedor LLM selecionado (ou vazio se nao houver).
function chaveLlm() {
  const p = config.provedores.llm;
  if (p.nome === 'openrouter') return p.openrouter.apiKey;
  if (p.nome === 'anthropic') return p.anthropic.apiKey;
  return '';
}
function chaveStt() {
  const p = config.provedores.stt;
  if (p.nome === 'groq') return p.groq.apiKey;
  if (p.nome === 'openai') return p.openai.apiKey;
  return '';
}
function credencialTts() {
  const p = config.provedores.tts;
  if (p.nome === 'google') return p.google.credentialsJson || p.google.credentialsPath;
  if (p.nome === 'openai') return p.openai.apiKey;
  return '';
}

// Gera um WAV minusculo (0,5s, tom suave) para o teste de STT.
function wavDeTeste() {
  const sr = 16000;
  const n = Math.floor(sr * 0.5);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * 300 * i) / sr) * 0.2;
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function main() {
  console.log('────────────────────────────────────────────────────────');
  console.log('  SMOKE TEST DOS PROVEDORES — ⚠️  GASTA CENTAVOS REAIS');
  console.log(`  LLM=${config.provedores.llm.nome}  STT=${config.provedores.stt.nome}  TTS=${config.provedores.tts.nome}`);
  console.log('────────────────────────────────────────────────────────');

  const resumo = [];

  // ── LLM ──
  if (!chaveLlm()) {
    console.log('\n[LLM] PULADO — chave do provedor selecionado ausente no .env.');
    resumo.push(['LLM', 'pulado (sem chave)']);
  } else {
    try {
      console.log('\n[LLM] enviando prompt curto...');
      const r = await llm.completar(
        [
          { papel: 'system', conteudo: 'Responda em uma palavra.' },
          { papel: 'user', conteudo: 'Diga: pronto' },
        ],
        { maxTokens: 5 },
      );
      console.log(`[LLM] resposta: ${JSON.stringify(r.texto)} (modelo ${r.modelo})`);
      resumo.push(['LLM', 'OK']);
    } catch (err) {
      console.log(`[LLM] ERRO: ${err.message}`);
      resumo.push(['LLM', `erro: ${err.message}`]);
    }
  }

  // ── STT ──
  if (!chaveStt()) {
    console.log('\n[STT] PULADO — chave do provedor selecionado ausente no .env.');
    resumo.push(['STT', 'pulado (sem chave)']);
  } else {
    try {
      console.log('\n[STT] transcrevendo um WAV de teste...');
      const r = await stt.transcrever(wavDeTeste(), { idioma: 'pt', mimetype: 'audio/wav' });
      console.log(`[STT] texto: ${JSON.stringify(r.texto)}`);
      resumo.push(['STT', 'OK']);
    } catch (err) {
      console.log(`[STT] ERRO: ${err.message}`);
      resumo.push(['STT', `erro: ${err.message}`]);
    }
  }

  // ── TTS ──
  if (!credencialTts()) {
    console.log('\n[TTS] PULADO — credencial do provedor selecionado ausente no .env.');
    resumo.push(['TTS', 'pulado (sem credencial)']);
  } else {
    try {
      console.log('\n[TTS] sintetizando "Olá, eu sou a Vera."...');
      const r = await tts.sintetizar('Olá, eu sou a Vera.', {});
      const destino = path.join(path.dirname(config.caminhoBanco), 'smoke-vera.mp3');
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, r.audio);
      console.log(`[TTS] salvo em ${destino} (${r.audio.length} bytes, ${r.mime})`);
      resumo.push(['TTS', 'OK']);
    } catch (err) {
      console.log(`[TTS] ERRO: ${err.message}`);
      resumo.push(['TTS', `erro: ${err.message}`]);
    }
  }

  console.log('\n──────────────── RESUMO ────────────────');
  for (const [nome, status] of resumo) {
    console.log(`  ${nome.padEnd(5)} : ${status}`);
  }
  console.log('─────────────────────────────────────────');
}

main().catch((err) => {
  console.error('Falha inesperada no smoke:', err);
  process.exit(1);
});
