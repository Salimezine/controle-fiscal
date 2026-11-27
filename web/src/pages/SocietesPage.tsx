import { useState, useEffect } from 'react';

import { API_URL, authFetch } from '../lib/api';

interface Societe {
  id: string;
  raison_sociale: string;
  matricule_fiscal: string;
  created_at: string;
}

export default function SocietesPage() {
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [search, setSearch] = useState('');
  const [newSociete, setNewSociete] = useState({ raison_sociale: '', matricule_fiscal: '' });

  useEffect(() => {
    authFetch(`${API_URL}/api/societes`)
      .then(r => r.json())
      .then(setSocietes)
      .catch(console.error);
  }, []);

  const addSociete = async () => {
    if (!newSociete.raison_sociale) return;
    const res = await authFetch(`${API_URL}/api/societes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSociete)
    });
    if (res.ok) {
      const data = await res.json();
      setSocietes([...societes, data]);
      setNewSociete({ raison_sociale: '', matricule_fiscal: '' });
    }
  };

  const filtered = societes.filter(s =>
    s.raison_sociale.toLowerCase().includes(search.toLowerCase()) ||
    (s.matricule_fiscal || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="cf-page-head">
        <div>
          <h1 className="cf-page-title">🏢 Sociétés</h1>
          <p className="cf-page-sub">
            Référentiel des sociétés. Recherchez une société, puis ouvrez son dossier DMI / AP / CNSS / IS.
          </p>
        </div>
        <span className="cf-badge cf-badge-blue">{societes.length} société(s)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Liste des sociétés */}
        <div className="cf-card p-5">
          <div className="cf-page-head mb-4">
            <h2 className="cf-section-title">Liste des sociétés</h2>
            <span className="cf-badge cf-badge-gray">{filtered.length} affichée(s)</span>
          </div>
          <input
            type="search"
            placeholder="🔍 Rechercher une société..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-2 rounded mb-3"
          />
          <div className="max-h-[520px] overflow-y-auto pr-1">
            {filtered.map(s => (
              <div key={s.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white mb-2 hover:border-blue-300 hover:bg-blue-50/50 transition">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{s.raison_sociale}</div>
                  <div className="text-xs cf-muted">Matricule : {s.matricule_fiscal || '—'}</div>
                </div>
                <span className="cf-avatar">🏢</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="cf-empty">Aucune société trouvée.</div>
            )}
          </div>
        </div>

        {/* Ajouter une société */}
        <div className="cf-card p-5 h-fit">
          <h2 className="cf-section-title mb-4">➕ Nouvelle société</h2>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Raison sociale"
              value={newSociete.raison_sociale}
              onChange={(e) => setNewSociete({ ...newSociete, raison_sociale: e.target.value })}
              className="w-full p-2 rounded"
            />
            <input
              type="text"
              placeholder="Matricule fiscal"
              value={newSociete.matricule_fiscal}
              onChange={(e) => setNewSociete({ ...newSociete, matricule_fiscal: e.target.value })}
              className="w-full p-2 rounded"
            />
            <button onClick={addSociete} className="cf-btn cf-btn-primary cf-btn-block">
              Ajouter la société →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
