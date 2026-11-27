// Session locale CONTROLE FISCAL (token renvoyé par /api/auth/login)
export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  societe_id: string | null;
}

interface Session {
  user: AuthUser;
  token: string;
}

const KEY = 'cf_session';

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s?.token && s?.user ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(user: AuthUser, token: string): void {
  localStorage.setItem(KEY, JSON.stringify({ user, token }));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
