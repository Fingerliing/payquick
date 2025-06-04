export interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function fetchWithToken<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: HeadersInit = {
    ...(options.headers || {}),
    ...(token && options.requireAuth !== false
      ? { Authorization: `Bearer ${token}` }
      : {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    console.error(`[fetchWithToken] ${res.status} ${res.statusText}`, error);
    throw new Error(error.detail || 'Erreur serveur');
  }

  return res.json();
}
