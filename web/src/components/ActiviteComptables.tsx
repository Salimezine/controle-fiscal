import { useEffect, useState } from 'react';

import { API_URL, authFetch } from '../lib/api';
import { formatDuree, roleCourt, type ActiviteResponse } from '../lib/activite';

const TYPES = ['DMI', 'AP', 'CNSS', 'IS'];

export default function ActiviteComptables({ annee }: { annee?: number }) {
  const [data, setData] = useState<ActiviteResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/activite${annee ? `?annee=${annee}` : ''}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Erreur de chargement');
        const json = await res.json();
        if (alive) setData(json);
      } catch (e: any) {
        if (alive) setError(e.message || 'Erreur');
      }
    })();
    return () => { alive = false; };
  }, [annee]);

  if (error) return <div className="mb-4 p-2 rounded bg-red-50 text-red-700 text-sm">{error}</div>;
  if (!data) return <div className="mb-4 p-3 bg-white rounded-lg shadow text-sm text-gray-500">Chargement de l’activité...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div>
          <h2 className="text-lg font-semibold">👥 Activité des comptables — {data.annee}</h2>
          <p className="text-xs text-gray-500 mt-1">
            Dossiers créés / réalisés (avec PDF) et temps de traitement estimé : création → dernière pièce ou reçu.
          </p>
        </div>
        <div className="text-sm text-gray-600 text-right">
          <b>{data.total.realises}</b> réalisé(s) · <b>{formatDuree(data.total.minutes)}</b> au total
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-2">Comptable</th>
              <th className="text-left p-2">Créés</th>
              <th className="text-left p-2">Réalisés</th>
              {TYPES.map(t => <th key={t} className="text-left p-2 whitespace-nowrap">{t}</th>)}
              <th className="text-left p-2 whitespace-nowrap">Temps</th>
            </tr>
          </thead>
          <tbody>
            {data.comptables.map(c => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="p-2">
                  <div className="font-medium">{c.full_name}</div>
                  <div className="text-xs text-gray-500">{roleCourt(c.role)}</div>
                </td>
                <td className="p-2 font-semibold">{c.dossiers_crees}</td>
                <td className="p-2 font-semibold text-blue-700">{c.realises}</td>
                {TYPES.map(t => (
                  <td key={t} className="p-2 text-xs text-gray-600 whitespace-nowrap">
                    {c.par_type[t]?.realises || 0} / {c.par_type[t]?.crees || 0}
                  </td>
                ))}
                <td className="p-2 whitespace-nowrap font-medium" title={`${c.minutes} minutes`}>
                  {formatDuree(c.minutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.comptables.length === 0 && (
        <div className="p-4 text-center text-sm text-gray-500">Aucun compte actif.</div>
      )}
      <p className="text-xs text-gray-400 mt-2">
        Chaque type affiche « réalisés / créés ». Le temps est une estimation basée sur les horodatages tracés,
        pas une saisie manuelle.
      </p>
    </div>
  );
}
