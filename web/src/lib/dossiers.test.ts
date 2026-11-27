import { describe, expect, it } from 'vitest';

import { filterDossiers, societesSansCNSS, type DossierRow } from './dossiers';

const societes = [
  { id: 'soc_1', raison_sociale: 'ANIMAL CITY CARE' },
  { id: 'soc_2', raison_sociale: 'SOGEPLAN' }
];

const dossiers: DossierRow[] = [
  { id: 'a', type_travail: 'DMI', titre: 'Dépôt 2026', societe_id: 'soc_1', comptable_name: 'Salim', reference: 'REF-1', created_at: '2026-01-01' },
  { id: 'b', type_travail: 'AP', titre: 'Achats mars', societe_id: 'soc_2', comptable_name: 'Samar', reference: 'REF-2', created_at: '2026-03-01' },
  { id: 'c', type_travail: 'DMI', titre: 'Dépôt avril', societe_id: 'soc_2', comptable_name: 'Salim', reference: 'REF-3', created_at: '2026-04-01' }
];

describe('filterDossiers (Accueil)', () => {
  it('affiche tous les dossiers, du plus récent au plus ancien', () => {
    expect(filterDossiers(dossiers, societes, '', '').map(d => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('filtre par type puis par société, comptable ou référence', () => {
    expect(filterDossiers(dossiers, societes, '', 'DMI').map(d => d.id)).toEqual(['c', 'a']);
    expect(filterDossiers(dossiers, societes, 'animal', '').map(d => d.id)).toEqual(['a']);
    expect(filterDossiers(dossiers, societes, 'samar', '').map(d => d.id)).toEqual(['b']);
    expect(filterDossiers(dossiers, societes, 'REF-3', '').map(d => d.id)).toEqual(['c']);
  });
});

describe('societesSansCNSS', () => {
  it('signale les sociétés avec DMI/IS/AP mais sans CNSS', () => {
    expect(societesSansCNSS(dossiers)).toEqual([
      { societe_id: 'soc_1', presents: ['DMI'] },
      { societe_id: 'soc_2', presents: ['DMI', 'AP'] }
    ]);
  });

  it('ignore une société qui a déjà un dossier CNSS', () => {
    const avecCnss: DossierRow[] = [
      ...dossiers,
      { id: 'd', type_travail: 'CNSS', titre: 'CNSS', societe_id: 'soc_1', created_at: '2026-05-01' }
    ];
    expect(societesSansCNSS(avecCnss).map(s => s.societe_id)).toEqual(['soc_2']);
  });
});
