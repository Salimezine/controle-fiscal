import { useEffect, useMemo, useState } from 'react';

import { API_URL, authFetch } from '../lib/api';
import { ACTION_LABELS, actionLabel, actionStyle, formatDate } from '../lib/labels';

interface Event {
  id: string; created_at: string; user_name: string; role: string; action: string;
  societe_nom: string | null; travail_titre: string | null; details: string | null;
}
interface Option { id: string; label: string }

export default function AuditPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [societes, setSocietes] = useState<Option[]>([]);
  const [search, setSearch] = useState('');
  const [fUser, setFUser] = useState('');
  const [fAction, setFAction] = useState('');
  const [fSoc, setFSoc] = useState('');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [a, u, s] = await Promise.all([
          authFetch(`${API_URL}/api/audit`),
          authFetch(`${API_URL}/api/users`),
          authFetch(`${API_URL}/api/societes`)
        ]);
        if (!a.ok) throw new Error((await a.json()).error || 'Accès refusé');
        setEvents(await a.json());
        if (u.ok) setUsers((await u.json()).map((x: any) => ({ id: x.id, label: x.full_name })));
        if (s.ok) setSocietes((await s.json()).map((x: any) => ({ id: x.id, label: x.raison_sociale })));
      } catch (e: any) { setError(e.message || 'Erreur'); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const week = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    return events.filter(e => {
      if (fUser && !`${e.user_name}`.toLowerCase().includes(fUser.toLowerCase())) return false;
      if (fAction && e.action !== fAction) return false;
      if (fSoc && e.societe_nom !== fSoc) return false;
      if (period === 'today' && !e.created_at.startsWith(today)) return false;
      if (period === 'week' && e.created_at.slice(0, 10) < week) return false;
      const txt = `${e.user_name} ${actionLabel(e.action)} ${e.societe_nom || ''} ${e.travail_titre || ''} ${e.details || ''}`;
      return txt.toLowerCase().includes(search.toLowerCase());
    });
  }, [events, fUser, fAction, fSoc, period, search]);

  const stats = [
    { label: 'Actions enregistrées', value: events.length },
    { label: "Aujourd'hui", value: events.filter(e => e.created_at.startsWith(new Date().toISOString().slice(0, 10))).length },
    { label: 'PDF / Reçus', value: events.filter(e => e.action.includes('pdf') || e.action === 'ajout_piece' || e.action === 'ajout_recu').length },
    { label: 'Dossiers créés', value: events.filter(e => e.action === 'creation_dossier').length }
  ];

  const exportCsv = () => {
    const cell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Utilisateur', 'Rôle', 'Action', 'Société', 'Dossier', 'Détails'],
      ...filtered.map(e => [
        e.created_at, e.user_name, e.role === 'admin' ? 'Expert' : 'Comptable',
        actionLabel(e.action), e.societe_nom, e.travail_titre, e.details
      ])
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `audit-controle-fiscal-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setSearch(''); setFUser(''); setFAction(''); setFSoc(''); setPeriod('all'); };

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-bold">🔍 Audit — contrôle Expert</h1>
          <p className="text-sm text-gray-600 mt-1">
            Chaque action est enregistrée automatiquement : qui, quand, quelle société, quel dossier, quel fichier.
          </p>
        </div>
        <button onClick={exportCsv} disabled={filtered.length === 0}
          className="px-3 py-2 border rounded text-sm hover:bg-gray-50 disabled:opacity-50">
          ⬇️ Exporter CSV
        </button>
      </div>

      {error && <div className="mb-4 p-2 rounded bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-lg shadow p-3">
            <div className="text-xl font-bold">{loading ? '…' : s.value}</div>
            <div className="text-xs text-gray-600">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
          <input type="search" placeholder="🔍 Rechercher..." value={search}
            onChange={e => setSearch(e.target.value)} className="p-2 border rounded text-sm" />
          <select value={fUser} onChange={e => setFUser(e.target.value)} className="p-2 border rounded text-sm">
            <option value="">Tous les utilisateurs</option>
            {users.map(u => <option key={u.id} value={u.label}>{u.label}</option>)}
          </select>
          <select value={fAction} onChange={e => setFAction(e.target.value)} className="p-2 border rounded text-sm">
            <option value="">Toutes les actions</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={fSoc} onChange={e => setFSoc(e.target.value)} className="p-2 border rounded text-sm">
            <option value="">Toutes les sociétés</option>
            {societes.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="p-2 border rounded text-sm">
            <option value="all">Toute la période</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">7 derniers jours</option>
          </select>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Journal des actions ({filtered.length})</h2>
          <button onClick={reset} className="text-xs text-blue-600 hover:underline">Réinitialiser les filtres</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">Date / heure</th>
                <th className="text-left p-2">Utilisateur</th>
                <th className="text-left p-2">Action</th>
                <th className="text-left p-2">Société</th>
                <th className="text-left p-2">Dossier</th>
                <th className="text-left p-2">Détails</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="border-b hover:bg-gray-50 align-top">
                  <td className="p-2 whitespace-nowrap text-gray-600">{formatDate(e.created_at)}</td>
                  <td className="p-2">
                    <div className="font-medium">{e.user_name}</div>
                    <div className="text-xs text-gray-500">{e.role === 'admin' ? 'Expert' : 'Comptable'}</div>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs whitespace-nowrap ${actionStyle(e.action)}`}>
                      {actionLabel(e.action)}
                    </span>
                  </td>
                  <td className="p-2">{e.societe_nom || '—'}</td>
                  <td className="p-2">{e.travail_titre || '—'}</td>
                  <td className="p-2 text-gray-600">{e.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-3 text-sm text-gray-500">Chargement du journal...</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">
            Aucune action pour ces filtres. Les actions apparaissent dès qu’un dossier ou un PDF est ajouté.
          </div>
        )}
      </div>
    </div>
  );
}
