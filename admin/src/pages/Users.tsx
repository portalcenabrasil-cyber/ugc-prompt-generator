import { useState } from 'react';
import { useAdminApi } from '../hooks/useAdminApi';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { fmtDate, fmtNum } from '../lib/utils';
import type { UsersResponse } from '../types';

const PLAN_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'outline'> = {
  starter: 'secondary',
  pro:     'default',
  agencia: 'success',
};

export default function Users() {
  const [search, setSearch] = useState('');
  const [plan,   setPlan]   = useState('');
  const [active, setActive] = useState('');
  const [page,   setPage]   = useState(1);

  const params: Record<string, string> = { page: String(page), limit: '50' };
  if (search) params.search = search;
  if (plan)   params.plan   = plan;
  if (active) params.active = active;

  const { data, loading, error } = useAdminApi<UsersResponse>('/users', params);

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Usuários {data && <span className="text-sm font-normal text-muted-foreground">({data.total} total)</span>}
        </h1>
      </div>

      {/* Filtros */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar por email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={plan}
          onChange={e => { setPlan(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os planos</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="agencia">Agência</option>
        </select>
        <select
          value={active}
          onChange={e => { setActive(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos</option>
          <option value="true">Com plano ativo</option>
          <option value="false">Sem plano</option>
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Buscar
        </button>
      </form>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : error ? (
            <p className="p-6 text-sm text-red-500">{error}</p>
          ) : !data?.data.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Gerações</TableHead>
                  <TableHead>Prompts</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{u.email}</div>
                      {u.name && <div className="text-xs text-muted-foreground">{u.name}</div>}
                    </TableCell>
                    <TableCell>
                      {u.plan_active ? (
                        <Badge variant={PLAN_VARIANT[u.plan ?? ''] ?? 'outline'} className="capitalize">
                          {u.plan ?? 'free'}
                        </Badge>
                      ) : (
                        <Badge variant="outline">free</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {fmtNum(u.generations_used)} / {fmtNum(u.generations_limit)}
                    </TableCell>
                    <TableCell className="text-sm">{fmtNum(u.prompts_count)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmtDate(u.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-accent transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-accent transition-colors"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
