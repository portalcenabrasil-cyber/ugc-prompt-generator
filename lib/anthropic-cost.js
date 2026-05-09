// lib/anthropic-cost.js
// Registro de custo Anthropic por chamada — grava sempre (sem flag).
// Fire-and-forget: não bloqueia response. Erros logados no console.

const { createClient } = require('@supabase/supabase-js');

// Preços por modelo (USD por milhão de tokens)
const MODEL_PRICING = {
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
};

function calcCostUsd(model, input_tokens, output_tokens) {
  const p = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-6'];
  return (input_tokens / 1_000_000) * p.input + (output_tokens / 1_000_000) * p.output;
}

// Insere row em `api_costs`. Usa service key diretamente para garantir bypass de RLS.
async function recordCost(_ignored, { user_id, endpoint, style, model, input_tokens, output_tokens, duration_ms, status }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn('[recordCost] SUPABASE_URL ou SUPABASE_SERVICE_KEY ausente — abortando');
    return;
  }
  try {
    const sb = createClient(url, key);
    const cost_usd = calcCostUsd(model || 'claude-sonnet-4-6', input_tokens || 0, output_tokens || 0);
    const { error } = await sb.from('api_costs').insert({
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
    if (error) console.error('[recordCost] insert error:', error.message, error.code);
    else console.log('[recordCost] ok — cost_usd=', cost_usd, 'style=', style);
  } catch (e) {
    console.error('[recordCost] exception:', e.message);
  }
}

module.exports = { recordCost, calcCostUsd };
