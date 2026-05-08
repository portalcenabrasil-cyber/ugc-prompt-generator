// lib/feature-flags.js
// Feature flags globais do painel admin.
// Toda rota e middleware novo da Fase 1 começa verificando flags.ADMIN_ENABLED.
// Kill switch instantâneo: setar ADMIN_ENABLED=false no Vercel (sem redeploy).

module.exports = {
  // Painel admin (/admin + /api/admin/*)
  // Manter false em produção até Sub-fase 1.5 validada no Preview Deploy.
  ADMIN_ENABLED: process.env.ADMIN_ENABLED === 'true',

  // Tracker de sessões/eventos (/tracker, /checkout-session)
  // default true — desligar com TRACKER_ENABLED=false
  TRACKER_ENABLED: process.env.TRACKER_ENABLED !== 'false',

  // Registro de custo Anthropic por chamada (fire-and-forget em /api/generate*)
  // Manter false até Sub-fase 1.3 estável por 24h.
  COST_RECORDING_ENABLED: process.env.COST_RECORDING_ENABLED === 'true',

  // Webhook Kiwify novo (/api/webhook/kiwify-v2)
  // Manter false até KIWIFY_WEBHOOK_SECRET confirmado + 1.3 estável.
  KIWIFY_WEBHOOK_ENABLED: process.env.KIWIFY_WEBHOOK_ENABLED === 'true',
};
