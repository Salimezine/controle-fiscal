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
      <h1 className="text-2xl font-bold mb-4">🏢 Sociétés</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Liste des sociétés */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Liste des Sociétés ({societes.length})</h2>
          </div>
          <input
            type="search"
            placeholder="🔍 Rechercher une société..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-2 border rounded mb-3"
          />
          <div className="max-h-[520px] overflow-y-auto pr-1">
            {filtered.map(s => (
              <div key={s.id} className="p-3 border rounded-lg mb-2">
                <div className="font-medium">{s.raison_sociale}</div>
                <div className="text-sm text-gray-500">Matricule: {s.matricule_fiscal || '—'}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-sm text-gray-500">Aucune société trouvée.</div>
            )}
          </div>
        </div>

        {/* Ajouter une société */}
        <div className="bg-white rounded-lg shadow p-4 h-fit">
          <h2 className="text-lg font-semibold mb-3">Nouvelle Société</h2>
          <input
            type="text"
            placeholder="Raison sociale"
            value={newSociete.raison_sociale}
            onChange={(e) => setNewSociete({ ...newSociete, raison_sociale: e.target.value })}
            className="w-full p-2 border rounded mb-2"
          />
          <input
            type="text"
            placeholder="Matricule fiscal"
            value={newSociete.matricule_fiscal}
            onChange={(e) => setNewSociete({ ...newSociete, matricule_fiscal: e.target.value })}
            className="w-full p-2 border rounded mb-2"
          />
          <button
            onClick={addSociete}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
