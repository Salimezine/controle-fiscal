import { describe, expect, it } from 'vitest';

import { avancementDossier, cleObjectif, OBJECTIFS_DEFAUT } from './avancement';

describe('avancement d’un dossier', () => {
  it('compte les pièces PDF et les PDF de reçus', () => {
    const a = avancementDossier(
      { societe_id: 's1', type_travail: 'DMI', nb_pieces: 2, nb_recues_pdf: 1 },
      {}
    );
    expect(a.realise).toBe(3);
    expect(a.objectif).toBe(12);
    expect(a.pourcent).toBe(25);
    expect(a.termine).toBe(false);
  });

  it('respecte l’objectif 0 d’une société (CNSS déjà fourni)', () => {
    const objectifs = { [cleObjectif('s1', 'CNSS')]: 0 };
    const a = avancementDossier({ societe_id: 's1', type_travail: 'CNSS', nb_pieces: 4 }, objectifs);
    expect(a.sansObjectif).toBe(true);
    expect(a.pourcent).toBe(0);
  });

  it('utilise les objectifs par société quand ils sont fournis', () => {
    const objectifs = { [cleObjectif('s2', 'AP')]: 5 };
    const a = avancementDossier({ societe_id: 's2', type_travail: 'AP', nb_pieces: 5 }, objectifs);
    expect(a.objectif).toBe(5);
    expect(a.pourcent).toBe(100);
    expect(a.termine).toBe(true);
  });

  it('garde les objectifs par défaut 12 DMI / 4 CNSS / 3 AP / 1 IS', () => {
    expect(OBJECTIFS_DEFAUT).toEqual({ DMI: 12, AP: 3, CNSS: 4, IS: 1 });
  });
});
