import { useState } from 'react';
import { useAdminApi } from '../hooks/useAdminApi';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { fmtBRL, fmtUSD, fmtDateTime } from '../lib/utils';
import type { CostsResponse } from '../types';

const DAYS_OPTIONS = [7, 30, 90];

export default function Costs() {
  const [days, setDays] = useState('30');
  const { data, loading, error } = useAdminApi<CostsResponse>('/costs', { days, limit: '500' });

  const s = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Custos API</h1>
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

      {/* Sumário */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : s && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader><CardTitle>Total USD</CardTitle></CardHeader>
            <CardContent><span className="text-2xl font-bold">{fmtUSD(s.total_usd)}</span></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Total BRL</CardTitle></CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-red-500">{fmtBRL(s.total_brl)}</span>
              <p className="text-xs text-muted-foreground mt-1">câmbio {data?.rate_usd_brl.toFixed(4)}</p>
            </CardContent>
          </Card>

          {/* Por style */}
          <Card>
            <CardHeader><CardTitle>Por estilo</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {Object.entries(s.by_style).length === 0
                ? <p className="text-xs text-muted-foreground">—</p>
                : Object.entries(s.by_style)
                    .sort(([, a], [, b]) => b - a)
                    .map(([style, cost]) => (
                      <div key={style} className="flex items-center justify-between text-xs">
                        <Badge variant="outline" className="text-xs">{style}</Badge>
                        <span>{fmtUSD(cost)}</span>
                      </div>
                    ))}
            </CardContent>
          </Card>

          {/* Por modelo */}
          <Card>
            <CardHeader><CardTitle>Por modelo</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {Object.entries(s.by_model).length === 0
                ? <p className="text-xs text-muted-foreground">—</p>
                : Object.entries(s.by_model)
                    .sort(([, a], [, b]) => b - a)
                    .map(([model, cost]) => (
                      <div key={model} className="flex items-center justify-between text-xs">
                        <span className="font-mono truncate max-w-28">{model.split('-').slice(-2).join('-')}</span>
                        <span>{fmtUSD(cost)}</span>
                      </div>
                    ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela detalhe */}
      <Card>
        <CardHeader><CardTitle>Chamadas recentes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : !data?.data.length ? (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum registro. Ative COST_RECORDING_ENABLED=true no Vercel para começar a gravar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Estilo</TableHead>
                  <TableHead>Tokens in</TableHead>
                  <TableHead>Tokens out</TableHead>
                  <TableHead>Custo USD</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.endpoint}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{c.style ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{c.input_tokens.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-sm tabular-nums">{c.output_tokens.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-sm font-medium tabular-nums">{fmtUSD(c.cost_usd)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'ok' ? 'success' : 'destructive'} className="text-xs">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmtDateTime(c.created_at)}</TableCell>
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
