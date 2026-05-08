import { useMemo } from 'react';
import { useAdminApi } from '../hooks/useAdminApi';
import { fmtBRL, fmtDateTime } from '../lib/utils';
import type { KPIs, MetricsResponse, PresenceResponse, SalesResponse, CostsResponse, DailyMetric } from '../types';

/* ── helpers ─────────────────────────────────────────────────── */

function getUserFromToken(): { email: string; name: string } {
  try {
    const token = localStorage.getItem('ugc_token') ?? '';
    if (!token) return { email: '', name: '' };
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(b64));
    return { email: p.email ?? '', name: p.name ?? p.email ?? '' };
  } catch { return { email: '', name: '' }; }
}

function initials(name: string | null | undefined, email: string): string {
  const src = name ?? email;
  return src.split(/[\s@._-]+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function monthLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── Line chart ──────────────────────────────────────────────── */

function RevenueChart({ data }: { data: DailyMetric[] }) {
  if (!data.length) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--m-muted)', fontSize: 12 }}>
        Sem dados de métricas ainda — popule daily_metrics ou aguarde gerações.
      </div>
    );
  }

  const W = 520, H = 130, xO = 50, yO = 20, bot = yO + H;
  const maxV = Math.max(...data.map(d => Math.max(d.revenue_brl, d.cost_brl)), 10);

  const toX = (i: number) => xO + (data.length > 1 ? (i / (data.length - 1)) * W : W / 2);
  const toY = (v: number) => bot - Math.max(0, Math.min(v / maxV, 1)) * H;

  const revPts = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.revenue_brl).toFixed(1)}`);
  const costPts = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.cost_brl).toFixed(1)}`);
  const revPath = `M${revPts.join(' L')}`;
  const costPath = `M${costPts.join(' L')}`;
  const areaPath = `${revPath} L${toX(data.length - 1).toFixed(1)},${bot} L${xO},${bot} Z`;

  const labels = [0, 1, 2, 3].map(i => Math.round((maxV / 3) * (3 - i)));
  const dFirst = data[0]?.date.slice(5) ?? '';
  const dMid = data[Math.floor(data.length / 2)]?.date.slice(5) ?? '';
  const dLast = data[data.length - 1]?.date.slice(5) ?? '';

  return (
    <svg
      viewBox={`0 0 ${xO + W + 10} ${bot + 22}`}
      style={{ width: '100%', height: 180, overflow: 'visible' }}
      preserveAspectRatio="none"
    >
      {/* grid lines */}
      {labels.map((_, i) => (
        <line key={i} className="lc-grid"
          x1={xO} y1={yO + (i * H) / 3}
          x2={xO + W} y2={yO + (i * H) / 3} />
      ))}
      {/* y-axis labels */}
      {labels.map((v, i) => (
        <text key={i} x={xO - 4} y={yO + (i * H) / 3 + 3}
          style={{ fill: 'var(--m-muted)', fontSize: 9, textAnchor: 'end', fontFamily: 'inherit' }}>
          {v > 0 ? `R$${v}` : '0'}
        </text>
      ))}
      {/* x-axis */}
      <line className="lc-axis" x1={xO} y1={bot} x2={xO + W} y2={bot} />
      {/* area */}
      <path className="lc-area" d={areaPath} />
      {/* revenue line */}
      <path className="lc-line" d={revPath} />
      {/* cost line */}
      <path className="lc-line2" d={costPath} />
      {/* x labels */}
      <text x={xO} y={bot + 14} style={{ fill: 'var(--m-muted)', fontSize: 9, fontFamily: 'inherit' }}>{dFirst}</text>
      <text x={toX(Math.floor(data.length / 2))} y={bot + 14} style={{ fill: 'var(--m-muted)', fontSize: 9, textAnchor: 'middle', fontFamily: 'inherit' }}>{dMid}</text>
      <text x={xO + W} y={bot + 14} style={{ fill: 'var(--m-muted)', fontSize: 9, textAnchor: 'end', fontFamily: 'inherit' }}>{dLast}</text>
      {/* legend */}
      <text x={xO} y={12} style={{ fill: 'var(--m-primary)', fontWeight: 600, fontSize: 9, fontFamily: 'inherit' }}>— Receita (R$)</text>
      <text x={xO + 90} y={12} style={{ fill: 'var(--m-ink-2)', fontSize: 9, fontFamily: 'inherit' }}>- - Custo API (R$)</text>
    </svg>
  );
}

/* ── Style bars ──────────────────────────────────────────────── */

