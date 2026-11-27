import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { heures, minutesBetween, timestampMs } from '../src/stats.ts';

const api = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('horodatages D1 interprétés en UTC', () => {
  assert.equal(timestampMs('2026-11-27 12:00:00'), Date.parse('2026-11-27T12:00:00Z'));
  assert.equal(timestampMs(''), null);
  assert.equal(timestampMs(null), null);
});

test('temps de traitement = création -> dernière activité', () => {
  assert.equal(minutesBetween('2026-11-27 12:00:00', '2026-11-27 12:45:00'), 45);
  assert.equal(minutesBetween('2026-11-27 12:00:00', '2026-11-28 12:00:00'), 1440);
  assert.equal(minutesBetween('2026-11-27 12:00:00', '2026-11-27 12:00:00'), 0);
  assert.equal(minutesBetween('2026-11-27 12:00:00', '2026-11-27 11:00:00'), 0);
  assert.equal(minutesBetween(null, '2026-11-27 12:00:00'), 0);
  assert.equal(heures(125), 2.1);
});

test('API expose l’activité annuelle par comptable', () => {
  assert.match(api, /path === '\/api\/activite' && method === 'GET'/);
  assert.match(api, /dossiers_crees: sum\(creesRows, u\.id\)/);
  assert.match(api, /realises: sum\(realisesRows, u\.id\)/);
  assert.match(api, /minutesBetween\(e\.first_at, e\.last_at\)/);
  assert.match(api, /duree_minutes/);
});
