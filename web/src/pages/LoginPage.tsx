import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { API_URL } from '../lib/api';
import { saveSession, type AuthUser } from '../lib/auth';

export default function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Identifiants incorrects');
        return;
      }
      saveSession(data, data.token);
      onLogin(data);
      navigate('/societes', { replace: true });
    } catch {
      setError('API inaccessible — réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🔐</div>
          <h1 className="text-2xl font-bold">CONTROLE FISCAL</h1>
          <p className="text-sm text-gray-500 mt-1">Comptes locaux CONTROLE FISCAL</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="nom@eurextunisie.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mot de passe</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="p-2 rounded bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Comptes conservés localement · Session 7 jours
        </p>
      </div>
    </div>
  );
}
