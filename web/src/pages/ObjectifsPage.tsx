import { useEffect, useState } from 'react';

import ActiviteComptables from '../components/ActiviteComptables';
import ObjectifsSocietes from '../components/ObjectifsSocietes';
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
  const [annees, setAnnees] = useState<number[]>([]);
  const [rows, setRows] = useState<Objectif[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/annees`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.annees) && data.annees.length) setAnnees(data.annees);
        }
      } catch { /* année courante gardée */ }
    })();
  }, []);

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

  return (
    <div>
      <div className="cf-page-head">
        <div>
          <h1 className="cf-page-title">🎯 Objectifs annuels</h1>
          <p className="cf-page-sub">
            Objectifs globaux par type et par année. Les objectifs détaillés par société sont plus bas.
          </p>
        </div>
        <a href="/" className="cf-btn cf-btn-ghost cf-btn-sm">← Accueil</a>
      </div>

      <div className="cf-card p-5 mb-4">
        <div className="cf-toolbar">
          <div className="cf-field">
            <label className="cf-label">📅 Année</label>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
              className="p-2 rounded text-sm w-28">
              {(annees.length ? annees : [annee]).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <span className="cf-badge cf-badge-blue">{annee}</span>
        </div>
        <div className="cf-alert cf-alert-info mt-4 block">
          Le « Réalisé » compte les <b>PDF déposés</b> pendant l’année (pièces justificatives et reçus RCUE).
          Les dossiers créés sont affichés à côté pour information.
        </div>
      </div>

      {error && <div className="cf-alert cf-alert-error mb-4">{error}</div>}
      {success && <div className="cf-alert cf-alert-success mb-4">✅ {success}</div>}

      <div className="cf-card overflow-hidden mb-4">
        <table className="cf-table">
          <thead>
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
              <tr key={o.type_travail}>
                <td className="font-semibold">{ICONS[o.type_travail]} {o.type_travail}</td>
                <td>
                  <input type="number" min="0" max="9999"
                    value={form[o.type_travail] ?? ''}
                    onChange={e => setForm({ ...form, [o.type_travail]: e.target.value })}
                    className="w-24 p-2 rounded text-sm text-center font-semibold" />
                </td>
                <td className="font-bold text-blue-700">{o.realise}</td>
                <td className="cf-muted">{o.dossiers_crees}</td>
                <td>{o.reste}</td>
                <td>
                  <div className="flex items-center gap-3 min-w-[180px]">
                    <div className={`cf-progress flex-1 ${o.pourcent >= 100 ? 'is-done' : ''}`}>
                      <span style={{ width: `${o.pourcent}%` }} />
                    </div>
                    <span className={`text-xs font-bold ${o.pourcent >= 100 ? 'text-green-700' : 'cf-muted'}`}>
                      {o.pourcent}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={6} className="p-4 cf-muted">Chargement...</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-6">
        <button onClick={save} disabled={busy || rows.length === 0} className="cf-btn cf-btn-primary">
          {busy ? 'Enregistrement...' : '💾 Enregistrer les objectifs'}
        </button>
        <span className="text-xs cf-muted">
          Chaque modification est enregistrée dans l’Audit avec votre nom.
        </span>
      </div>

      <div className="mt-6">
        <ObjectifsSocietes annee={annee} />
      </div>

      <div className="mt-6">
        <ActiviteComptables annee={annee} />
      </div>
    </div>
  );
}
