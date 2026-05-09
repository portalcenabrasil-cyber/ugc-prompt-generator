// lib/anthropic-cost.js
// Sub-fase 1.3 — Registro de custo Anthropic por chamada.
// Fire-and-forget: nunca lança exceção, nunca bloqueia response.
// Controlado por COST_RECORDING_ENABLED (default false). Ativar com COST_RECORDING_ENABLED=true.

const flags = require('./feature-flags');

// Preços por modelo (USD por milhão de tokens) — atualizar conforme pricing da Anthropic
const MODEL_PRICING = {
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
};

function calcCostUsd(model, input_tokens, output_tokens) {
  const p = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-6'];
  return (input_tokens / 1_000_000) * p.input + (output_tokens / 1_000_000) * p.output;
}

// Insere row em `api_costs`. Fire-and-forget — silencioso em qualquer erro.
async function recordCost(supabase, { user_id, endpoint, style, model, input_tokens, output_tokens, duration_ms, status }) {
  console.log('[recordCost] flag=', process.env.COST_RECORDING_ENABLED, '| enabled=', flags.COST_RECORDING_ENABLED);
  if (!flags.COST_RECORDING_ENABLED || !supabase) return;
  try {
    const cost_usd = calcCostUsd(model || 'claude-sonnet-4-6', input_tokens || 0, output_tokens || 0);
    await supabase.from('api_costs').insert({
      user_id:       user_id       || null,
      endpoint:      endpoint      || null,
      style:         style         || null,
      model:         model         || 'claude-sonnet-4-6',
      input_tokens:  input_tokens  || 0,
      output_tokens: output_tokens || 0,
      cost_usd,
      duration_ms:   duration_ms   || null,
      status:        status        || 'ok',
    });
  } catch { /* silencioso */ }
}

module.exports = { recordCost, calcCostUsd };
