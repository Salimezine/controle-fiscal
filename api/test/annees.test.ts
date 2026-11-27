import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { anneesDisponibles } from '../src/annees.ts';

const api = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../data/schema.sql', import.meta.url), 'utf8');

test('la liste des années contient l’année courante et celles des données', async () => {
  const env = {
    DB: {
      prepare() {
        return {
          async all() {
            return { results: [{ y: '2024' }, { y: '2026' }, { y: null }] };
          }
        };
      }
    }
  } as any;
  const annees = await anneesDisponibles(env);
  assert.ok(annees.includes(new Date().getUTCFullYear()));
  assert.ok(annees.includes(2024));
  assert.deepEqual(annees, [...annees].sort((a, b) => b - a));
});

test('le Worker expose le filtre année et le renouvellement du 1er janvier', () => {
  assert.match(api, /path === '\/api\/annees' && method === 'GET'/);
  assert.match(api, /path === '\/api\/annees\/prepare' && method === 'POST'/);
  assert.match(api, /async scheduled\(controller: ScheduledController/);
  assert.match(api, /getUTCMonth\(\) !== 0 \|\| now\.getUTCDate\(\) !== 1/);
  assert.match(wrangler, /"crons": \["0 0 1 1 \*"\]/);
});

test('les objectifs sont définis par société (12 DMI, 4 CNSS, 3 AP, 1 IS)', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS objectifs_societes/);
  assert.match(schema, /UNIQUE \(annee, societe_id, type_travail\)/);
  assert.match(schema, /WHEN 'DMI' THEN 12 WHEN 'CNSS' THEN 4 WHEN 'AP' THEN 3 WHEN 'IS' THEN 1/);
  assert.match(api, /path === '\/api\/objectifs\/societes' && method === 'GET'/);
  assert.match(api, /path === '\/api\/objectifs\/societes' && method === 'PUT'/);
});
