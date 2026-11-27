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

  const parSociete = useMemo(() => {
    const map = new Map<string, Map<string, ObjectifSociete>>();
    for (const r of rows) {
      if (!map.has(r.societe_id)) map.set(r.societe_id, new Map());
      map.get(r.societe_id)!.set(r.type_travail, r);
    }
    return [...map.entries()].sort((a, b) =>
      (societes.find(s => s.id === a[0])?.raison_sociale || a[0])
        .localeCompare(societes.find(s => s.id === b[0])?.raison_sociale || b[0]));
  }, [rows, societes]);

  const socNom = (id: string) => societes.find(s => s.id === id)?.raison_sociale || id;
  const key = (soc: string, type: string) => `${soc}|${type}`;

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
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">🎯 Objectifs par société — {annee}</h2>
        <p className="text-xs text-gray-500 mt-1">
          1 dossier = 1 société : <b>12 DMI</b> (1/mois), <b>4 CNSS</b> (1/trimestre, sauf sociétés ayant déjà CNSS = 0),
          <b> 3 AP</b>, <b> 1 IS</b>. Le « réalisé » compte les PDF déposés pendant l’année.
        </p>
      </div>

      {message && <div className="mb-3 text-sm text-blue-700">{message}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-2">Société</th>
              {TYPES.map(t => <th key={t} className="text-center p-2 whitespace-nowrap">{ICONS[t]} {t}</th>)}
              {isAdmin && <th className="p-2"></th>}
            </tr>
          </thead>
          <tbody>
            {parSociete.map(([societeId, types]) => (
              <tr key={societeId} className="border-b hover:bg-gray-50">
                <td className="p-2 font-medium max-w-[240px] truncate" title={socNom(societeId)}>{socNom(societeId)}</td>
                {TYPES.map(t => {
                  const r = types.get(t);
                  const objectif = form[key(societeId, t)] ?? String(r?.objectif ?? 0);
                  const realise = Number(r?.realise ?? 0);
                  const obj = Number(objectif) || 0;
                  const pourcent = obj > 0 ? Math.min(100, Math.round((realise / obj) * 100)) : 0;
                  return (
                    <td key={t} className="p-2 text-center whitespace-nowrap">
                      {isAdmin ? (
                        <input type="number" min="0" max="9999" value={objectif}
                          onChange={e => setForm({ ...form, [key(societeId, t)]: e.target.value })}
                          className="w-16 p-1 border rounded text-center text-sm" />
                      ) : (
                        <span className="font-semibold">{obj}</span>
                      )}
                      <div className={`text-xs ${realise >= obj && obj > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                        {realise} / {obj || '—'} ({pourcent}%)
                      </div>
                    </td>
                  );
                })}
                {isAdmin && (
                  <td className="p-2 text-right">
                    <button onClick={() => enregistrer(societeId)} disabled={busy === societeId}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50">
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
        <div className="p-4 text-center text-sm text-gray-500">
          Aucun objectif pour {annee}. Déployez le schéma ou choisissez une autre année.
        </div>
      )}
      {isAdmin && <p className="text-xs text-gray-400 mt-2">Chaque modification est tracée dans l’Audit.</p>}
    </div>
  );
}
