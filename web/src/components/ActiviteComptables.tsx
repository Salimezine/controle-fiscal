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

  if (error) return <div className="cf-alert cf-alert-error mb-4">{error}</div>;
  if (!data) return <div className="cf-card p-3 mb-4 text-sm cf-muted">Chargement de l’activité...</div>;

  return (
    <div className="cf-card p-5 mb-4">
      <div className="cf-page-head mb-4">
        <div>
          <h2 className="cf-section-title">👥 Activité des comptables — {data.annee}</h2>
          <p className="cf-section-sub">
            Créés / réalisés (avec PDF) et temps estimé : création → dernière pièce ou reçu.
          </p>
        </div>
        <div className="cf-toolbar">
          <span className="cf-badge cf-badge-green">✅ {data.total.realises} réalisé(s)</span>
          <span className="cf-badge cf-badge-blue">📁 {data.total.dossiers_crees} créé(s)</span>
          <span className="cf-badge cf-badge-purple">⏱ {formatDuree(data.total.minutes)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-3">
          <div className="text-xs cf-muted">PDF / reçus déposés</div>
          <div className="text-xl font-bold text-blue-800">{data.total.realises}</div>
        </div>
        <div className="rounded-xl bg-green-50/70 border border-green-100 p-3">
          <div className="text-xs cf-muted">Dossiers créés</div>
          <div className="text-xl font-bold text-green-800">{data.total.dossiers_crees}</div>
        </div>
        <div className="rounded-xl bg-violet-50/70 border border-violet-100 p-3">
          <div className="text-xs cf-muted">Temps total estimé</div>
          <div className="text-xl font-bold text-violet-800">{formatDuree(data.total.minutes)}</div>
        </div>
      </div>

      <div className="cf-table-scroll">
        <table className="cf-table">
          <thead>
            <tr>
              <th className="text-left">Comptable</th>
              <th className="text-left">Créés</th>
              <th className="text-left">Réalisés</th>
              {TYPES.map(t => <th key={t} className="whitespace-nowrap">{t}</th>)}
              <th className="whitespace-nowrap">Temps</th>
            </tr>
          </thead>
          <tbody>
            {data.comptables.map(c => (
              <tr key={c.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="cf-avatar">{c.full_name.charAt(0).toUpperCase()}</span>
                    <div>
                      <div className="font-semibold">{c.full_name}</div>
                      <div className="text-xs cf-muted">{roleCourt(c.role)}</div>
                    </div>
                  </div>
                </td>
                <td className="font-semibold">{c.dossiers_crees}</td>
                <td className="font-bold text-blue-700">{c.realises}</td>
                {TYPES.map(t => (
                  <td key={t} className="text-xs cf-muted whitespace-nowrap">
                    {c.par_type[t]?.realises || 0} / {c.par_type[t]?.crees || 0}
                  </td>
                ))}
                <td className="whitespace-nowrap font-semibold" title={`${c.minutes} minutes`}>
                  {formatDuree(c.minutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.comptables.length === 0 && (
        <div className="cf-empty mt-3">Aucun compte actif.</div>
      )}
      <p className="text-xs cf-muted mt-3">
        Chaque type affiche « réalisés / créés ». Le temps est une estimation basée sur les horodatages tracés,
        pas une saisie manuelle.
      </p>
    </div>
  );
}
