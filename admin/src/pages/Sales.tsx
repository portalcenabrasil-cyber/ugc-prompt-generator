import { useState } from 'react';
import { useAdminApi } from '../hooks/useAdminApi';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { fmtBRL, fmtDate } from '../lib/utils';
import type { SalesResponse } from '../types';

const PLAN_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  starter: 'secondary',
  pro:     'default',
  agencia: 'success',
};

const DAYS_OPTIONS = [7, 30, 90];

export default function Sales() {
  const [days, setDays] = useState('30');
  const { data, loading, error } = useAdminApi<SalesResponse>('/sales', { days, limit: '200' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vendas</h1>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(String(d))}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                days === String(d)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Receita no período</CardTitle></CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-600">
              {loading ? '…' : fmtBRL(data?.total_brl ?? 0)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Nº de vendas</CardTitle></CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{loading ? '…' : (data?.count ?? 0)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : error ? (
            <p className="p-6 text-sm text-red-500">{error}</p>
          ) : !data?.data.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma venda no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.email}</TableCell>
                    <TableCell>
                      <Badge variant={PLAN_VARIANT[s.plan ?? ''] ?? 'outline'} className="capitalize">
                        {s.plan ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-green-600">{fmtBRL(s.amount_brl)}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{s.payment_method ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(s.paid_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
