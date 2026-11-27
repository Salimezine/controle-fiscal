import { useEffect, useState } from 'react';

import { API_URL, authFetch } from '../lib/api';

interface Event {
  id: string; created_at: string; user_name: string; role: string; action: string;
  societe_nom: string | null; travail_titre: string | null; details: string | null;
}

const LABELS: Record<string, string> = {
  creation_dossier: 'Création dossier',
  ajout_piece: 'Pièce PDF ajoutée',
  ajout_recu: 'Reçu ajouté',
  ajout_recu_pdf: 'Reçu + PDF ajoutés',
  suppression_dossier: 'Dossier supprimé',
  creation_compte: 'Compte créé',
  modification_compte: 'Compte modifié',
  desactivation_compte: 'Compte désactivé'
};

export default function AuditPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch(`${API_URL}/api/audit`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error || 'Accès refusé');
        return r.json();
      })
      .then((data: Event[]) => { setEvents(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(e => { setError(String(e.message || e)); setLoading(false); });
  }, []);

  const filtered = events.filter(e =>
    `${e.user_name} ${e.action} ${e.societe_nom || ''} ${e.travail_titre || ''} ${e.details || ''}`
      .toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">🔍 Audit - traçabilité</h1>
      {error && <div className="mb-4 p-2 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Journal des actions ({filtered.length})</h2>
          <input type="search" placeholder="🔍 Rechercher..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="p-2 border rounded text-sm w-64" />
        </div>
        <div className="max-h-[680px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                <th className="text-left p-2">Date</th>
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
                  <td className="p-2 whitespace-nowrap text-gray-500">{e.created_at}</td>
                  <td className="p-2">
                    <div className="font-medium">{e.user_name}</div>
                    <div className="text-xs text-gray-500">{e.role === 'admin' ? 'Expert' : 'Comptable'}</div>
                  </td>
                  <td className="p-2">
                    <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                      {LABELS[e.action] || e.action}
                    </span>
                  </td>
                  <td className="p-2">{e.societe_nom || '—'}</td>
                  <td className="p-2">{e.travail_titre || '—'}</td>
                  <td className="p-2 text-gray-600">{e.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="p-3 text-sm text-gray-500">Chargement...</div>}
          {!loading && filtered.length === 0 && !error && (
            <div className="p-3 text-sm text-gray-500">Aucune action enregistrée.</div>
          )}
        </div>
      </div>
    </div>
  );
}
