export interface DossierRow {
  id: string;
  type_travail: string;
  titre: string;
  societe_id: string;
  comptable_name?: string | null;
  reference?: string | null;
  created_at: string;
}

export interface SocieteRow {
  id: string;
  raison_sociale: string;
}

// Liste complète de l'Accueil : recherche libre + filtre par type.
export function filterDossiers<T extends DossierRow>(
  dossiers: T[],
  societes: SocieteRow[],
  search: string,
  type: string
): T[] {
  const q = search.trim().toLowerCase();
  return dossiers
    .filter(d => {
      if (type && d.type_travail !== type) return false;
      if (!q) return true;
      const soc = societes.find(s => s.id === d.societe_id)?.raison_sociale || '';
      return [d.type_travail, d.titre, soc, d.comptable_name || '', d.reference || '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
