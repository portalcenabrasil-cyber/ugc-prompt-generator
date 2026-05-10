// routes/admin.js
// Sub-fase 1.4 — Endpoints /api/admin/* somente leitura.
// Montado em server.js via: app.use('/api/admin', require('./routes/admin')(supabase))
// Toda rota exige token de admin válido (requireAdmin → ADMIN_ENABLED + JWT is_admin).

const express            = require('express');
const fetch              = require('node-fetch');
const { requireAdmin }   = require('../lib/require-admin');

// Preços mensais por plano (BRL) — usado para estimar MRR a partir dos usuários ativos
const PLAN_PRICE = { starter: 69.90, pro: 127.90, agencia: 247.90 };

// Câmbio USD→BRL — cache de 1h independente do cache em server.js
let _rateCache = { rate: 5.70, at: 0 };
async function getRate() {
  if (Date.now() - _rateCache.at < 3_600_000) return _rateCache.rate;
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { timeout: 5000 });
    const d = await r.json();
    const rate = parseFloat(d?.USDBRL?.bid);
    if (!isNaN(rate) && rate > 1) _rateCache = { rate: +rate.toFixed(4), at: Date.now() };
  } catch { /* usa valor em cache */ }
  return _rateCache.rate;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// Emails de teste/admin a excluir de todos os cálculos financeiros
const TEST_EMAILS = new Set([
  'teste@ugc.com',
  'teste.pro@gmail.com',
  'teste.agencia@gmail.com',
  'teste.registro3@gmail.com',
  'test@test.com',
  'fhdyx@gmail.com',
]);

function isRealClient(u) {
  if (u.is_admin) return false;
  if (TEST_EMAILS.has((u.email || '').toLowerCase())) return false;
  return true;
}

