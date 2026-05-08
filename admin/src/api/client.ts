// Lê o token do localStorage da app principal — admin já está autenticado
function getToken(): string {
  return localStorage.getItem('token') ?? '';
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL('/api/admin' + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== undefined) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string>) => apiFetch<T>(path, params),
};
