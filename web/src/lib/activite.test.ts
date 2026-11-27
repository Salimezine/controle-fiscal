import { describe, expect, it } from 'vitest';

import { formatDuree, roleCourt } from './activite';

describe('formatDuree', () => {
  it('affiche une durée lisible', () => {
    expect(formatDuree(0)).toBe('—');
    expect(formatDuree(45)).toBe('45 min');
    expect(formatDuree(60)).toBe('1 h');
    expect(formatDuree(125)).toBe('2 h 5');
    expect(formatDuree(1440)).toBe('24 h');
  });

  it('ignore les valeurs invalides', () => {
    expect(formatDuree(-10)).toBe('—');
    expect(formatDuree(NaN)).toBe('—');
  });
});

describe('roleCourt', () => {
  it('distingue expert et comptable', () => {
    expect(roleCourt('admin')).toBe('Expert');
    expect(roleCourt('user')).toBe('Comptable');
  });
});