const STYLE_NAMES: Record<string, string> = {
  base:         'Base',
  'base-v2':    'Base v2',
  serie:        'Edredons Premium',
  nano:         'Nano + Vídeos',
  'nano-veo-2': 'Nano + Vídeos 2',
  'roupa-feminina': 'Roupa Feminina',
};

function StyleBars({ byStyle, rateUsd }: { byStyle: Record<string, number>; rateUsd: number }) {
  const entries = Object.entries(byStyle).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...entries.map(([, v]) => v), 0.0001);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!entries.length) {
    return (
      <p style={{ color: 'var(--m-muted)', fontSize: 12, lineHeight: 1.5 }}>
        Sem dados ainda. Ative <code style={{ background: 'var(--m-panel-2)', padding: '1px 5px', borderRadius: 4 }}>COST_RECORDING_ENABLED=true</code> no Vercel para iniciar.
      </p>
    );
  }

  return (
    <div className="bars">
      {entries.slice(0, 6).map(([style, usd]) => (
        <div className="bar-row" key={style}>
          <span className="lbl" title={STYLE_NAMES[style] ?? style}>{STYLE_NAMES[style] ?? style}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(usd / maxVal) * 100}%` }}>
              ${usd.toFixed(3)}
            </div>
          </div>
          <span className="pct">{total > 0 ? `${((usd / total) * 100).toFixed(0)}%` : '—'}</span>
        </div>
      ))}
      {rateUsd > 0 && total > 0 && (
        <div style={{ borderTop: '1px solid var(--m-line)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
          <span style={{ color: 'var(--m-muted)' }}>Total US$</span>
          <strong style={{ color: 'var(--m-ink)' }}>${total.toFixed(4)} · {fmtBRL(total * rateUsd)}</strong>
        </div>
      )}
    </div>
  );
}

/* ── Dashboard ───────────────────────────────────────────────── */

export default function Dashboard() {
  const kpis     = useAdminApi<KPIs>('/kpis');
  const sales    = useAdminApi<SalesResponse>('/sales', { days: '30', limit: '5' });
  const presence = useAdminApi<PresenceResponse>('/presence');
  const costs    = useAdminApi<CostsResponse>('/costs', { days: '30' });
  const metrics  = useAdminApi<MetricsResponse>('/metrics', { days: '30' });

  const user = useMemo(getUserFromToken, []);

  const k         = kpis.data;
  const online    = presence.data?.data ?? [];
  const lastSales = sales.data?.data ?? [];
  const byStyle   = costs.data?.summary?.by_style ?? {};
  const rateUsd   = costs.data?.rate_usd_brl ?? k?.rate_usd_brl ?? 5.7;
  // metrics come newest-first from API → reverse to oldest-first for chart
  const metricData = (metrics.data?.data ?? []).slice().reverse();

  const margin = k && k.revenue.last_30d_brl > 0
    ? ((k.revenue.last_30d_brl - k.api_costs.last_30d_brl) / k.revenue.last_30d_brl * 100)
    : null;

  const netBRL = k ? k.revenue.last_30d_brl - k.api_costs.last_30d_brl : 0;
  const salesCount = sales.data?.count ?? 0;

  // total tokens from cost records
  const totalTokens = (costs.data?.data ?? []).reduce(
    (s, r) => s + r.input_tokens + r.output_tokens, 0
  );

  return (
    <div className="dash-main">

      {/* ── Topbar ──────────────────────────────────────── */}
      <div className="topbar">
        <div className="topbar-left">
          <h1>Painel Admin · UGC.AI</h1>
          <div className="sub">{user.name || 'Admin'} · {user.email}</div>
        </div>
        <div className="topbar-right">
          <button className="btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
            {capitalize(monthLabel())}
          </button>
          <button className="btn primary" onClick={() => window.open('/', '_blank')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Abrir app
          </button>
        </div>
      </div>

      {/* ── Banner online ────────────────────────────── */}
      {!presence.loading && (
        <div className="banner">
          <span className="pulse" />
          <strong>{presence.data?.online ?? 0} usuário{(presence.data?.online ?? 0) !== 1 ? 's' : ''} online agora</strong>
          {online[0] && (
            <>
              <span style={{ color: 'var(--m-muted)' }}>·</span>
              <span style={{ color: 'var(--m-ink-2)' }}>
                <strong style={{ color: 'var(--m-ink)' }}>{online[0].email ?? online[0].user_id}</strong>
                {online[0].current_action
                  ? <> — {online[0].current_action}</>
                  : online[0].current_page
                    ? <> — em <strong style={{ color: 'var(--m-ink)' }}>{online[0].current_page}</strong></>
                    : null}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--m-muted)' }}>
                {fmtDateTime(online[0].last_ping_at)}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── 4 KPIs ──────────────────────────────────── */}
      {kpis.loading ? (
        <div style={{ color: 'var(--m-muted)', fontSize: 12, marginBottom: 24 }}>Carregando KPIs…</div>
      ) : kpis.error ? (
        <div style={{ color: 'var(--m-red)', fontSize: 12, marginBottom: 24 }}>{kpis.error}</div>
      ) : k && (
        <div className="grid cols-4">
          {/* Receita */}
          <div className="card kpi">
            <div className="kpi-label">Receita do mês</div>
            <div className="kpi-value">{fmtBRL(k.revenue.last_30d_brl)}</div>
            <div className={`kpi-trend ${k.revenue.last_30d_brl > 0 ? 'up' : ''}`}>
              {k.revenue.last_30d_brl > 0 ? '▲' : '—'} {salesCount} venda{salesCount !== 1 ? 's' : ''} confirmada{salesCount !== 1 ? 's' : ''}
            </div>
            <div className="kpi-bd">
              <div className="kpi-bd-row"><span>Kiwify</span><strong>{fmtBRL(k.revenue.last_30d_brl)}</strong></div>
              <div className="kpi-bd-row"><span>MRR estimado</span><strong>{fmtBRL(k.revenue.mrr_brl)}</strong></div>
            </div>
          </div>

          {/* Custo API */}
          <div className="card kpi">
            <div className="kpi-label">Custo API total</div>
            <div className="kpi-value">{fmtBRL(k.api_costs.last_30d_brl)}</div>
            <div className="kpi-trend">
              US$ {k.api_costs.last_30d_usd.toFixed(4)}
            </div>
            <div className="kpi-bd">
              <div className="kpi-bd-row"><span>Anthropic</span><strong>{fmtBRL(k.api_costs.last_30d_brl)}</strong></div>
              <div className="kpi-bd-row"><span>Câmbio USD</span><strong>R$ {k.rate_usd_brl.toFixed(2)}</strong></div>
            </div>
          </div>

          {/* Margem */}
          <div className="card kpi">
            <div className="kpi-label">Margem bruta</div>
            <div className="kpi-value">{margin !== null ? `${margin.toFixed(1)}%` : '—'}</div>
            <div className={`kpi-trend ${netBRL >= 0 ? 'up' : 'down'}`}>
              {netBRL >= 0 ? '▲' : '▼'} {fmtBRL(Math.abs(netBRL))} líquido
            </div>
            <div className="kpi-bd">
              <div className="kpi-bd-row">
                <span>LTV médio</span>
                <strong>{k.users.active_plan > 0 ? fmtBRL(k.revenue.last_30d_brl / k.users.active_plan) : '—'}</strong>
              </div>
              <div className="kpi-bd-row"><span>CAC orgânico</span><strong>R$ 0,00</strong></div>
            </div>
          </div>

          {/* Usuários */}
          <div className="card kpi">
            <div className="kpi-label">Usuários</div>
            <div className="kpi-value">
              {k.users.total}
              {(presence.data?.online ?? 0) > 0 && (
                <span style={{ fontSize: 14, color: 'var(--m-green)', fontWeight: 500 }}>
                  {' '}· {presence.data!.online} online
                </span>
              )}
            </div>
            <div className="kpi-trend up">▲ {k.users.active_plan} pagante{k.users.active_plan !== 1 ? 's' : ''}</div>
            <div className="kpi-bd">
              <div className="kpi-bd-row"><span>Pagantes</span><strong>{k.users.active_plan}</strong></div>
              <div className="kpi-bd-row"><span>Free / sem plano</span><strong>{k.users.free}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Funil + Origem ──────────────────────────── */}
      <div className="sec-title">Aquisição e conversão</div>
      <div className="grid cols-3-2">

        {/* Funil */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Funil de conversão</h3>
              <div className="sub">Do cadastro à compra · 30 dias</div>
            </div>
            {k && k.users.total > 0 && k.users.active_plan > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--m-muted)', textAlign: 'right' }}>
                Conversão cadastro→pago
                <strong style={{ color: 'var(--m-ink)', fontSize: 14, display: 'block', marginTop: 2 }}>
                  {((k.users.active_plan / k.users.total) * 100).toFixed(1)}%
                </strong>
              </div>
            )}
          </div>
          <div className="funnel">
            <div className="funnel-step" style={{ width: '100%', maxWidth: 420 }}>
              <div className="name">Visitantes</div>
              <div className="num" style={{ color: 'var(--m-muted)', fontSize: 16 }}>— rastreamento ativo</div>
            </div>
            <div className="funnel-step" style={{ width: '78%', maxWidth: 330 }}>
              <div className="name">Cadastros</div>
              <div className="num">{k?.users.total ?? '—'}</div>
              {k && (
                <div className="funnel-side right">
                  <strong>{k.users.active_plan}</strong>
                  <span style={{ fontSize: 10 }}>com plano ativo</span>
                </div>
              )}
            </div>
            <div className="funnel-step" style={{ width: '58%', maxWidth: 240 }}>
              <div className="name">1ª geração</div>
              <div className="num" style={{ color: 'var(--m-muted)', fontSize: 16 }}>—</div>
            </div>
            <div className="funnel-step" style={{ width: '42%', maxWidth: 180 }}>
              <div className="name">Compra</div>
              <div className="num">{salesCount}</div>
              {k && salesCount > 0 && (
                <div className="funnel-side right">
                  <strong>{fmtBRL(k.revenue.last_30d_brl / salesCount)}</strong>
                  <span style={{ fontSize: 10 }}>ticket médio</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Origem */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Origem dos visitantes</h3>
              <div className="sub">Atribuição UTM + referrer</div>
            </div>
          </div>
          <div style={{ padding: '18px 0 8px', textAlign: 'center', color: 'var(--m-muted)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
              style={{ width: 40, height: 40, margin: '0 auto 10px', display: 'block', opacity: 0.35 }}>
              <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9" /><path d="M3 12a9 9 0 0 1 9-9" />
              <path d="M12 12v.01" />
            </svg>
            <div style={{ fontSize: 12 }}>Dados de UTM aparecerão aqui</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>
              Rastreamento via sessions iniciado — dados acumulando.
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--m-line)', marginTop: 12, paddingTop: 12, fontSize: 11.5, color: 'var(--m-ink-2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--m-amber)' }}>⚠</strong>{' '}
            Configure parâmetros UTM em todos os links de divulgação para ver a atribuição de origem.
          </div>
        </div>
      </div>

      {/* ── Comportamento: gráfico + estilos ──────── */}
      <div className="sec-title">Comportamento e uso</div>
      <div className="grid cols-2-3">

        {/* Line chart */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Receita × custo API</h3>
              <div className="sub">Últimos 30 dias</div>
            </div>
          </div>
          <RevenueChart data={metricData} />
        </div>

        {/* Estilos */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Estilos mais usados</h3>
              <div className="sub">Custo Anthropic por estilo · 30d</div>
            </div>
          </div>
          <StyleBars byStyle={byStyle} rateUsd={rateUsd} />
          {totalTokens > 0 && (
            <div style={{ borderTop: '1px solid var(--m-line)', marginTop: 14, paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11.5 }}>
              <div>
                <div style={{ color: 'var(--m-muted)' }}>Total gerações</div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{costs.data?.data.length ?? '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--m-muted)' }}>Tokens (Anthropic)</div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {totalTokens > 1_000_000
                    ? `${(totalTokens / 1_000_000).toFixed(1)}M`
                    : `${(totalTokens / 1_000).toFixed(0)}K`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Últimas vendas + Atividade ao vivo ────── */}
      <div className="grid cols-2" style={{ marginTop: 16 }}>

        {/* Vendas */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Últimas vendas</h3>
              <div className="sub">Atribuição completa por compra</div>
            </div>
            <button className="btn" style={{ fontSize: 11.5, padding: '5px 10px' }}
              onClick={() => window.location.href = '/admin/sales'}>
              Ver tudo
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Origem</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {sales.loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--m-muted)', padding: 20 }}>Carregando…</td></tr>
              ) : !lastSales.length ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--m-muted)', padding: '20px 0' }}>— sem vendas no período —</td></tr>
              ) : lastSales.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="who">
                      <div className="avatar">{initials(s.name, s.email)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name ?? s.email.split('@')[0]}</div>
                        <div style={{ fontSize: 11, color: 'var(--m-muted)' }}>{s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{s.plan ?? '—'}</td>
                  <td>
                    <span className="source-pill src-org">Orgânico</span>
                    <div style={{ fontSize: 10, color: 'var(--m-muted)', marginTop: 2 }}>sem UTM</div>
                  </td>
                  <td className="amount">{fmtBRL(s.amount_brl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Atividade ao vivo */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Atividade ao vivo</h3>
              <div className="sub">Usuários online agora + últimas ações</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--m-green)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="pulse" style={{ width: 6, height: 6 }} />
              ao vivo
            </span>
          </div>
          <div className="online-list">
            {presence.loading ? (
              <div style={{ color: 'var(--m-muted)', fontSize: 12, padding: 12 }}>Carregando…</div>
            ) : !online.length ? (
              <div style={{ color: 'var(--m-muted)', fontSize: 12, padding: 12 }}>Nenhum usuário online no momento.</div>
            ) : online.map(u => (
              <div className="online-row" key={u.user_id}>
                <div className="dot" />
                <div>
                  <div className="name">{u.email ?? u.user_id}</div>
                  <div className="time">{fmtDateTime(u.last_ping_at)}</div>
                </div>
                <div className="doing">{u.current_action ?? u.current_page ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--m-muted)' }}>
                  {u.credits !== null ? `${u.credits} cred` : '∞'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Custos detalhados ──────────────────────── */}
      <div className="sec-title">Custos detalhados — Anthropic</div>
      <div className="grid cols-3">

        {/* Custo por estilo */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Custo por estilo</h3>
              <div className="sub">USD real → BRL · cotação {rateUsd.toFixed(2)}</div>
            </div>
          </div>
          <StyleBars byStyle={byStyle} rateUsd={rateUsd} />
        </div>

        {/* Tokens por modelo */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Tokens consumidos</h3>
              <div className="sub">Por modelo · 30d</div>
            </div>
          </div>
          {costs.data && Object.keys(costs.data.summary.by_model).length > 0 ? (
            <>
              <div className="bars" style={{ marginTop: 8 }}>
                {Object.entries(costs.data.summary.by_model)
                  .sort((a, b) => b[1] - a[1])
                  .map(([model, usd]) => {
                    const modelShort = model.includes('haiku') ? 'Haiku' : model.includes('sonnet') ? 'Sonnet' : model;
                    const maxM = Math.max(...Object.values(costs.data!.summary.by_model));
                    return (
                      <div className="bar-row" key={model}>
                        <span className="lbl" title={model}>{modelShort}</span>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(usd / maxM) * 100}%` }}>
                            ${usd.toFixed(4)}
                          </div>
                        </div>
                        <span className="pct">{fmtBRL(usd * rateUsd)}</span>
                      </div>
                    );
                  })}
              </div>
              {totalTokens > 0 && (
                <div style={{ borderTop: '1px solid var(--m-line)', marginTop: 12, paddingTop: 10, fontSize: 11.5, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--m-muted)' }}>Total tokens</span>
                  <strong>{totalTokens > 1_000_000 ? `${(totalTokens / 1_000_000).toFixed(2)}M` : `${Math.round(totalTokens / 1_000)}K`}</strong>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--m-muted)', fontSize: 12 }}>
              Sem dados de modelo ainda.
            </p>
          )}
        </div>

        {/* Margem geral */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Margem geral</h3>
              <div className="sub">Receita − custo Anthropic · 30d</div>
            </div>
          </div>
          {k ? (
            <>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', margin: '8px 0 4px', color: 'var(--m-ink)' }}>
                {margin !== null ? `${margin.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: netBRL >= 0 ? 'var(--m-green)' : 'var(--m-red)' }}>
                {netBRL >= 0 ? '▲' : '▼'} {fmtBRL(Math.abs(netBRL))} líquido no período
              </div>
              <div style={{ borderTop: '1px solid var(--m-line)', marginTop: 14, paddingTop: 12, display: 'grid', gap: 8, fontSize: 11.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--m-muted)' }}>Receita 30d</span>
                  <strong>{fmtBRL(k.revenue.last_30d_brl)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--m-muted)' }}>Custo API 30d</span>
                  <strong>{fmtBRL(k.api_costs.last_30d_brl)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--m-muted)' }}>Câmbio USD/BRL</span>
                  <strong>R$ {k.rate_usd_brl.toFixed(2)}</strong>
                </div>
                {salesCount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--m-muted)' }}>Ticket médio</span>
                    <strong style={{ color: 'var(--m-green)' }}>{fmtBRL(k.revenue.last_30d_brl / salesCount)}</strong>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--m-muted)', fontSize: 12 }}>Carregando…</p>
          )}
        </div>
      </div>

      <p style={{ textAlign: 'center', color: 'var(--m-muted)', fontSize: 11, marginTop: 32, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        UGC.AI Admin · dados ao vivo
      </p>
    </div>
  );
}
