import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, NavLink } from 'react-router-dom';

import AccueilPage from './pages/AccueilPage';
import DMIPage from './pages/DMIPage';
import APPage from './pages/APPage';
import CNSSPage from './pages/CNSSPage';
import ISPage from './pages/ISPage';
import SocietesPage from './pages/SocietesPage';
import ComptesPage from './pages/ComptesPage';
import LoginPage from './pages/LoginPage';
import AuditPage from './pages/AuditPage';
import ObjectifsPage from './pages/ObjectifsPage';
import { API_URL } from './lib/api';
import { getSession, clearSession, type AuthUser } from './lib/auth';

function Layout({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const initial = (user.full_name || 'U').trim().charAt(0).toUpperCase();
  return (
    <div className="cf-shell">
      <header className="cf-topbar">
        <div className="cf-topbar-inner">
          <a href="/" className="cf-brand">
            <span className="cf-logo">✓</span>
            <span>
              CONTROLE FISCAL
              <small>CONTRÔLE · PDF · TRAÇABILITÉ</small>
            </span>
          </a>
          <nav className="cf-nav">
            {[
              { to: '/', label: 'Accueil', icon: '🏠' },
              { to: '/dmi', label: 'DMI', icon: '📄' },
              { to: '/ap', label: 'AP', icon: '🛒' },
              { to: '/cnss', label: 'CNSS', icon: '🏥' },
              { to: '/is', label: 'IS', icon: '💼' },
              { to: '/societes', label: 'Sociétés', icon: '🏢' },
              { to: '/comptes', label: 'Comptes', icon: '👥' },
              ...(user.role === 'admin'
                ? [{ to: '/audit', label: 'Audit', icon: '🔍' }, { to: '/objectifs', label: 'Objectifs', icon: '🎯' }]
                : [])
            ].map(item => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => isActive ? 'active' : ''}>
                <span aria-hidden>{item.icon}</span> {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="cf-user">
            <span className="cf-avatar">{initial}</span>
            <span className="text-sm">
              <span className="font-semibold">{user.full_name}</span>
              <span className={`cf-badge ml-2 ${user.role === 'admin' ? 'cf-badge-purple' : 'cf-badge-blue'}`}>
                {user.role === 'admin' ? 'Expert' : 'Comptable'}
              </span>
            </span>
            <button onClick={onLogout} className="cf-btn cf-btn-ghost cf-btn-sm">
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="cf-main">
        <Outlet />
      </main>
    </div>
  );
}

function Protected({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  if (!user) return <Navigate to="/login" replace />;
  return <Layout user={user} onLogout={onLogout} />;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getSession()?.user || null);

  const logout = async () => {
    const token = getSession()?.token;
    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // déconnexion locale même si l'API est injoignable
      }
    }
    clearSession();
    setUser(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage onLogin={setUser} />}
        />
        <Route element={<Protected user={user} onLogout={logout} />}>
          <Route path="/" element={<AccueilPage />} />
          <Route path="/societes" element={<SocietesPage />} />
          <Route path="/comptes" element={<ComptesPage />} />
          <Route path="/dmi" element={<DMIPage />} />
          <Route path="/ap" element={<APPage />} />
          <Route path="/cnss" element={<CNSSPage />} />
          <Route path="/is" element={<ISPage />} />
          <Route
            path="/audit"
            element={user?.role === 'admin' ? <AuditPage /> : <Navigate to="/" replace />}
          />
          <Route
            path="/objectifs"
            element={user?.role === 'admin' ? <ObjectifsPage /> : <Navigate to="/" replace />}
          />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
