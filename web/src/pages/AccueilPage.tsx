import { useEffect, useMemo, useState } from 'react';

import ActiviteComptables from '../components/ActiviteComptables';
import { API_URL, authFetch } from '../lib/api';
import { formatDuree } from '../lib/activite';
import { clearSession, getSession } from '../lib/auth';
import { filterDossiers, societesSansCNSS } from '../lib/dossiers';
import { actionLabel, actionStyle, formatDate } from '../lib/labels';

const TYPES = ['DMI', 'AP', 'CNSS', 'IS'];
const ICONS: Record<string, string> = { DMI: '📄', AP: '🛒', CNSS: '🏥', IS: '💼' };

interface Travail {
  id: string; societe_id: string; type_travail: string; titre: string;
  reference: string | null; statut: string;
  comptable_name: string | null; created_at: string; nb_pieces: number; nb_recues: number;
  duree_minutes?: number;
}
interface Event {
  id: string; created_at: string; user_name: string; action: string;
  societe_nom: string | null; travail_titre: string | null;
}
interface Objectif {
  annee: number; type_travail: string; objectif: number; realise: number;
  dossiers_crees: number; reste: number; pourcent: number;
}

export default function AccueilPage() {
  const session = getSession();
  const isAdmin = session?.user.role === 'admin';
  const [societes, setSocietes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [dossiers, setDossiers] = useState<Travail[]>([]);
  const [audit, setAudit] = useState<Event[]>([]);
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [annees, setAnnees] = useState<number[]>([]);
  const [searchDossier, setSearchDossier] = useState('');
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const asArray = async (r: Response) => {
          if (r.status === 401) {
            clearSession();
            window.location.href = '/login';
            return [];
          }
          if (!r.ok) return [];
          const data = await r.json();
          return Array.isArray(data) ? data : [];
        };

        const socRes = await authFetch(`${API_URL}/api/societes`);
        const usersRes = await authFetch(`${API_URL}/api/users`);
        const lists = await Promise.all(
          TYPES.map(t => authFetch(`${API_URL}/api/travaux?type=${t}`).then(asArray))
        );
        setSocietes(await asArray(socRes));
        setUsers(await asArray(usersRes));
        setDossiers(lists.flat());

        const yearsRes = await authFetch(`${API_URL}/api/annees`);
        if (yearsRes.ok) {
          const data = await yearsRes.json();
          if (Array.isArray(data.annees) && data.annees.length) setAnnees(data.annees);
        }
        if (isAdmin) {
          const r = await authFetch(`${API_URL}/api/audit`);
          if (r.ok) {
            const data = await r.json();
            setAudit(Array.isArray(data) ? data : []);
          }
        }
      } catch (e: any) { setError(e.message || 'Erreur de chargement'); }
      finally { setLoading(false); }
    })();
  }, [isAdmin]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/objectifs?annee=${annee}`);
        if (res.status === 401) { clearSession(); window.location.href = '/login'; return; }
        if (!res.ok) return;
        const data = await res.json();
        if (alive && Array.isArray(data.objectifs)) setObjectifs(data.objectifs);
      } catch { /* garde les objectifs précédents */ }
    })();
    return () => { alive = false; };
  }, [annee]);

  const socNom = (id: string) => societes.find(s => s.id === id)?.raison_sociale || '—';
  const dossiersAnnee = useMemo(
    () => dossiers.filter(d => String(d.created_at).slice(0, 4) === String(annee)),
    [dossiers, annee]
  );
  const recent = [...dossiersAnnee].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const allDossiers = useMemo(
    () => filterDossiers(dossiersAnnee, societes, searchDossier, filterType),
    [dossiersAnnee, societes, searchDossier, filterType]
  );
  const sansCnss = useMemo(() => societesSansCNSS(dossiersAnnee), [dossiersAnnee]);
  const statutStyle = (s: string) =>
    s === 'termine' || s === 'valide' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';

  const stats = [
    { label: 'Sociétés', value: societes.length, href: '/societes', icon: '🏢' },
    { label: 'Comptes', value: users.length, href: '/comptes', icon: '👥' },
    ...TYPES.map(t => ({
      label: `Dossiers ${t}`,
      value: dossiersAnnee.filter(d => d.type_travail === t).length,
      href: `/${t.toLowerCase()}`,
      icon: ICONS[t]
    })),
    ...(isAdmin ? [{ label: 'Actions tracées', value: audit.length, href: '/audit', icon: '🔍' }] : [])
  ];

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">👋 Bonjour {session?.user.full_name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {isAdmin ? 'Espace Expert — contrôle et traçabilité' : 'Espace Comptable — vos dossiers et vos PDF'}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
          {isAdmin ? 'Expert / Admin' : 'Comptable'}
        </span>
      </div>

      <div className="mb-4 p-2 rounded bg-green-50 text-green-700 text-sm">
        ✅ Données conservées localement — aucune synchronisation avec EUREX.
      </div>
      {error && <div className="mb-4 p-2 rounded bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="annee-accueil" className="text-sm font-medium text-gray-700">📅 Année</label>
        <select id="annee-accueil" value={annee}
          onChange={e => setAnnee(Number(e.target.value))}
          className="p-2 border rounded text-sm bg-white">
          {(annees.length ? annees : [annee]).map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <span className="text-xs text-gray-500">
          Objectifs, activité, dossiers et compteurs affichés pour {annee}.
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {stats.map(s => (
          <a key={s.label} href={s.href}
            className="bg-white rounded-lg shadow p-4 hover:shadow-md hover:border-blue-300 border border-transparent transition">
            <div className="text-2xl">{s.icon}</div>
            <div className="text-2xl font-bold mt-1">{loading ? '…' : s.value}</div>
            <div className="text-xs text-gray-600">{s.label}</div>
          </a>
        ))}
      </div>

      {objectifs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-lg font-semibold">🎯 Objectifs {annee} — dossiers avec PDF</h2>
            {isAdmin ? (
              <a href="/objectifs" className="text-sm text-blue-600 hover:underline">
                Modifier les objectifs →
              </a>
            ) : (
              <a href="/objectifs" className="text-sm text-blue-600 hover:underline">
                Voir par société →
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {objectifs.map(o => (
              <div key={o.type_travail}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{ICONS[o.type_travail]} {o.type_travail}</span>
                  <span className="text-gray-600">
                    <b>{o.realise}</b> / {o.objectif > 0 ? o.objectif : '—'}
                    {o.objectif > 0 && ` (${o.pourcent}%)`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div
                    className={`h-2 rounded-full ${o.pourcent >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${o.pourcent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {o.dossiers_crees} dossier(s) créé(s) · reste {o.reste}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && <ActiviteComptables annee={annee} />}

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold">📁 Tous les dossiers ({allDossiers.length})</h2>
            <p className="text-xs text-gray-500">
              {isAdmin ? 'Expert : tous les dossiers.' : 'Comptable : vos dossiers attribués.'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input type="search" placeholder="🔍 Société / titre / comptable / réf."
              value={searchDossier} onChange={e => setSearchDossier(e.target.value)}
              className="p-2 border rounded text-sm w-64" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="p-2 border rounded text-sm">
              <option value="">Tous les types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">Type</th>
                <th className="text-left p-2">Dossier</th>
                <th className="text-left p-2">Société</th>
                <th className="text-left p-2">Comptable</th>
                <th className="text-left p-2">Réf.</th>
                <th className="text-left p-2 whitespace-nowrap">Pièces</th>
                <th className="text-left p-2 whitespace-nowrap">Temps</th>
                <th className="text-left p-2">Statut</th>
                <th className="text-left p-2 whitespace-nowrap">Créé le</th>
                <th className="text-left p-2"></th>
              </tr>
            </thead>
            <tbody>
              {allDossiers.map(d => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-medium whitespace-nowrap">{ICONS[d.type_travail]} {d.type_travail}</td>
                  <td className="p-2">{d.titre}</td>
                  <td className="p-2">{socNom(d.societe_id)}</td>
                  <td className="p-2">{d.comptable_name || 'Non attribué'}</td>
                  <td className="p-2 text-gray-600">{d.reference || '—'}</td>
                  <td className="p-2 whitespace-nowrap">📎 {d.nb_pieces || 0} · 🧾 {d.nb_recues || 0}</td>
                  <td className="p-2 whitespace-nowrap text-gray-600" title={`${d.duree_minutes || 0} min`}>
                    ⏱ {formatDuree(d.duree_minutes || 0)}
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${statutStyle(d.statut)}`}>{d.statut}</span>
                  </td>
                  <td className="p-2 whitespace-nowrap text-gray-600">{formatDate(d.created_at)}</td>
                  <td className="p-2">
                    <a href={`/${d.type_travail.toLowerCase()}?dossier=${d.id}`}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 whitespace-nowrap">
                      Ouvrir
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-3 text-sm text-gray-500">Chargement des dossiers...</div>}
        {!loading && allDossiers.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">
            Aucun dossier. Créez-en un depuis DMI / AP / CNSS / IS.
          </div>
        )}
      </div>

      {sansCnss.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">⚠️ Sociétés sans CNSS ({sansCnss.length})</h2>
            <p className="text-xs text-gray-500 mt-1">
              Elles ont déjà DMI / IS / AP mais aucun dossier CNSS. Cliquer sur « Créer CNSS » pour le rajouter.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sansCnss.map(g => (
              <div key={g.societe_id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                <div className="min-w-0">
                  <div className="font-medium truncate">{socNom(g.societe_id)}</div>
                  <div className="text-xs text-gray-500">
                    Déjà : {g.presents.map(t => `${ICONS[t]} ${t}`).join(' · ')}
                  </div>
                </div>
                <a href={`/cnss?societe=${g.societe_id}`}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 whitespace-nowrap">
                  ➕ Créer CNSS
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">🚀 Démarrage rapide</h2>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(t => (
              <a key={t} href={`/${t.toLowerCase()}`}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                <span className="font-medium">{ICONS[t]} {t}</span>
                <span className="text-xs text-gray-500">{dossiers.filter(d => d.type_travail === t).length} dossier(s)</span>
              </a>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <b>Comment ça marche ?</b>
            <ol className="list-decimal ml-5 mt-1 space-y-1">
              <li>Choisir la société et créer le dossier.</li>
              <li>Cliquer dessus, ajouter le PDF ou le reçu RCUE.</li>
              <li>L’expert voit la trace dans <a href="/audit" className="underline">Audit</a>.</li>
            </ol>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">
            {isAdmin ? '🕒 Dernières actions (Audit)' : '📁 Mes derniers dossiers'}
          </h2>
          {isAdmin ? (
            <>
              {audit.slice(0, 5).map(e => (
                <div key={e.id} className="border-b py-2 text-sm last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <b>{e.user_name}</b>
                    <span className={`px-2 py-0.5 rounded text-xs ${actionStyle(e.action)}`}>
                      {actionLabel(e.action)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    {e.societe_nom || '—'} · {e.travail_titre || '—'} · {formatDate(e.created_at)}
                  </div>
                </div>
              ))}
              {audit.length === 0 && !loading && <p className="text-sm text-gray-500">Aucune action enregistrée.</p>}
              <a href="/audit" className="inline-block mt-3 text-sm text-blue-600 hover:underline">
                Voir tout le journal →
              </a>
            </>
          ) : (
            <>
              {recent.map(d => (
                <div key={d.id} className="border-b py-2 text-sm last:border-0">
                  <div className="font-medium">{d.titre}</div>
                  <div className="text-xs text-gray-600">
                    {d.type_travail} · {socNom(d.societe_id)} · 📎 {d.nb_pieces || 0} · 🧾 {d.nb_recues || 0}
                  </div>
                </div>
              ))}
              {recent.length === 0 && !loading && <p className="text-sm text-gray-500">Aucun dossier pour le moment.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
