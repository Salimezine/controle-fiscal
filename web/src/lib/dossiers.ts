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

//Sociétés qui ont DMI/IS/AP mais aucun dossier CNSS.
//Utilisé dans l'Accueil pour voir ce qu'il reste à renseigner.
export function societesSansCNSS(dossiers: DossierRow[]): Array<{ societe_id: string; presents: string[] }> {
  const parSociete = new Map<string, Set<string>>();
  for (const d of dossiers) {
    if (!parSociete.has(d.societe_id)) parSociete.set(d.societe_id, new Set());
    parSociete.get(d.societe_id)!.add(d.type_travail);
  }
  const autres = ['DMI', 'IS', 'AP'];
  return [...parSociete.entries()]
    .filter(([, types]) => !types.has('CNSS') && autres.some(t => types.has(t)))
    .map(([societe_id, types]) => ({
      societe_id,
      presents: autres.filter(t => types.has(t))
    }))
    .sort((a, b) => a.societe_id.localeCompare(b.societe_id));
}
