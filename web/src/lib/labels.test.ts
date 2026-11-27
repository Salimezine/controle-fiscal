import { describe, expect, it } from 'vitest';

import { ACTION_LABELS, actionLabel, actionStyle } from './labels';

describe('libellés de l’audit', () => {
  it('affiche « Objectifs modifiés » en clair', () => {
    expect(ACTION_LABELS.modification_objectifs).toBe('Objectifs modifiés');
    expect(actionLabel('modification_objectifs')).toBe('Objectifs modifiés');
  });

  it('distingue les actions objectifs par une couleur', () => {
    expect(actionStyle('modification_objectifs')).toContain('amber');
  });

  it('affiche un libellé clair pour le renouvellement automatique', () => {
    expect(actionLabel('creation_dossier_auto')).toBe('Dossier créé auto (1er janvier)');
    expect(actionStyle('creation_dossier_auto')).toContain('blue');
  });
});
