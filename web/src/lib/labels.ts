// Libellés clairs pour le journal d'audit (partagés Accueil / Audit).
export const ACTION_LABELS: Record<string, string> = {
  creation_dossier: 'Dossier créé',
  creation_dossier_auto: 'Dossier créé auto (1er janvier)',
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
  if (action.includes('pdf') || action === 'ajout_piece') return 'cf-badge-green';
  if (action.includes('dossier')) return 'cf-badge-blue';
  if (action.includes('compte')) return 'cf-badge-purple';
  if (action.includes('objectif')) return 'cf-badge-amber';
  return 'cf-badge-gray';
};

export const formatDate = (value: string) => {
  if (!value) return '—';
  // "2026-11-27 10:14:21" -> "27/11 10:14"
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : value;
};
