import { Users, TrendingUp, DollarSign, Zap, Wifi, BarChart2 } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAdminApi } from '../hooks/useAdminApi';
import { fmtBRL, fmtUSD, fmtDateTime } from '../lib/utils';
import type { KPIs, MetricsResponse, PresenceResponse } from '../types';

export default function Dashboard() {
  const kpis     = useAdminApi<KPIs>('/kpis');
  const metrics  = useAdminApi<MetricsResponse>('/metrics', { days: '30' });
  const presence = useAdminApi<PresenceResponse>('/presence');

  const k = kpis.data;

  // Bar chart helpers
  const metricRows  = metrics.data?.data.slice().reverse() ?? [];
  const maxGen      = Math.max(...metricRows.map(d => d.generations), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* KPI Grid */}
      {kpis.loading ? (
        <p className="text-sm text-muted-foreground">Carregando KPIs…</p>
      ) : kpis.error ? (
        <p className="text-sm text-red-500">{kpis.error}</p>
      ) : k && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Total usuários"
            value={k.users.total}
            sub={`${k.users.active_plan} com plano ativo`}
            icon={Users}
          />
          <StatCard
            title="MRR estimado"
            value={fmtBRL(k.revenue.mrr_brl)}
            sub="planos ativos × preço"
            icon={TrendingUp}
            iconClass="text-green-500"
          />
          <StatCard
            title="Receita 30d"
            value={fmtBRL(k.revenue.last_30d_brl)}
            sub="vendas confirmadas"
            icon={DollarSign}
            iconClass="text-green-500"
          />
          <StatCard
            title="Custo API 30d"
            value={fmtUSD(k.api_costs.last_30d_usd)}
            sub={fmtBRL(k.api_costs.last_30d_brl)}
            icon={Zap}
            iconClass="text-yellow-500"
          />
          <StatCard
            title="Online agora"
            value={k.online_now}
            sub="últimos 2 minutos"
            icon={Wifi}
            iconClass="text-blue-500"
          />
          <StatCard
            title="Câmbio USD/BRL"
            value={`R$ ${k.rate_usd_brl.toFixed(4)}`}
            sub="cache 1h"
            icon={BarChart2}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Planos ativos */}
        {k && (
          <Card>
            <CardHeader><CardTitle>Planos ativos</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(k.users.by_plan).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum plano ativo</p>
              ) : Object.entries(k.users.by_plan).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between text-sm">
                  <Badge variant="secondary" className="capitalize">{plan}</Badge>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-1 border-t">
                <span className="text-muted-foreground">Free</span>
                <span className="font-medium">{k.users.free}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Gerações 30d — mini bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Gerações diárias — 30d</CardTitle></CardHeader>
          <CardContent>
            {metrics.loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : metricRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados de métricas ainda.</p>
            ) : (
              <div className="flex items-end gap-0.5 h-24 overflow-hidden">
                {metricRows.map(d => (
                  <div
                    key={d.date}
                    className="flex-1 bg-primary/70 rounded-t hover:bg-primary transition-colors min-w-0"
                    style={{ height: `${Math.max(4, (d.generations / maxGen) * 100)}%` }}
                    title={`${d.date}: ${d.generations} gerações`}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Online agora */}
      <Card>
        <CardHeader><CardTitle>Online agora</CardTitle></CardHeader>
        <CardContent>
          {presence.loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !presence.data?.data.length ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário online.</p>
          ) : (
            <div className="space-y-2">
              {presence.data.data.map(u => (
                <div key={u.user_id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span>{u.email ?? u.user_id}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{u.current_page ?? '—'}</span>
                    <span>{fmtDateTime(u.last_ping_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