// ── Factory — recebe supabase de server.js ──
module.exports = function adminRoutes(supabase) {
  const router = express.Router();

  // Autenticação admin em todas as rotas deste router
  router.use(requireAdmin);

  // Guard: Supabase não configurado
  router.use((req, res, next) => {
    if (!supabase) return res.status(503).json({ error: 'Banco de dados não configurado' });
    next();
  });

  // ── GET /api/admin/kpis ──────────────────────────────────────────────────────
  // KPIs principais: usuários, MRR estimado, receita 30d, custo API 30d, online agora.
  router.get('/kpis', async (req, res) => {
    try {
      const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
      const [usersRes, salesRes, costsRes, rate, galleryTodayRes] = await Promise.allSettled([
        supabase.from('users').select('plan, plan_active, email, is_admin'),
        supabase.from('sales').select('amount_brl').gte('paid_at', daysAgo(30)),
        supabase.from('api_costs').select('cost_usd').gte('created_at', daysAgo(30)),
        getRate(),
        supabase.from('gallery').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      ]);

      // Usuários — exclui admins e contas de teste dos cálculos
      const users    = usersRes.value?.data || [];
      const byPlan   = {};
      let activePlan = 0;
      for (const u of users) {
        if (u.plan_active && isRealClient(u)) {
          activePlan++;
          byPlan[u.plan] = (byPlan[u.plan] || 0) + 1;
        }
      }
      const mrr = Object.entries(byPlan)
        .reduce((sum, [plan, count]) => sum + (PLAN_PRICE[plan] || 0) * count, 0);

      // Receita 30d
      const sales      = salesRes.value?.data || [];
      const revenue30d = sales.reduce((s, r) => s + (parseFloat(r.amount_brl) || 0), 0);

      // Custo API 30d
      const costs    = costsRes.value?.data || [];
      const costUsd  = costs.reduce((s, r) => s + (parseFloat(r.cost_usd) || 0), 0);
      const usdToBrl = rate.status === 'fulfilled' ? rate.value : _rateCache.rate;

      const geracoesHoje = galleryTodayRes.value?.count || 0;

      // Online agora — last_ping_at nos últimos 2 minutos
      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: onlineRows } = await supabase
        .from('presence').select('user_id', { count: 'exact' }).gt('last_ping_at', twoMinsAgo);
      const onlineNow = onlineRows?.length || 0;

      res.json({
        users: {
          total:       users.length,
          active_plan: activePlan,
          free:        users.length - activePlan,
          by_plan:     byPlan,
        },
        revenue: {
          last_30d_brl: +revenue30d.toFixed(2),
          mrr_brl:      +mrr.toFixed(2),
        },
        api_costs: {
          last_30d_usd: +costUsd.toFixed(6),
          last_30d_brl: +(costUsd * usdToBrl).toFixed(2),
        },
        geracoes_hoje:          geracoesHoje,
        online_now:             onlineNow,
        rate_usd_brl:           usdToBrl,
        anthropic_balance_usd:  parseFloat(process.env.ANTHROPIC_BALANCE_USD    || 0),
        anthropic_spent_usd:    parseFloat(process.env.ANTHROPIC_TOTAL_SPENT_USD || 0),
        ts:                     Date.now(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/users ─────────────────────────────────────────────────────
  // Lista de usuários paginada.
  // Query params: ?page=1 &limit=50 &plan=pro &active=true|false &search=email@
  router.get('/users', async (req, res) => {
    try {
      const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
      const page   = Math.max(parseInt(req.query.page)  || 1, 1);
      const offset = (page - 1) * limit;

      let query = supabase
        .from('users')
        .select(
          'id, email, name, plan, plan_active, is_admin, generations_used, generations_limit, prompts_count, tokens_used, created_at',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (req.query.plan)               query = query.eq('plan', req.query.plan);
      if (req.query.active === 'true')  query = query.eq('plan_active', true);
      if (req.query.active === 'false') query = query.eq('plan_active', false);
      if (req.query.search)             query = query.ilike('email', `%${req.query.search}%`);

      const { data, error, count } = await query;
      if (error) return res.status(500).json({ error: error.message });

      res.json({ data, total: count, page, limit });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/sales ─────────────────────────────────────────────────────
  // Vendas confirmadas via webhook Kiwify.
  // Query params: ?days=30 &limit=100 &plan=pro
  router.get('/sales', async (req, res) => {
    try {
      const days  = parseInt(req.query.days)  || 30;
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);

      let query = supabase
        .from('sales')
        .select('id, kiwify_order_id, email, name, plan, amount_brl, net_brl, payment_method, kiwify_event, paid_at, created_at')
        .gte('paid_at', daysAgo(days))
        .order('paid_at', { ascending: false })
        .limit(limit);

      if (req.query.plan) query = query.eq('plan', req.query.plan);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      const total_brl = (data || []).reduce((s, r) => s + (parseFloat(r.amount_brl) || 0), 0);
      res.json({ data, total_brl: +total_brl.toFixed(2), count: data?.length || 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/events ────────────────────────────────────────────────────
  // Eventos de comportamento do tracker (PageView, Generate, Checkout…).
  // Query params: ?days=7 &limit=200 &event_name=Generate
  router.get('/events', async (req, res) => {
    try {
      const days  = parseInt(req.query.days)  || 7;
      const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

      let query = supabase
        .from('events')
        .select('id, trk, user_id, event_name, page_url, properties, ts')
        .gte('ts', daysAgo(days))
        .order('ts', { ascending: false })
        .limit(limit);

      if (req.query.event_name) query = query.eq('event_name', req.query.event_name);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      res.json({ data, count: data?.length || 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/costs ─────────────────────────────────────────────────────
  // Custos Anthropic por chamada + sumário por style e model.
  // Query params: ?days=30 &limit=500
  router.get('/costs', async (req, res) => {
    try {
      const days  = parseInt(req.query.days)  || 30;
      const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
      const rate  = await getRate();

      const { data, error } = await supabase
        .from('api_costs')
        .select('id, user_id, endpoint, style, model, input_tokens, output_tokens, cost_usd, duration_ms, status, created_at')
        .gte('created_at', daysAgo(days))
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return res.status(500).json({ error: error.message });

      const byStyle = {}, byModel = {};
      let totalUsd = 0;
      for (const row of (data || [])) {
        const cost = parseFloat(row.cost_usd) || 0;
        totalUsd += cost;
        if (row.style) byStyle[row.style] = +((byStyle[row.style] || 0) + cost).toFixed(6);
        if (row.model) byModel[row.model] = +((byModel[row.model] || 0) + cost).toFixed(6);
      }

      res.json({
        data,
        summary: {
          total_usd: +totalUsd.toFixed(6),
          total_brl: +(totalUsd * rate).toFixed(2),
          by_style:  byStyle,
          by_model:  byModel,
        },
        rate_usd_brl: rate,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/metrics ───────────────────────────────────────────────────
  // Snapshots diários pré-computados — alimenta gráficos do dashboard.
  // Query params: ?days=30
  router.get('/metrics', async (req, res) => {
    try {
      const days    = Math.min(parseInt(req.query.days) || 30, 365);
      const fromDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('daily_metrics')
        .select('*')
        .gte('date', fromDate)
        .order('date', { ascending: false })
        .limit(days);

      if (error) return res.status(500).json({ error: error.message });

      res.json({ data, days });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/presence ──────────────────────────────────────────────────
  // Usuários online agora (last_ping_at nos últimos 2 minutos).
  router.get('/presence', async (req, res) => {
    try {
      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('presence')
        .select('user_id, email, current_page, current_action, last_ping_at, credits')
        .gt('last_ping_at', twoMinsAgo)
        .order('last_ping_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      res.json({ data, online: data?.length || 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/stats ─────────────────────────────────────────────────────
  // Análise financeira: gerações históricas (gallery), custo real (api_costs),
  // custo estimado histórico (antes do recordCost existir), médias e projeções.
  router.get('/stats', async (req, res) => {
    try {
      const CUSTO_MEDIO_ESTIMADO_USD = 0.011000; // custo médio Haiku (migrado 2026-05)
      const rate = await getRate();

      const [galleryCount, costsRes, usersRes] = await Promise.allSettled([
        supabase.from('gallery').select('id', { count: 'exact', head: true }),
        supabase.from('api_costs').select('cost_usd'),
        supabase.from('users').select('plan, plan_active, email, is_admin'),
      ]);

      const totalGeracoes = galleryCount.value?.count || 0;

      const custoRealUsd = (costsRes.value?.data || [])
        .reduce((s, r) => s + (parseFloat(r.cost_usd) || 0), 0);

      const custoHistoricoUsd = totalGeracoes * CUSTO_MEDIO_ESTIMADO_USD;

      // Apenas clientes reais (excl. admins e emails de teste)
      const users = usersRes.value?.data || [];
      const pagantes = users.filter(u => u.plan_active && u.plan && !['free'].includes(u.plan) && isRealClient(u)).length;

      const geracoesPorPagante = pagantes > 0 ? +(totalGeracoes / pagantes).toFixed(1) : 0;

      // Projeção mensal: custo se cada pagante fizer X gerações/mês
      const projecao30d_usd = geracoesPorPagante * pagantes * CUSTO_MEDIO_ESTIMADO_USD;

      res.json({
        total_geracoes_historico:        totalGeracoes,
        custo_historico_estimado_usd:    +custoHistoricoUsd.toFixed(4),
        custo_historico_estimado_brl:    +(custoHistoricoUsd * rate).toFixed(2),
        custo_real_usd:                  +custoRealUsd.toFixed(6),
        custo_real_brl:                  +(custoRealUsd * rate).toFixed(2),
        custo_medio_por_geracao_usd:     +CUSTO_MEDIO_ESTIMADO_USD.toFixed(6),
        custo_medio_por_geracao_brl:     +(CUSTO_MEDIO_ESTIMADO_USD * rate).toFixed(4),
        usuarios_pagantes:               pagantes,
        geracoes_por_pagante:            geracoesPorPagante,
        projecao_30d_usd:                +projecao30d_usd.toFixed(4),
        projecao_30d_brl:                +(projecao30d_usd * rate).toFixed(2),
        rate_usd_brl:                    rate,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/admin/costs-by-user ─────────────────────────────────────────────
  // Custo total por usuário real (excl. admins e testes).
  // Junta api_costs + gallery (total gerações) por user_id, resolve email via users.
  router.get('/costs-by-user', async (req, res) => {
    try {
      const rate = await getRate();
      const CUSTO_MEDIO_USD = 0.011000; // custo médio Haiku (migrado 2026-05)

      const [usersRes, costsRes, galleryRes] = await Promise.allSettled([
        supabase.from('users').select('id, email, name, plan, plan_active, is_admin'),
        supabase.from('api_costs').select('user_id, cost_usd'),
        supabase.from('gallery').select('user_id'),
      ]);

      const users = (usersRes.value?.data || []).filter(isRealClient);

      // Custo real por user_id (de api_costs)
      const costByUser = {};
      for (const row of (costsRes.value?.data || [])) {
        if (!row.user_id) continue;
        costByUser[row.user_id] = (costByUser[row.user_id] || 0) + (parseFloat(row.cost_usd) || 0);
      }

      // Gerações por user_id (de gallery)
      const genByUser = {};
      for (const row of (galleryRes.value?.data || [])) {
        if (!row.user_id) continue;
        genByUser[row.user_id] = (genByUser[row.user_id] || 0) + 1;
      }

      // Merge — custo real se disponível, estimado se não
      const result = users.map(u => {
        const realCost  = costByUser[u.id] || 0;
        const geracoes  = genByUser[u.id]  || 0;
        const hasReal   = realCost > 0;
        const estCost   = hasReal ? 0 : geracoes * CUSTO_MEDIO_USD;
        const effective = hasReal ? realCost : estCost;
        return {
          id:                 u.id,
          email:              u.email,
          name:               u.name,
          plan:               u.plan,
          plan_active:        u.plan_active,
          total_geracoes:     geracoes,
          custo_usd:          hasReal ? +realCost.toFixed(6) : 0,
          custo_estimado_usd: hasReal ? null : +estCost.toFixed(6),
          custo_brl:          +(effective * rate).toFixed(2),
          custo_tipo:         hasReal ? 'real' : 'estimado',
        };
      }).sort((a, b) => {
        const aEff = a.custo_usd || a.custo_estimado_usd || 0;
        const bEff = b.custo_usd || b.custo_estimado_usd || 0;
        return bEff - aEff;
      });

      res.json({ data: result, rate_usd_brl: rate });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
