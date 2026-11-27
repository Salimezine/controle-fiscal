import { useEffect, useState } from 'react';

import { API_URL, authFetch } from '../lib/api';
import { getSession } from '../lib/auth';

interface Societe { id: string; raison_sociale: string; matricule_fiscal: string | null }
interface Comptable { id: string; full_name: string; email: string }
interface Travail {
  id: string; societe_id: string; type_travail: string; reference: string | null;
  titre: string; description: string | null; statut: string; created_at: string;
  comptable_id: string | null; comptable_name: string | null; assigned_at: string | null;
  nb_pieces: number; nb_recues: number;
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
        setSocietes(await s.json());
        const list = await t.json();
        setTravaux(Array.isArray(list) ? list : []);
        if (c) setComptables(await c.json());
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [type, isAdmin]);

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

  const createDossier = async () => {
    if (!dossier.societe_id || !dossier.titre) { setError('Société et titre requis.'); return; }
    setBusy(true); setError('');
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
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const uploadPiece = async (file: File) => {
    if (!selectedId) return;
    if (file.size > 700 * 1024) { setError('PDF trop volumineux (max 700KB).'); return; }
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('file', file); fd.append('label', file.name);
    try {
      const res = await authFetch(`${API_URL}/api/travaux/${selectedId}/pieces`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      setPieces(await (await authFetch(`${API_URL}/api/travaux/${selectedId}/pieces`)).json());
      await loadTravaux();
    } catch (e: any) { setError(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const addRecue = async () => {
    if (!selectedId || !recue.numero_recu) { setError('Numéro de reçu requis.'); return; }
    setBusy(true); setError('');
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{icone} {titre}</h1>
      {error && <div className="mb-4 p-2 rounded bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dossiers + création */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Dossiers {type} ({filtered.length})</h2>
            </div>
            <select value={filterSociete} onChange={e => setFilterSociete(e.target.value)}
              className="w-full p-2 border rounded mb-3 text-sm">
              <option value="">Toutes les sociétés</option>
              {societes.map(s => <option key={s.id} value={s.id}>{s.raison_sociale}</option>)}
            </select>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              {loading && <div className="text-sm text-gray-500">Chargement...</div>}
              {filtered.map(t => (
                <div key={t.id} onClick={() => loadDossier(t.id)}
                  className={`p-3 border rounded-lg mb-2 cursor-pointer hover:bg-gray-50 ${selectedId === t.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                  <div className="font-medium">{t.titre}</div>
                  <div className="text-xs text-gray-500">{socNom(t.societe_id)} · {t.reference || 'sans réf.'} · {t.statut}</div>
                  <div className="text-xs text-gray-500">
                    👤 {t.comptable_name || 'Non attribué'} · 📎 {t.nb_pieces || 0} pièce(s) · 🧾 {t.nb_recues || 0} reçu(s)
                  </div>
                </div>
              ))}
              {!loading && filtered.length === 0 && <div className="text-sm text-gray-500">Aucun dossier.</div>}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Nouveau dossier {type}</h2>
            <div className="space-y-2">
              <select value={dossier.societe_id} onChange={e => setDossier({ ...dossier, societe_id: e.target.value })}
                className="w-full p-2 border rounded text-sm">
                <option value="">— Société —</option>
                {societes.map(s => <option key={s.id} value={s.id}>{s.raison_sociale}</option>)}
              </select>
              {isAdmin && (
                <select value={dossier.comptable_id} onChange={e => setDossier({ ...dossier, comptable_id: e.target.value })}
                  className="w-full p-2 border rounded text-sm">
                  <option value="">Comptable : moi-même (expert)</option>
                  {comptables.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              )}
              {!isAdmin && (
                <div className="text-xs text-blue-700 bg-blue-50 p-2 rounded">
                  Comptable attribué automatiquement : {getSession()?.user.full_name}
                </div>
              )}
              <input placeholder="Référence" value={dossier.reference}
                onChange={e => setDossier({ ...dossier, reference: e.target.value })}
                className="w-full p-2 border rounded text-sm" />
              <input placeholder="Titre du dossier *" value={dossier.titre}
                onChange={e => setDossier({ ...dossier, titre: e.target.value })}
                className="w-full p-2 border rounded text-sm" />
              <input placeholder="Description" value={dossier.description}
                onChange={e => setDossier({ ...dossier, description: e.target.value })}
                className="w-full p-2 border rounded text-sm" />
              <button onClick={createDossier} disabled={busy}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
                {busy ? 'En cours...' : 'Créer le dossier'}
              </button>
            </div>
          </div>
        </div>

        {/* Détail du dossier sélectionné */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Dossier sélectionné</h2>
            {!selectedId && <p className="text-sm text-gray-500">Cliquez sur un dossier pour voir ses pièces et reçus.</p>}
            {selectedId && dossierMeta && (
              <div className="text-sm space-y-1">
                <div className="font-medium text-base">{dossierMeta.titre}</div>
                <div>Société : <b>{socNom(dossierMeta.societe_id)}</b></div>
                <div>Comptable : <b>{dossierMeta.comptable_name || 'Non attribué'}</b></div>
                <div>Référence : {dossierMeta.reference || '—'} · Statut : {dossierMeta.statut}</div>
                <div className="text-gray-500">Créé le {dossierMeta.created_at}</div>
              </div>
            )}
          </div>

          {selectedId && (
            <>
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold mb-3">📎 Pièces justificatives PDF</h2>
                <input type="file" accept=".pdf" disabled={busy}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPiece(f); }}
                  className="block w-full text-sm mb-3" />
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {pieces.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-xs text-gray-500">{p.file_name} ({Math.round(p.file_size / 1024)} KB)</div>
                      </div>
                      <button onClick={() => download(`${API_URL}/api/pieces/${p.id}/download`, p.file_name)}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Télécharger</button>
                    </div>
                  ))}
                  {pieces.length === 0 && <div className="text-sm text-gray-500">Aucune pièce.</div>}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold mb-3">🧾 Reçus (RCUE)</h2>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input placeholder="N° reçu *" value={recue.numero_recu}
                    onChange={e => setRecue({ ...recue, numero_recu: e.target.value })}
                    className="p-2 border rounded text-sm" />
                  <input type="number" step="0.001" placeholder="Montant" value={recue.montant}
                    onChange={e => setRecue({ ...recue, montant: e.target.value })}
                    className="p-2 border rounded text-sm" />
                  <input type="date" value={recue.date_recu}
                    onChange={e => setRecue({ ...recue, date_recu: e.target.value })}
                    className="p-2 border rounded text-sm" />
                  <input placeholder="Description" value={recue.description}
                    onChange={e => setRecue({ ...recue, description: e.target.value })}
                    className="p-2 border rounded text-sm" />
                </div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-600 mb-1">PDF du reçu (max 700KB)</label>
                  <input type="file" accept=".pdf" disabled={busy}
                    onChange={e => setPdfFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs" />
                </div>
                <button onClick={addRecue} disabled={busy}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm mb-3">
                  {busy ? 'En cours...' : 'Ajouter le reçu'}
                </button>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recues.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="text-sm font-medium">RCUE n°{r.numero_recu} · {r.montant ?? '—'} TND</div>
                        <div className="text-xs text-gray-500">
                          {r.date_recu || '—'} {r.description ? '· ' + r.description : ''}
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.pdf_id ? `📄 ${r.pdf_name} · par ${r.pdf_uploaded_by || '—'}` : '⚠️ sans PDF'}
                        </div>
                      </div>
                      {r.pdf_id && (
                        <button onClick={() => download(`${API_URL}/api/recues/${r.id}/pdf`, r.pdf_name || 'recue.pdf')}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs">PDF</button>
                      )}
                    </div>
                  ))}
                  {recues.length === 0 && <div className="text-sm text-gray-500">Aucun reçu.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
