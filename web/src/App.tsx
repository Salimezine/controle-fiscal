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
import { API_URL } from './lib/api';
import { getSession, clearSession, type AuthUser } from './lib/auth';

function Layout({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex gap-1 items-center flex-wrap">
          {[
            { to: '/', label: '🏠 Accueil' },
            { to: '/dmi', label: '📄 DMI' },
            { to: '/ap', label: '🛒 AP' },
            { to: '/cnss', label: '🏥 CNSS' },
            { to: '/is', label: '💼 IS' },
            { to: '/societes', label: '🏢 Sociétés' },
            { to: '/comptes', label: '👥 Comptes' },
            ...(user.role === 'admin' ? [{ to: '/audit', label: '🔍 Audit' }] : [])
          ].map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`
              }>
              {item.label}
            </NavLink>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-700">
              {user.full_name}
              <span className="ml-2 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                {user.role === 'admin' ? 'Expert' : 'Comptable'}
              </span>
            </span>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
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
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
