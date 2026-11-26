// CONTROLE FISCAL - Serveur local (SQLite) - CommonJS
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 8788;
const DB_PATH = path.join(__dirname, 'data', 'controle-fiscal.db');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
console.log('DB:', DB_PATH);

const schemaPath = path.join(__dirname, '..', 'data', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  console.log('Schema initialized');
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function genId() {
  return crypto.randomUUID();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathName = url.pathname;
  const method = req.method;

  try {
    if (pathName === '/health') {
      return json(res, { status: 'ok', project: 'CONTROLE FISCAL' });
    }

    if (pathName === '/api/societes' && method === 'GET') {
      const results = db.prepare('SELECT * FROM societes ORDER BY raison_sociale').all();
      return json(res, results);
    }

    if (pathName === '/api/societes' && method === 'POST') {
      const body = await parseBody(req);
      const id = genId();
      db.prepare('INSERT INTO societes (id, raison_sociale, matricule_fiscal) VALUES (?, ?, ?)')
        .run(id, body.raison_sociale, body.matricule_fiscal || null);
      return json(res, { id, ...body }, 201);
    }

    if (pathName === '/api/types-travaux' && method === 'GET') {
      const results = db.prepare('SELECT * FROM types_travaux ORDER BY code').all();
      return json(res, results);
    }

    const travauxMatch = pathName.match(/^\/api\/travaux\/([^/]+)$/);
    if (travauxMatch && method === 'GET') {
      const id = travauxMatch[1];
      const travail = db.prepare('SELECT * FROM travaux WHERE id = ?').get(id);
      if (!travail) return json(res, { error: 'Non trouvé' }, 404);
      return json(res, travail);
    }

    if (pathName === '/api/travaux' && method === 'GET') {
      const societeId = url.searchParams.get('societe_id');
      const typeTravail = url.searchParams.get('type');
      let query = 'SELECT * FROM travaux WHERE 1=1';
      const binds = [];
      if (societeId) { query += ' AND societe_id = ?'; binds.push(societeId); }
      if (typeTravail) { query += ' AND type_travail = ?'; binds.push(typeTravail); }
      query += ' ORDER BY created_at DESC';
      const results = db.prepare(query).all(...binds);
      return json(res, results);
    }

    if (pathName === '/api/travaux' && method === 'POST') {
      const body = await parseBody(req);
      const id = genId();
      db.prepare('INSERT INTO travaux (id, societe_id, type_travail, reference, titre, description) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, body.societe_id, body.type_travail, body.reference || null, body.titre, body.description || null);
      return json(res, { id, ...body }, 201);
    }

    return json(res, { error: 'Route non trouvée' }, 404);
  } catch (err) {
    console.error(err);
    return json(res, { error: err.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`CONTROLE FISCAL API -> http://127.0.0.1:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});