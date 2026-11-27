import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { API_URL, authFetch } from '../lib/api';
import { formatDuree } from '../lib/activite';
import { getSession } from '../lib/auth';

interface Societe { id: string; raison_sociale: string; matricule_fiscal: string | null }
interface Comptable { id: string; full_name: string; email: string }
interface Travail {
  id: string; societe_id: string; type_travail: string; reference: string | null;
  titre: string; description: string | null; statut: string; created_at: string;
  comptable_id: string | null; comptable_name: string | null; assigned_at: string | null;
  nb_pieces: number; nb_recues: number; duree_minutes?: number;
}
interface Piece { id: string; label: string; file_name: string; file_size: number; uploaded_at: string }
interface Recue {
  id: string; numero_recu: string; montant: number | null; date_recu: string | null;
  description: string | null; created_at: string;
  pdf_id: string | null; pdf_name: string | null; pdf_size: number | null;
  pdf_uploaded_by: string | null; pdf_uploaded_at: string | null;
}

const emptyDossier = { societe_id: '', reference: '', titre: '', description: '', comptable_id: '' };
const emptyRecue = { numero_recu: '', montant: '', date_recu: '', description: '' };

export default function DossierPage({ type, titre, icone }: { type: string; titre: string; icone: string }) {
  const isAdmin = getSession()?.user.role === 'admin';
  const location = useLocation();
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [comptables, setComptables] = useState<Comptable[]>([]);
  const [filterSociete, setFilterSociete] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossierMeta, setDossierMeta] = useState<Travail | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [recues, setRecues] = useState<Recue[]>([]);
  const [dossier, setDossier] = useState(emptyDossier);
  const [recue, setRecue] = useState(emptyRecue);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDossier = async (id: string) => {
    setSelectedId(id);
    setError('');
    const [p, r, t] = await Promise.all([
      authFetch(`${API_URL}/api/travaux/${id}/pieces`),
      authFetch(`${API_URL}/api/travaux/${id}/recues`),
      authFetch(`${API_URL}/api/travaux/${id}`)
    ]);
    setPieces(await p.json());
    setRecues(await r.json());
    setDossierMeta(await t.json());
  };

  const loadTravaux = async () => {
    const res = await authFetch(`${API_URL}/api/travaux?type=${type}`);
    const data = await res.json();
    setTravaux(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    Promise.all([
      authFetch(`${API_URL}/api/societes`),
      authFetch(`${API_URL}/api/travaux?type=${type}`),
      isAdmin ? authFetch(`${API_URL}/api/comptables`) : Promise.resolve(null)
    ])
      .then(async ([s, t, c]) => {
        const societesList = await s.json();
        setSocietes(societesList);
        const list = await t.json();
        const arr: Travail[] = Array.isArray(list) ? list : [];
        setTravaux(arr);
        if (c) setComptables(await c.json());
        setLoading(false);

        const params = new URLSearchParams(location.search);
        // Depuis l'Accueil : /dmi?dossier=<id>
        const wanted = params.get('dossier');
        if (wanted && arr.some(d => d.id === wanted)) await loadDossier(wanted);
        // Depuis la section « sans CNSS » : /cnss?societe=<id>
        const wantedSoc = params.get('societe');
        if (wantedSoc && Array.isArray(societesList) &&
            societesList.some((soc: Societe) => soc.id === wantedSoc)) {
          setDossier(d => ({ ...d, societe_id: wantedSoc }));
        }
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [type, isAdmin, location.search]);

  const createDossier = async () => {
    if (!dossier.societe_id || !dossier.titre) { setError('Société et titre requis.'); return; }
    setBusy(true); setError(''); setSuccess('');
    const body: any = {
      societe_id: dossier.societe_id, type_travail: type,
      reference: dossier.reference || null, titre: dossier.titre,
      description: dossier.description || null
    };
    if (isAdmin && dossier.comptable_id) {
      body.comptable_id = dossier.comptable_id;
      body.comptable_nom = comptables.find(c => c.id === dossier.comptable_id)?.full_name;
    }
    try {
      const res = await authFetch(`${API_URL}/api/travaux`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      const created = await res.json();
      setDossier(emptyDossier);
      await loadTravaux();
      await loadDossier(created.id);
      setSuccess(`Dossier créé${created.comptable_name ? ` et attribué à ${created.comptable_name}` : ''}.`);
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const uploadPiece = async (file: File) => {
    if (!selectedId) return;
    if (file.size > 700 * 1024) { setError('PDF trop volumineux (max 700KB).'); return; }
    setBusy(true); setError(''); setSuccess('');
    const fd = new FormData();
    fd.append('file', file); fd.append('label', file.name);
    try {
      const res = await authFetch(`${API_URL}/api/travaux/${selectedId}/pieces`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      setPieces(await (await authFetch(`${API_URL}/api/travaux/${selectedId}/pieces`)).json());
      await loadTravaux();
      setSuccess('PDF ajouté et enregistré dans l’Audit avec votre nom.');
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const addRecue = async () => {
    if (!selectedId || !recue.numero_recu) { setError('Numéro de reçu requis.'); return; }
    setBusy(true); setError(''); setSuccess('');
    const fd = new FormData();
    fd.append('numero_recu', recue.numero_recu);
    fd.append('montant', recue.montant);
    fd.append('date_recu', recue.date_recu);
    fd.append('description', recue.description);
    if (pdfFile) fd.append('file', pdfFile);
    try {
      const res = await authFetch(`${API_URL}/api/travaux/${selectedId}/recues`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      setRecue(emptyRecue); setPdfFile(null);
      setRecues(await (await authFetch(`${API_URL}/api/travaux/${selectedId}/recues`)).json());
      await loadTravaux();
      setSuccess('Reçu ajouté et enregistré dans l’Audit avec votre nom.');
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const download = async (url: string, name: string) => {
    const res = await authFetch(url);
    if (!res.ok) { setError('Téléchargement impossible'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  };

  const filtered = filterSociete ? travaux.filter(t => t.societe_id === filterSociete) : travaux;
  const socNom = (id: string) => societes.find(s => s.id === id)?.raison_sociale || '—';
  const statutStyle = (s: string) =>
    s === 'termine' || s === 'valide' ? 'cf-badge-green' : 'cf-badge-amber';

  return (
    <div>
      <div className="cf-page-head">
        <div>
          <h1 className="cf-page-title">{icone} {titre}</h1>
          <p className="cf-page-sub">Un dossier par société et par type. Chaque PDF déposé est compté et tracé.</p>
        </div>
        <span className="cf-badge cf-badge-blue">{travaux.length} dossier(s)</span>
      </div>
      <div className="cf-toolbar mb-4">
        <span className="cf-step"><b>1</b> Créer le dossier</span>
        <span className="text-xs cf-muted">→</span>
        <span className="cf-step"><b>2</b> Ouvrir le dossier</span>
        <span className="text-xs cf-muted">→</span>
        <span className="cf-step"><b>3</b> Ajouter PDF / reçu</span>
      </div>
      {error && <div className="cf-alert cf-alert-error mb-4">{error}</div>}
      {success && <div className="cf-alert cf-alert-success mb-4">✅ {success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dossiers + création */}
        <div className="space-y-4">
          <div className="cf-card p-5">
            <div className="cf-page-head mb-3">
              <h2 className="cf-section-title flex items-center gap-2">
                📋 Dossiers {type} <span className="cf-badge cf-badge-blue">{filtered.length}</span>
              </h2>
            </div>
            <p className="text-xs cf-muted mb-2">Cliquez sur un dossier pour l’ouvrir à droite.</p>
            <select value={filterSociete} onChange={e => setFilterSociete(e.target.value)}
              className="w-full p-2 rounded mb-3 text-sm">
              <option value="">Toutes les sociétés</option>
              {societes.map(s => <option key={s.id} value={s.id}>{s.raison_sociale}</option>)}
            </select>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              {loading && <div className="text-sm cf-muted">Chargement...</div>}
              {filtered.map(t => (
                <div key={t.id} onClick={() => loadDossier(t.id)}
                  className={`cf-dossier-item p-3 border border-slate-200 rounded-xl mb-2 ${selectedId === t.id ? 'is-active' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{t.titre}</div>
                    <span className={`cf-badge ${statutStyle(t.statut)}`}>{t.statut}</span>
                  </div>
                  <div className="text-xs cf-muted mt-1">
                    {socNom(t.societe_id)} · {t.reference || 'sans réf.'}
                  </div>
                  <div className="text-xs cf-muted mt-1">
                    👤 {t.comptable_name || 'Non attribué'} · 📎 {t.nb_pieces || 0} pièce(s) · 🧾 {t.nb_recues || 0} reçu(s)
                    {' '}· ⏱ {formatDuree(t.duree_minutes || 0)}
                  </div>
                </div>
              ))}
              {!loading && filtered.length === 0 && <div className="cf-empty">Aucun dossier.</div>}
            </div>
          </div>

          <div className="cf-card p-5">
            <h2 className="cf-section-title mb-1">➕ Nouveau dossier {type}</h2>
            <p className="text-xs cf-muted mb-4">Société → Référence / Titre → Créer.</p>
            <div className="space-y-2">
              <select value={dossier.societe_id} onChange={e => setDossier({ ...dossier, societe_id: e.target.value })}
                className="w-full p-2 rounded text-sm">
                <option value="">— Société —</option>
                {societes.map(s => <option key={s.id} value={s.id}>{s.raison_sociale}</option>)}
              </select>
              {isAdmin && (
                <select value={dossier.comptable_id} onChange={e => setDossier({ ...dossier, comptable_id: e.target.value })}
                  className="w-full p-2 rounded text-sm">
                  <option value="">Comptable : moi-même (expert)</option>
                  {comptables.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              )}
              {!isAdmin && (
                <div className="cf-alert cf-alert-info">
                  Comptable attribué automatiquement : <b>{getSession()?.user.full_name}</b>
                </div>
              )}
              <input placeholder="Référence" value={dossier.reference}
                onChange={e => setDossier({ ...dossier, reference: e.target.value })}
                className="w-full p-2 rounded text-sm" />
              <input placeholder="Titre du dossier *" value={dossier.titre}
                onChange={e => setDossier({ ...dossier, titre: e.target.value })}
                className="w-full p-2 rounded text-sm" />
              <input placeholder="Description" value={dossier.description}
                onChange={e => setDossier({ ...dossier, description: e.target.value })}
                className="w-full p-2 rounded text-sm" />
              <button onClick={createDossier} disabled={busy} className="cf-btn cf-btn-primary cf-btn-block">
                {busy ? 'En cours...' : 'Créer le dossier →'}
              </button>
            </div>
          </div>
        </div>

        {/* Détail du dossier sélectionné */}
        <div className="space-y-4">
          <div className="cf-card p-5">
            <h2 className="cf-section-title mb-3">👆 Dossier ouvert</h2>
            {!selectedId && (
              <div className="cf-empty">
                <b>Aucun dossier sélectionné</b>
                Cliquez sur un dossier à gauche pour voir ses pièces et ses reçus.
              </div>
            )}
            {selectedId && dossierMeta && (
              <div className="text-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-base">{dossierMeta.titre}</div>
                  <span className={`cf-badge ${statutStyle(dossierMeta.statut)}`}>{dossierMeta.statut}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <div className="text-xs cf-muted">Société</div>
                    <div className="font-semibold">{socNom(dossierMeta.societe_id)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <div className="text-xs cf-muted">Comptable</div>
                    <div className="font-semibold">{dossierMeta.comptable_name || 'Non attribué'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <div className="text-xs cf-muted">Référence</div>
                    <div className="font-semibold">{dossierMeta.reference || '—'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5">
                    <div className="text-xs cf-muted">Créé le</div>
                    <div className="font-semibold">{dossierMeta.created_at}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedId && (
            <>
              <div className="cf-card p-5">
                <h2 className="cf-section-title mb-1">📎 Pièces PDF</h2>
                <p className="text-xs cf-muted mb-3">PDF seulement, max 700KB. Ajout tracé dans l’Audit.</p>
                <label className={`cf-drop block mb-3 ${busy ? 'opacity-50' : ''}`}>
                  <b>📤 Ajouter un PDF</b>
                  <span className="block mt-1">Cliquer pour choisir un fichier (700 KB max)</span>
                  <input type="file" accept=".pdf" disabled={busy}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadPiece(f); }}
                    className="block w-full text-xs mt-2" />
                </label>
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {pieces.map(p => (
                    <div key={p.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-white">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{p.label}</div>
                        <div className="text-xs cf-muted">{p.file_name} · {Math.round(p.file_size / 1024)} KB</div>
                      </div>
                      <button onClick={() => download(`${API_URL}/api/pieces/${p.id}/download`, p.file_name)}
                        className="cf-btn cf-btn-soft cf-btn-sm whitespace-nowrap">⬇ PDF</button>
                    </div>
                  ))}
                  {pieces.length === 0 && <div className="cf-empty">Aucune pièce déposée.</div>}
                </div>
              </div>

              <div className="cf-card p-5">
                <h2 className="cf-section-title mb-1">🧾 Reçus (RCUE)</h2>
                <p className="text-xs cf-muted mb-3">N° reçu obligatoire. Joindre le PDF du reçu si disponible.</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input placeholder="N° reçu *" value={recue.numero_recu}
                    onChange={e => setRecue({ ...recue, numero_recu: e.target.value })}
                    className="p-2 rounded text-sm" />
                  <input type="number" step="0.001" placeholder="Montant" value={recue.montant}
                    onChange={e => setRecue({ ...recue, montant: e.target.value })}
                    className="p-2 rounded text-sm" />
                  <input type="date" value={recue.date_recu}
                    onChange={e => setRecue({ ...recue, date_recu: e.target.value })}
                    className="p-2 rounded text-sm" />
                  <input placeholder="Description" value={recue.description}
                    onChange={e => setRecue({ ...recue, description: e.target.value })}
                    className="p-2 rounded text-sm" />
                </div>
                <div className="mb-3">
                  <label className="cf-label block mb-1">PDF du reçu (max 700KB)</label>
                  <input type="file" accept=".pdf" disabled={busy}
                    onChange={e => setPdfFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs" />
                </div>
                <button onClick={addRecue} disabled={busy} className="cf-btn cf-btn-success cf-btn-block mb-3">
                  {busy ? 'En cours...' : 'Ajouter le reçu →'}
                </button>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recues.map(r => (
                    <div key={r.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-white">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">RCUE n°{r.numero_recu} · {r.montant ?? '—'} TND</div>
                        <div className="text-xs cf-muted">
                          {r.date_recu || '—'} {r.description ? '· ' + r.description : ''}
                        </div>
                        <div className="text-xs cf-muted">
                          {r.pdf_id ? `📄 ${r.pdf_name} · par ${r.pdf_uploaded_by || '—'}` : '⚠️ sans PDF'}
                        </div>
                      </div>
                      {r.pdf_id && (
                        <button onClick={() => download(`${API_URL}/api/recues/${r.id}/pdf`, r.pdf_name || 'recue.pdf')}
                          className="cf-btn cf-btn-success cf-btn-sm whitespace-nowrap">PDF</button>
                      )}
                    </div>
                  ))}
                  {recues.length === 0 && <div className="cf-empty">Aucun reçu ajouté.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
