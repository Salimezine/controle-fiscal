import { useEffect, useState } from 'react';

import ActiviteComptables from '../components/ActiviteComptables';
import { API_URL, authFetch } from '../lib/api';

interface Objectif {
  annee: number;
  type_travail: string;
  objectif: number;
  realise: number;
  dossiers_crees: number;
  reste: number;
  pourcent: number;
}

const ICONS: Record<string, string> = { DMI: '📄', AP: '🛒', CNSS: '🏥', IS: '💼' };

export default function ObjectifsPage() {
  const currentYear = new Date().getFullYear();
  const [annee, setAnnee] = useState(currentYear);
  const [yearInput, setYearInput] = useState(String(currentYear));
  const [rows, setRows] = useState<Objectif[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch(`${API_URL}/api/objectifs?annee=${annee}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur de chargement');
        const data = await res.json();
        setRows(data.objectifs);
        setAnnee(data.annee);
        setForm(Object.fromEntries(
          data.objectifs.map((o: Objectif) => [o.type_travail, String(o.objectif)])
        ));
      } catch (e: any) { setError(e.message || 'Erreur'); }
      finally { setLoading(false); }
    })();
  }, [annee]);

  const save = async () => {
    setBusy(true); setError(''); setSuccess('');
    try {
      const objectifs = rows.map(o => ({
        type_travail: o.type_travail,
        objectif: Number(form[o.type_travail] ?? o.objectif)
      }));
      const res = await authFetch(`${API_URL}/api/objectifs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annee, objectifs })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      setSuccess('Objectifs enregistrés et tracés dans l’Audit.');
      const fresh = await authFetch(`${API_URL}/api/objectifs?annee=${annee}`);
      const data = await fresh.json();
      setRows(data.objectifs);
      setForm(Object.fromEntries(
        data.objectifs.map((o: Objectif) => [o.type_travail, String(o.objectif)])
      ));
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const charger = () => {
    const year = Number(yearInput);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError('Année invalide (ex. 2026).'); return;
    }
    setError(''); setSuccess('');
    setAnnee(year);
  };

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-bold">🎯 Objectifs annuels</h1>
          <p className="text-sm text-gray-600 mt-1">
            Nombre de dossiers à traiter par type et par année. Modification réservée à l’expert.
          </p>
        </div>
        <a href="/" className="px-3 py-2 border rounded text-sm hover:bg-gray-50">← Accueil</a>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Année</label>
            <input type="number" min="2000" max="2100" value={yearInput}
              onChange={e => setYearInput(e.target.value)}
              className="p-2 border rounded text-sm w-28" />
          </div>
          <button onClick={charger} className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Charger
          </button>
          <div className="ml-auto text-sm text-gray-600">
            Année affichée : <b>{annee}</b>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Le « Réalisé » compte les dossiers ayant au moins un PDF déposé pendant l’année
          (pièce justificative ou reçu RCUE). Les dossiers créés sont affichés à côté pour info.
        </p>
      </div>

      {error && <div className="mb-4 p-2 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-2 rounded bg-green-50 text-green-700 text-sm">✅ {success}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Objectif {annee}</th>
              <th className="text-left p-3">Réalisé (PDF)</th>
              <th className="text-left p-3">Dossiers créés</th>
              <th className="text-left p-3">Reste</th>
              <th className="text-left p-3">Progression</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => (
              <tr key={o.type_travail} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{ICONS[o.type_travail]} {o.type_travail}</td>
                <td className="p-3">
                  <input type="number" min="0" max="9999"
                    value={form[o.type_travail] ?? ''}
                    onChange={e => setForm({ ...form, [o.type_travail]: e.target.value })}
                    className="w-24 p-2 border rounded text-sm" />
                </td>
                <td className="p-3 font-semibold">{o.realise}</td>
                <td className="p-3 text-gray-600">{o.dossiers_crees}</td>
                <td className="p-3">{o.reste}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${o.pourcent >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${o.pourcent}%` }} />
                    </div>
                    <span className="text-xs text-gray-600">{o.pourcent}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={6} className="p-4 text-gray-500">Chargement...</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={busy || rows.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
          {busy ? 'Enregistrement...' : '💾 Enregistrer les objectifs'}
        </button>
        <span className="text-xs text-gray-500">
          Chaque modification est enregistrée dans l’Audit avec votre nom.
        </span>
      </div>

      <div className="mt-6">
        <ActiviteComptables annee={annee} />
      </div>
    </div>
  );
}
