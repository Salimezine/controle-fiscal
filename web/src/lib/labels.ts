// Libellés clairs pour le journal d'audit (partagés Accueil / Audit).
export const ACTION_LABELS: Record<string, string> = {
  creation_dossier: 'Dossier créé',
  ajout_piece: 'PDF ajouté',
  ajout_recu: 'Reçu ajouté',
  ajout_recu_pdf: 'Reçu + PDF ajoutés',
  suppression_dossier: 'Dossier supprimé',
  creation_compte: 'Compte créé',
  modification_compte: 'Compte modifié',
  desactivation_compte: 'Compte désactivé',
  modification_objectifs: 'Objectifs modifiés'
};

export const actionLabel = (action: string) => ACTION_LABELS[action] || action;

export const actionStyle = (action: string) => {
  if (action.includes('pdf') || action === 'ajout_piece') return 'bg-green-100 text-green-700';
  if (action.includes('dossier')) return 'bg-blue-100 text-blue-700';
  if (action.includes('compte')) return 'bg-purple-100 text-purple-700';
  if (action.includes('objectif')) return 'bg-orange-100 text-orange-700';
  return 'bg-gray-100 text-gray-700';
};

export const formatDate = (value: string) => {
  if (!value) return '—';
  // "2026-11-27 10:14:21" -> "27/11 10:14"
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : value;
};
