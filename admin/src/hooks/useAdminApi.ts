import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

export function useAdminApi<T>(path: string, params?: Record<string, string>) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const paramsKey             = JSON.stringify(params ?? {});
  const mountedRef            = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<T>(path, params)
      .then(d  => { if (mountedRef.current) setData(d); })
      .catch(e => { if (mountedRef.current) setError((e as Error).message); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
