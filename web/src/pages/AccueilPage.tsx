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
    s === 'termine' || s === 'valide' ? 'cf-badge-green' : 'cf-badge-amber';

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
      <div className="cf-page-head">
        <div>
          <h1 className="cf-page-title">👋 Bonjour {session?.user.full_name}</h1>
          <p className="cf-page-sub">
            {isAdmin
              ? 'Espace Expert — vue complète, contrôle et traçabilité.'
              : 'Espace Comptable — vos dossiers, vos PDF et vos reçus.'}
          </p>
        </div>
        <span className={`cf-badge ${isAdmin ? 'cf-badge-purple' : 'cf-badge-blue'}`}>
          {isAdmin ? 'Expert / Admin' : 'Comptable'}
        </span>
      </div>

      <div className="cf-alert cf-alert-success mb-4">
        <span>✅</span>
        <span><b>Données locales.</b> Aucune synchronisation avec EUREX — la D1 locale est la source de vérité.</span>
      </div>
      {error && <div className="cf-alert cf-alert-error mb-4">{error}</div>}

      <div className="cf-card p-4 mb-5">
        <div className="cf-toolbar">
          <div className="cf-field">
            <label htmlFor="annee-accueil" className="cf-label">📅 Année</label>
            <select id="annee-accueil" value={annee}
              onChange={e => setAnnee(Number(e.target.value))}
              className="p-2 rounded text-sm bg-white w-28">
              {(annees.length ? annees : [annee]).map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <span className="cf-badge cf-badge-blue">{annee}</span>
          <span className="text-xs cf-muted">
            Objectifs, activité, dossiers et compteurs affichés pour cette année.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {stats.map(s => (
          <a key={s.label} href={s.href} className="cf-stat">
            <span className="cf-stat-icon">{s.icon}</span>
            <span className="min-w-0">
              <span className="cf-stat-value block">{loading ? '…' : s.value}</span>
              <span className="cf-stat-label">{s.label}</span>
            </span>
          </a>
        ))}
      </div>

      {objectifs.length > 0 && (
        <div className="cf-card p-5 mb-4">
          <div className="cf-page-head mb-4">
            <div>
              <h2 className="cf-section-title">🎯 Objectifs {annee} — PDF déposés</h2>
              <p className="cf-section-sub">Le « réalisé » compte les pièces et reçus déposés pendant l’année.</p>
            </div>
            <a href="/objectifs" className="cf-btn cf-btn-soft cf-btn-sm">
              {isAdmin ? 'Modifier les objectifs →' : 'Voir par société →'}
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {objectifs.map(o => (
              <div key={o.type_travail}>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-semibold">{ICONS[o.type_travail]} {o.type_travail}</span>
                  <span className={o.pourcent >= 100 ? 'text-green-700 font-bold' : 'cf-muted'}>
                    <b>{o.realise}</b> / {o.objectif > 0 ? o.objectif : '—'}
                    {o.objectif > 0 && ` · ${o.pourcent}%`}
                  </span>
                </div>
                <div className={`cf-progress ${o.pourcent >= 100 ? 'is-done' : ''}`}>
                  <span style={{ width: `${o.pourcent}%` }} />
                </div>
                <div className="text-xs cf-muted mt-1.5">
                  {o.dossiers_crees} dossier(s) créé(s) · reste <b>{o.reste}</b>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && <ActiviteComptables annee={annee} />}

      <div className="cf-card p-5 mb-4">
        <div className="cf-page-head mb-4">
          <div>
            <h2 className="cf-section-title flex items-center gap-2">
              📁 Tous les dossiers <span className="cf-badge cf-badge-blue">{allDossiers.length}</span>
            </h2>
            <p className="cf-section-sub">
              {isAdmin ? 'Expert : tous les dossiers de l’année.' : 'Comptable : vos dossiers attribués.'}
            </p>
          </div>
          <div className="cf-toolbar">
            <input type="search" placeholder="🔍 Société / titre / comptable / réf."
              value={searchDossier} onChange={e => setSearchDossier(e.target.value)}
              className="p-2 rounded text-sm w-64" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="p-2 rounded text-sm">
              <option value="">Tous les types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="cf-table-scroll">
          <table className="cf-table">
            <thead>
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
                <tr key={d.id}>
                  <td className="font-medium whitespace-nowrap">{ICONS[d.type_travail]} {d.type_travail}</td>
                  <td className="font-medium">{d.titre}</td>
                  <td>{socNom(d.societe_id)}</td>
                  <td>{d.comptable_name || <span className="cf-badge cf-badge-amber">Non attribué</span>}</td>
                  <td className="cf-muted">{d.reference || '—'}</td>
                  <td className="whitespace-nowrap">📎 {d.nb_pieces || 0} · 🧾 {d.nb_recues || 0}</td>
                  <td className="whitespace-nowrap cf-muted" title={`${d.duree_minutes || 0} min`}>
                    ⏱ {formatDuree(d.duree_minutes || 0)}
                  </td>
                  <td>
                    <span className={`cf-badge ${statutStyle(d.statut)}`}>{d.statut}</span>
                  </td>
                  <td className="whitespace-nowrap cf-muted">{formatDate(d.created_at)}</td>
                  <td>
                    <a href={`/${d.type_travail.toLowerCase()}?dossier=${d.id}`}
                      className="cf-btn cf-btn-primary cf-btn-sm whitespace-nowrap">
                      Ouvrir →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-3 text-sm cf-muted">Chargement des dossiers...</div>}
        {!loading && allDossiers.length === 0 && (
          <div className="cf-empty mt-3">
            <b>Aucun dossier pour {annee}</b>
            Créez-en un depuis DMI / AP / CNSS / IS, ou changez l’année.
          </div>
        )}
      </div>

      {sansCnss.length > 0 && (
        <div className="cf-card p-5 mb-4">
          <div className="cf-alert cf-alert-warn mb-4">
            <span>⚠️</span>
            <span>
              <b>Sociétés sans CNSS ({sansCnss.length}).</b> Elles ont déjà DMI / IS / AP mais aucun dossier CNSS —
              cliquez sur « Créer CNSS » pour le rajouter.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sansCnss.map(g => (
              <div key={g.societe_id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{socNom(g.societe_id)}</div>
                  <div className="text-xs cf-muted">
                    Déjà : {g.presents.map(t => `${ICONS[t]} ${t}`).join(' · ')}
                  </div>
                </div>
                <a href={`/cnss?societe=${g.societe_id}`} className="cf-btn cf-btn-primary cf-btn-sm whitespace-nowrap">
                  ➕ Créer CNSS
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="cf-card p-5">
          <h2 className="cf-section-title mb-4">🚀 Démarrage rapide</h2>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(t => (
              <a key={t} href={`/${t.toLowerCase()}`}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-white transition hover:border-blue-300 hover:bg-blue-50/60">
                <span className="font-semibold">{ICONS[t]} {t}</span>
                <span className="cf-badge cf-badge-gray">
                  {dossiers.filter(d => d.type_travail === t).length}
                </span>
              </a>
            ))}
          </div>
          <div className="cf-alert cf-alert-info mt-4 block">
            <b>Comment ça marche ?</b>
            <ol className="list-decimal ml-5 mt-2 space-y-1">
              <li>Choisir la société et créer le dossier.</li>
              <li>L’ouvrir, ajouter le PDF ou le reçu RCUE.</li>
              <li>L’expert voit la trace dans <a href="/audit" className="font-semibold underline">Audit</a>.</li>
            </ol>
          </div>
        </div>

        <div className="cf-card p-5">
          <h2 className="cf-section-title mb-4">
            {isAdmin ? '🕒 Dernières actions (Audit)' : '📁 Mes derniers dossiers'}
          </h2>
          {isAdmin ? (
            <>
              {audit.slice(0, 5).map(e => (
                <div key={e.id} className="py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm">{e.user_name}</b>
                    <span className={`cf-badge ${actionStyle(e.action)}`}>{actionLabel(e.action)}</span>
                  </div>
                  <div className="text-xs cf-muted mt-1">
                    {e.societe_nom || '—'} · {e.travail_titre || '—'} · {formatDate(e.created_at)}
                  </div>
                </div>
              ))}
              {audit.length === 0 && !loading && <div className="cf-empty">Aucune action enregistrée.</div>}
              <a href="/audit" className="inline-block mt-3 text-sm font-semibold text-blue-700 hover:underline">
                Voir tout le journal →
              </a>
            </>
          ) : (
            <>
              {recent.map(d => (
                <div key={d.id} className="py-2.5 border-b border-slate-100 last:border-0">
                  <div className="font-medium text-sm">{d.titre}</div>
                  <div className="text-xs cf-muted mt-1">
                    {d.type_travail} · {socNom(d.societe_id)} · 📎 {d.nb_pieces || 0} · 🧾 {d.nb_recues || 0}
                  </div>
                </div>
              ))}
              {recent.length === 0 && !loading && <div className="cf-empty">Aucun dossier pour le moment.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
