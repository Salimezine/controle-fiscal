import { useEffect, useState } from 'react';

import { API_URL, authFetch } from '../lib/api';
import { getSession } from '../lib/auth';

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  societe_id: string | null;
  is_active: number;
  societe_ids: string[];
}

interface Societe { id: string; raison_sociale: string }

const emptyForm = {
  full_name: '', email: '', password: '', role: 'user',
  societe_id: '', societe_ids: [] as string[]
};

export default function ComptesPage() {
  const isAdmin = getSession()?.user.role === 'admin';
  const [users, setUsers] = useState<User[]>([]);
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    const [u, s] = await Promise.all([
      authFetch(`${API_URL}/api/users`),
      authFetch(`${API_URL}/api/societes`)
    ]);
    if (!u.ok) throw new Error(`HTTP ${u.status}`);
    const data: User[] = await u.json();
    setUsers(data);
    setSocietes(await s.json());
    setLoading(false);
  };

  useEffect(() => {
    load().catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const startEdit = (u: User) => {
    setEditingId(u.id);
    setForm({
      full_name: u.full_name, email: u.email, password: '',
      role: u.role, societe_id: u.societe_id || '', societe_ids: u.societe_ids || []
    });
    setError(''); setSuccess('');
  };

  const cancel = () => { setEditingId(null); setForm(emptyForm); setError(''); };

  const save = async () => {
    if (!form.full_name || !form.email || (!editingId && !form.password)) {
      setError('Nom, email et mot de passe requis.'); return;
    }
    setBusy(true); setError(''); setSuccess('');
    const body: any = {
      full_name: form.full_name, email: form.email, role: form.role,
      societe_id: form.societe_id || null, societe_ids: form.societe_ids
    };
    if (form.password) body.password = form.password;
    try {
      const res = await authFetch(
        editingId ? `${API_URL}/api/users/${editingId}` : `${API_URL}/api/users`,
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      setSuccess(editingId ? 'Compte mis à jour.' : 'Compte créé.');
      cancel();
      await load();
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const deactivate = async (u: User) => {
    if (!confirm(`Désactiver le compte ${u.full_name} ?`)) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/users/${u.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      setSuccess('Compte désactivé.');
      await load();
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const toggleSociete = (id: string) => {
    setForm({
      ...form,
      societe_ids: form.societe_ids.includes(id)
        ? form.societe_ids.filter(x => x !== id)
        : [...form.societe_ids, id]
    });
  };

  const filtered = users.filter(u =>
    `${u.full_name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase())
  );
  const socNom = (id: string) => societes.find(s => s.id === id)?.raison_sociale || id;

  return (
    <div>
      <div className="cf-page-head">
        <div>
          <h1 className="cf-page-title">👥 Comptes</h1>
          <p className="cf-page-sub">Comptes locaux, rôles et attribuations de sociétés.</p>
        </div>
        <span className="cf-badge cf-badge-blue">{users.length} compte(s)</span>
      </div>
      <div className="cf-alert cf-alert-success mb-4">
        <span>✅</span>
        <span><b>Mode autonome.</b> Les comptes sont conservés dans la D1 locale, aucune synchronisation avec EUREX.</span>
      </div>

      {isAdmin && (
        <div className="cf-card p-5 mb-4">
          <h2 className="cf-section-title mb-4">
            {editingId ? '✏️ Modifier le compte' : '➕ Nouveau compte'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input placeholder="Nom complet *" value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              className="p-2 border rounded text-sm" />
            <input type="email" placeholder="Email *" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="p-2 border rounded text-sm" />
            <input type="password"
              placeholder={editingId ? 'Mot de passe (laisser vide = inchangé)' : 'Mot de passe *'}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="p-2 border rounded text-sm" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="p-2 border rounded text-sm">
              <option value="user">Comptable</option>
              <option value="admin">Expert / Admin</option>
            </select>
            <select value={form.societe_id} onChange={e => setForm({ ...form, societe_id: e.target.value })}
              className="p-2 border rounded text-sm">
              <option value="">Société principale (optionnel)</option>
              {societes.map(s => <option key={s.id} value={s.id}>{s.raison_sociale}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="cf-btn cf-btn-primary flex-1">
                {busy ? 'En cours...' : editingId ? 'Enregistrer' : 'Créer le compte'}
              </button>
              {editingId && (
                <button onClick={cancel} className="cf-btn cf-btn-ghost">Annuler</button>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-gray-600 mb-1">
              Sociétés attribuées ({form.societe_ids.length}) — cliquer pour sélectionner
            </label>
            <div className="max-h-32 overflow-y-auto border rounded p-2 grid grid-cols-2 md:grid-cols-3 gap-1">
              {societes.map(s => (
                <label key={s.id} className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.societe_ids.includes(s.id)}
                    onChange={() => toggleSociete(s.id)} />
                  <span className="truncate">{s.raison_sociale}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <div className="cf-alert cf-alert-error mb-3">{error}</div>}
      {success && <div className="cf-alert cf-alert-success mb-3">✅ {success}</div>}

      <div className="cf-card p-5">
        <div className="cf-page-head mb-4">
          <h2 className="cf-section-title flex items-center gap-2">
            Comptes locaux <span className="cf-badge cf-badge-blue">{users.length}</span>
          </h2>
          <input type="search" placeholder="🔍 Rechercher un compte..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="p-2 rounded text-sm w-64" />
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          <table className="cf-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Sociétés</th>
                <th>Statut</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td className="font-semibold">{u.full_name}</td>
                  <td className="cf-muted">{u.email}</td>
                  <td>
                    <span className={`cf-badge ${u.role === 'admin' ? 'cf-badge-purple' : 'cf-badge-blue'}`}>
                      {u.role === 'admin' ? 'Expert / Admin' : 'Comptable'}
                    </span>
                  </td>
                  <td className="text-xs cf-muted">
                    {u.societe_ids?.length ? socNom(u.societe_ids[0]) + (u.societe_ids.length > 1 ? ` +${u.societe_ids.length - 1}` : '') : '—'}
                  </td>
                  <td>
                    <span className={`cf-badge ${u.is_active ? 'cf-badge-green' : 'cf-badge-red'}`}>
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="whitespace-nowrap">
                      <button onClick={() => startEdit(u)} disabled={busy || !u.is_active}
                        className="cf-btn cf-btn-soft cf-btn-sm mr-1">Modifier</button>
                      {u.is_active && (
                        <button onClick={() => deactivate(u)} disabled={busy}
                          className="cf-btn cf-btn-danger cf-btn-sm">Désactiver</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="text-sm cf-muted p-3">Chargement des comptes...</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="cf-empty mt-3">Aucun compte trouvé.</div>
          )}
        </div>
      </div>
    </div>
  );
}
