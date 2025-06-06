export interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function fetchWithToken(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem("access");

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const current = window.location.pathname + window.location.search;
    window.location.href = `/auth/login?next=${encodeURIComponent(current)}`;
    return Promise.reject(new Error("Unauthorized"));
  }

  return response;
}
