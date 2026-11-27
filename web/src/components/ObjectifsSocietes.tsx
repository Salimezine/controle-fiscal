import { useEffect, useMemo, useState } from 'react';

import { API_URL, authFetch } from '../lib/api';
import { getSession } from '../lib/auth';

const TYPES = ['DMI', 'AP', 'CNSS', 'IS'];
const ICONS: Record<string, string> = { DMI: '📄', AP: '🛒', CNSS: '🏥', IS: '💼' };

interface ObjectifSociete {
  societe_id: string;
  type_travail: string;
  objectif: number;
  realise: number;
  dossiers_crees: number;
}

export default function ObjectifsSocietes({ annee }: { annee: number }) {
  const isAdmin = getSession()?.user.role === 'admin';
  const [rows, setRows] = useState<ObjectifSociete[]>([]);
  const [societes, setSocietes] = useState<Array<{ id: string; raison_sociale: string }>>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const charger = async () => {
    const [objRes, socRes] = await Promise.all([
      authFetch(`${API_URL}/api/objectifs/societes?annee=${annee}`),
      authFetch(`${API_URL}/api/societes`)
    ]);
    const obj = objRes.ok ? await objRes.json() : { objectifs: [] };
    const soc = socRes.ok ? await socRes.json() : [];
    setRows(Array.isArray(obj.objectifs) ? obj.objectifs : []);
    setSocietes(Array.isArray(soc) ? soc : []);
    setForm({});
  };

  useEffect(() => { charger(); }, [annee]);

  const socNom = (id: string) => societes.find(s => s.id === id)?.raison_sociale || id;
  const key = (soc: string, type: string) => `${soc}|${type}`;

  const parSociete = useMemo(() => {
    const map = new Map<string, Map<string, ObjectifSociete>>();
    for (const r of rows) {
      if (!map.has(r.societe_id)) map.set(r.societe_id, new Map());
      map.get(r.societe_id)!.set(r.type_travail, r);
    }
    return [...map.entries()]
      .filter(([id]) => socNom(id).toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => socNom(a[0]).localeCompare(socNom(b[0])));
  }, [rows, societes, search]);

  const enregistrer = async (societeId: string) => {
    setBusy(societeId);
    setMessage('');
    try {
      const values = TYPES.map(type => {
        const row = parSociete.find(([id]) => id === societeId)?.[1].get(type);
        return {
          type_travail: type,
          objectif: Number(form[key(societeId, type)] ?? row?.objectif ?? 0)
        };
      });
      const res = await authFetch(`${API_URL}/api/objectifs/societes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annee, societe_id: societeId, objectifs: values })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setMessage(`✅ Objectifs ${annee} enregistrés pour ${socNom(societeId)}.`);
      await charger();
    } catch (e: any) {
      setMessage(`❌ ${e.message || 'Erreur'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="cf-card p-5 mb-4">
      <div className="cf-page-head mb-4">
        <div>
          <h2 className="cf-section-title flex items-center gap-2">
            🎯 Objectifs par société — {annee}
            <span className="cf-badge cf-badge-blue">{parSociete.length}</span>
          </h2>
          <p className="cf-section-sub">
            1 dossier = 1 société : <b>12 DMI</b> (1/mois), <b>4 CNSS</b> (1/trimestre), <b>3 AP</b>, <b>1 IS</b>.
            Les sociétés qui ont déjà leur CNSS ont un objectif CNSS à <b>0</b> (affiché « — »).
          </p>
        </div>
        <input type="search" placeholder="🔍 Filtrer une société..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="p-2 rounded text-sm w-56" />
      </div>

      <div className="cf-alert cf-alert-info mb-4 block">
        Le « réalisé » compte les <b>PDF déposés</b> pendant l’année. Cliquez sur une valeur pour la modifier,
        puis sur 💾 pour enregistrer (tracé dans l’Audit).
      </div>

      {message && (
        <div className={`cf-alert mb-4 ${message.startsWith('❌') ? 'cf-alert-error' : 'cf-alert-success'}`}>
          {message}
        </div>
      )}

      <div className="cf-table-scroll">
        <table className="cf-table">
          <thead>
            <tr>
              <th className="text-left">Société</th>
              {TYPES.map(t => <th key={t} className="text-center whitespace-nowrap">{ICONS[t]} {t}</th>)}
              {isAdmin && <th className="text-center">Action</th>}
            </tr>
          </thead>
          <tbody>
            {parSociete.map(([societeId, types]) => (
              <tr key={societeId}>
                <td className="font-semibold max-w-[260px] truncate" title={socNom(societeId)}>
                  {socNom(societeId)}
                </td>
                {TYPES.map(t => {
                  const r = types.get(t);
                  const objectif = form[key(societeId, t)] ?? String(r?.objectif ?? 0);
                  const realise = Number(r?.realise ?? 0);
                  const obj = Number(objectif) || 0;
                  const pourcent = obj > 0 ? Math.min(100, Math.round((realise / obj) * 100)) : 0;
                  return (
                    <td key={t} className="text-center whitespace-nowrap">
                      {isAdmin ? (
                        <input type="number" min="0" max="9999" value={objectif}
                          onChange={e => setForm({ ...form, [key(societeId, t)]: e.target.value })}
                          className="w-16 p-1 rounded text-center text-sm font-semibold mb-1" />
                      ) : (
                        <span className="font-bold">{obj || '—'}</span>
                      )}
                      {obj > 0 ? (
                        <>
                          <div className={`text-xs font-semibold ${pourcent >= 100 ? 'text-green-700' : 'cf-muted'}`}>
                            {realise} / {obj} · {pourcent}%
                          </div>
                          <div className={`cf-progress cf-progress-sm mt-1 ${pourcent >= 100 ? 'is-done' : ''}`}>
                            <span style={{ width: `${pourcent}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="cf-badge cf-badge-gray" title="Objectif 0 = pas à faire">—</span>
                      )}
                    </td>
                  );
                })}
                {isAdmin && (
                  <td className="text-center">
                    <button onClick={() => enregistrer(societeId)} disabled={busy === societeId}
                      className="cf-btn cf-btn-primary cf-btn-sm" title="Enregistrer cette société">
                      {busy === societeId ? '…' : '💾'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parSociete.length === 0 && (
        <div className="cf-empty mt-3">
          <b>{search ? 'Aucune société trouvée' : `Aucun objectif pour ${annee}`}</b>
          {search ? 'Essayez un autre nom.' : 'Déployez le schéma ou choisissez une autre année.'}
        </div>
      )}
      {isAdmin && <p className="text-xs cf-muted mt-3">Chaque modification est tracée dans l’Audit avec votre nom.</p>}
    </div>
  );
}
