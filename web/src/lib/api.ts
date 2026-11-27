// URL de l'API CONTROLE FISCAL
// - en dev local : le serveur Node (127.0.0.1:8787)
// - en prod (Cloudflare Pages) : le Worker Cloudflare
const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

export const API_URL = isLocal
  ? 'http://127.0.0.1:8787'
  : 'https://controle-fiscal-api.salim-ezzine.workers.dev';

import { getSession } from './auth';

// fetch authentifié : ajoute le Bearer token sur toutes les routes /api/
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const session = getSession();
  const headers = new Headers(options.headers);
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  return fetch(url, { ...options, headers });
}
