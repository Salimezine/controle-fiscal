import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../../data/schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('le schéma contient la table des objectifs annuels', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS objectifs_annuels/);
  assert.match(schema, /UNIQUE \(annee, type_travail\)/);
});

test('l’objectif DMI par défaut est 12 par an', () => {
  assert.match(schema, /'DMI', 12/);
});

test('l’API lit et écrit les objectifs, avec audit expert', () => {
  assert.match(api, /path === '\/api\/objectifs' && method === 'GET'/);
  assert.match(api, /path === '\/api\/objectifs' && method === 'PUT'/);
  assert.match(api, /'modification_objectifs'/);
  assert.match(api, /actor\?\.role !== 'admin'/);
});
