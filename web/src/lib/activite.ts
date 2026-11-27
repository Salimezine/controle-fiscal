export interface ActiviteType {
  crees: number;
  realises: number;
}

export interface ActiviteComptable {
  id: string;
  full_name: string;
  role: string;
  dossiers_crees: number;
  realises: number;
  par_type: Record<string, ActiviteType>;
  minutes: number;
  heures: number;
}

export interface ActiviteResponse {
  annee: number;
  comptables: ActiviteComptable[];
  total: { dossiers_crees: number; realises: number; minutes: number; heures: number };
}

// Affichage lisible du temps de traitement (création -> dernière activité).
export function formatDuree(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

export function roleCourt(role: string): string {
  return role === 'admin' ? 'Expert' : 'Comptable';
}
