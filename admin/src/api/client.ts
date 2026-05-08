// Token key usada pelo app principal
const TOKEN_KEY = 'ugc_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function redirectToLogin(): never {
  window.location.href = '/?redirect=/admin';
  throw new Error('redirecting');
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = getToken();
  if (!token) redirectToLogin();

  const url = new URL('/api/admin' + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== undefined) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) redirectToLogin();

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string>) => apiFetch<T>(path, params),
};
