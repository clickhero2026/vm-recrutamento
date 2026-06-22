'use strict';

// Calculo de custo (USD) das chamadas ao LLM DeepSeek (modelo V4-Flash, sem thinking).
//
// Precos OFICIAIS DeepSeek — fonte: https://api-docs.deepseek.com/quick_start/pricing
// Coletados em jun/2026. Valores em USD por 1 MILHAO de tokens.
const PRECOS_DEEPSEEK = {
  inputCacheHitPorMilhao: 0.0028, // entrada com cache HIT (token ja cacheado)
  inputCacheMissPorMilhao: 0.14, // entrada com cache MISS (token novo)
  outputPorMilhao: 0.28, // saida (tokens gerados)
};

const UM_MILHAO = 1_000_000;

// Normaliza para inteiro >= 0 (tolera string/null/undefined/negativo/NaN).
function inteiro(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Calcula o custo em USD a partir do objeto `usage` BRUTO da API DeepSeek.
//   - uso null/undefined/invalido -> 0.
//   - usa o split cache hit/miss quando presente (campos prompt_cache_hit_tokens /
//     prompt_cache_miss_tokens); caso contrario, trata prompt_tokens INTEIRO como
//     cache MISS (conservador: assume o pior preco de entrada).
// Retorna float NAO arredondado para exibicao (precisao de 8 casas, suficiente para
// somas/auditoria sem perder centavos de fracao em volumes altos).
function calcularCustoDeepSeek(uso) {
  if (!uso || typeof uso !== 'object') return 0;

  const output = inteiro(uso.completion_tokens);

  // Split de cache presente? (basta um dos dois campos existir no objeto)
  const temSplit =
    uso.prompt_cache_hit_tokens != null || uso.prompt_cache_miss_tokens != null;

  const cacheHit = temSplit ? inteiro(uso.prompt_cache_hit_tokens) : 0;
  const cacheMiss = temSplit
    ? inteiro(uso.prompt_cache_miss_tokens)
    : inteiro(uso.prompt_tokens); // fallback conservador

  const custo =
    (cacheHit * PRECOS_DEEPSEEK.inputCacheHitPorMilhao +
      cacheMiss * PRECOS_DEEPSEEK.inputCacheMissPorMilhao +
      output * PRECOS_DEEPSEEK.outputPorMilhao) /
    UM_MILHAO;

  return Number(custo.toFixed(8));
}

module.exports = { calcularCustoDeepSeek, PRECOS_DEEPSEEK };

// ── Exemplo de calculo (validacao manual da formula, sem chave real) ──
//
// uso = { prompt_cache_hit_tokens: 1000, prompt_cache_miss_tokens: 500,
//         completion_tokens: 200, prompt_tokens: 1500, total_tokens: 1700 }
//
// custo = (1000 * 0.0028  +  500 * 0.14  +  200 * 0.28) / 1_000_000
//       = (   2.8         +   70.0       +   56.0      ) / 1_000_000
//       = 128.8 / 1_000_000
//       = 0.0001288   ->   $0.00012880
//
// ATENCAO: os precos sao por 1 MILHAO de tokens. Multiplica-se a contagem de tokens
// pelo preco e divide-se UMA UNICA vez por 1_000_000. Um erro comum e ja "embutir" a
// divisao nas parcelas (ex.: escrever 0.0028 no lugar de 1000*0.0028 = 2.8) e ainda
// dividir por 1_000_000 — isso erra o resultado por um fator de ~1000.

// ── Autoteste (NAO roda em import; so com `node src/lib/custos.js`) ──
// Permite validar a formula sem chave real nem chamada de rede. Custo zero.
if (require.main === module) {
  const casos = [
    {
      nome: 'com split de cache (hit 800 / miss 200 / output 500)',
      uso: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        prompt_cache_hit_tokens: 800,
        prompt_cache_miss_tokens: 200,
        total_tokens: 1500,
      },
      esperado: (800 * 0.0028 + 200 * 0.14 + 500 * 0.28) / 1_000_000, // 0.00017024
    },
    {
      nome: 'SEM split (fallback: prompt_tokens 1000 todo como cache miss)',
      uso: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      esperado: (1000 * 0.14 + 500 * 0.28) / 1_000_000, // 0.00028
    },
    {
      nome: 'exemplo da spec (hit 1000 / miss 500 / output 200)',
      uso: {
        prompt_cache_hit_tokens: 1000,
        prompt_cache_miss_tokens: 500,
        completion_tokens: 200,
        prompt_tokens: 1500,
        total_tokens: 1700,
      },
      esperado: (1000 * 0.0028 + 500 * 0.14 + 200 * 0.28) / 1_000_000, // 0.0001288
    },
    { nome: 'uso null -> 0', uso: null, esperado: 0 },
  ];

  let ok = true;
  for (const c of casos) {
    const obtido = calcularCustoDeepSeek(c.uso);
    const passou = Math.abs(obtido - c.esperado) < 1e-12;
    ok = ok && passou;
    console.log(
      `${passou ? 'OK ' : 'FALHOU'} | ${c.nome}\n        esperado=$${c.esperado.toFixed(8)}  obtido=$${obtido.toFixed(8)}`,
    );
  }
  console.log(ok ? '\nTodos os casos passaram.' : '\nHa casos falhando.');
  process.exit(ok ? 0 : 1);
}
