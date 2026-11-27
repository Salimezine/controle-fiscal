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
      navigate('/', { replace: true });
    } catch {
      setError('API inaccessible — réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cf-login">
      <div className="cf-login-card">
        <aside className="cf-login-brand">
          <div>
            <span className="cf-logo">✓</span>
            <h1>CONTROLE FISCAL</h1>
            <p>Un seul endroit pour les dossiers DMI, AP, CNSS et IS, les PDF déposés et la traçabilité des actions.</p>
          </div>
          <div className="cf-login-points">
            <div><b>📁</b> Tous les dossiers, par société et par année</div>
            <div><b>🎯</b> Objectifs clairs : 12 DMI · 4 CNSS · 3 AP · 1 IS</div>
            <div><b>🔍</b> Chaque dépôt est tracé dans l’Audit</div>
            <div><b>🔒</b> Données gardées localement · session 7 jours</div>
          </div>
        </aside>
        <section className="cf-login-form">
          <h2>Bon retour 👋</h2>
          <p className="cf-page-sub mb-6">Connectez-vous avec votre compte CONTROLE FISCAL.</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="cf-field">
              <label className="cf-label">Email</label>
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="nom@eurextunisie.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-2.5 rounded"
              />
            </div>
            <div className="cf-field">
              <label className="cf-label">Mot de passe</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-2.5 rounded"
              />
            </div>

            {error && <div className="cf-alert cf-alert-error">{error}</div>}

            <button type="submit" disabled={loading} className="cf-btn cf-btn-primary cf-btn-block">
              {loading ? 'Connexion...' : 'Se connecter →'}
            </button>
          </form>
          <p className="cf-login-foot">Comptes conservés localement · Session 7 jours</p>
        </section>
      </div>
    </div>
  );
}
