export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const api = {
  login: `${API_BASE}/api/token/`,
  me: `${API_BASE}/api/me/`,
  register: `${API_BASE}/api/register/`,
  restaurateurs: `${API_BASE}/api/restaurateurs/`,
};
