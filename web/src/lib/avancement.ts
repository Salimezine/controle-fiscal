// Avancement d’un dossier : PDF déposés / objectif de la société pour ce type.
// Un « réalisé » = pièce PDF ou PDF de reçu déposé dans l’année.
export const OBJECTIFS_DEFAUT: Record<string, number> = {
  DMI: 12,
  AP: 3,
  CNSS: 4,
  IS: 1
};

export interface DossierAvancement {
  societe_id: string;
  type_travail: string;
  nb_pieces?: number;
  nb_recues_pdf?: number;
}

export interface Avancement {
  objectif: number;
  realise: number;
  pourcent: number;
  sansObjectif: boolean;
  termine: boolean;
}

export const cleObjectif = (societeId: string, type: string) => `${societeId}|${type}`;

export function avancementDossier(
  dossier: DossierAvancement,
  objectifs: Record<string, number>
): Avancement {
  const objectif =
    objectifs[cleObjectif(dossier.societe_id, dossier.type_travail)] ??
    OBJECTIFS_DEFAUT[dossier.type_travail] ??
    0;
  const realise = Number(dossier.nb_pieces || 0) + Number(dossier.nb_recues_pdf || 0);
  const sansObjectif = objectif <= 0;
  const pourcent = sansObjectif ? 0 : Math.min(100, Math.round((realise / objectif) * 100));
  return { objectif, realise, pourcent, sansObjectif, termine: !sansObjectif && realise >= objectif };
}
