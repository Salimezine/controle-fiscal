// CONTROLE FISCAL - Serveur local (SQLite)
// Lancez avec: node server.mjs
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8788;
const DB_PATH = path.join(__dirname, 'data', 'controle-fiscal.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Open database
const db = new DatabaseSync(DB_PATH);
console.log('DB:', DB_PATH);

// Initialize schema if needed
const schemaPath = path.join(__dirname, '..', 'data', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  console.log('Schema initialized');
}

// Helper: JSON response
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

// Helper: generate ID
function genId() {
  return crypto.randomUUID();
}

// Parse body
async function parseBody(req) {
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

// Parse multipart form data (simple)
async function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const boundary = req.headers['content-type']?.split('boundary=')[1];
      if (!boundary) { resolve({ fields: {}, files: {} }); return; }
      
      const parts = buffer.toString('binary').split('--' + boundary);
      const fields = {};
      const files = {};
      
      for (const part of parts) {
        if (part.includes('Content-Disposition')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          const filenameMatch = part.match(/filename="([^"]+)"/);
          const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
          
          if (nameMatch) {
            const name = nameMatch[1];
            const content = part.split('\r\n\r\n')[1]?.replace(/\r\n--$/, '') || '';
            
            if (filenameMatch) {
              files[name] = {
                filename: filenameMatch[1],
                contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
                data: Buffer.from(content, 'binary')
              };
            } else {
              fields[name] = content.trim();
            }
          }
        }
      }
      resolve({ fields, files });
    });
    req.on('error', reject);
  });
}

// Router
const server = http.createServer(async (req, res) => {
  // CORS preflight
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
  const path = url.pathname;
  const method = req.method;

  try {
    // Health check
    if (path === '/health') {
      return json(res, { status: 'ok', project: 'CONTROLE FISCAL' });
    }

    // === SOCIETES ===
    if (path === '/api/societes' && method === 'GET') {
      const results = db.prepare('SELECT * FROM societes ORDER BY raison_sociale').all();
      return json(res, results);
    }

    if (path === '/api/societes' && method === 'POST') {
      const body = await parseBody(req);
      const id = genId();
      db.prepare('INSERT INTO societes (id, raison_sociale, matricule_fiscal) VALUES (?, ?, ?)')
        .run(id, body.raison_sociale, body.matricule_fiscal || null);
      return json(res, { id, ...body }, 201);
    }

    // === TYPES DE TRAVAUX ===
    if (path === '/api/types-travaux' && method === 'GET') {
      const results = db.prepare('SELECT * FROM types_travaux ORDER BY code').all();
      return json(res, results);
    }

    // === TRAVAUX ===
    const travauxMatch = path.match(/^\/api\/travaux\/([^/]+)$/);
    if (travauxMatch && method === 'GET') {
      const id = travauxMatch[1];
      const travail = db.prepare('SELECT * FROM travaux WHERE id = ?').get(id);
      if (!travail) return json(res, { error: 'Non trouvé' }, 404);
      return json(res, travail);
    }

    if (path === '/api/travaux' && method === 'GET') {
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

    if (path === '/api/travaux' && method === 'POST') {
      const body = await parseBody(req);
      const id = genId();
      db.prepare('INSERT INTO travaux (id, societe_id, type_travail, reference, titre, description) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, body.societe_id, body.type_travail, body.reference || null, body.titre, body.description || null);
      return json(res, { id, ...body }, 201);
    }

    // === PIECES JUSTIFICATIVES PDF ===
    const pieceUploadMatch = path.match(/^\/api\/travaux\/([^/]+)\/pieces$/);
    if (pieceUploadMatch && method === 'POST') {
      const travailId = pieceUploadMatch[1];
      const { fields, files } = await parseFormData(req);
      const file = files.file;
      const label = fields.label || (file ? file.filename : 'Sans nom');
      
      if (!file) return json(res, { error: 'Fichier manquant' }, 400);
      if (file.contentType !== 'application/pdf') return json(res, { error: 'Seuls les PDF sont acceptés' }, 400);
      
      if (file.data.length > 700 * 1024) {
        return json(res, { error: 'Fichier trop volumineux (max 700KB)' }, 400);
      }
      
      const travail = db.prepare('SELECT societe_id, type_travail FROM travaux WHERE id = ?').get(travailId);
      if (!travail) return json(res, { error: 'Travail non trouvé' }, 404);
      
      const id = genId();
      const base64 = file.data.toString('base64');
      
      db.prepare('INSERT INTO pieces_justificatives (id, travail_id, societe_id, type_travail, label, file_data, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, travailId, travail.societe_id, travail.type_travail, label, base64, file.filename, file.contentType, file.data.length, 'user');
      
      return json(res, { id, label, file_name: file.filename, file_size: file.data.length }, 201);
    }

    const pieceDownloadMatch = path.match(/^\/api\/pieces\/([^/]+)\/download$/);
    if (pieceDownloadMatch && method === 'GET') {
      const id = pieceDownloadMatch[1];
      const piece = db.prepare('SELECT * FROM pieces_justificatives WHERE id = ?').get(id);
      if (!piece) return json(res, { error: 'Pièce non trouvée' }, 404);
      if (!piece.file_data) return json(res, { error: 'Fichier non trouvé' }, 404);
      
      const buffer = Buffer.from(piece.file_data, 'base64');
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${piece.file_name}"`,
        'Content-Length': String(buffer.length),
        'Access-Control-Allow-Origin': '*'
      });
      res.end(buffer);
      return;
    }

    const piecesListMatch = path.match(/^\/api\/travaux\/([^/]+)\/pieces$/);
    if (piecesListMatch && method === 'GET') {
      const travailId = piecesListMatch[1];
      const results = db.prepare('SELECT * FROM pieces_justificatives WHERE travail_id = ? ORDER BY uploaded_at DESC').all(travailId);
      return json(res, results);
    }

    // === RECUES ===
    if (path === '/api/recues' && method === 'POST') {
      const body = await parseBody(req);
      const id = genId();
      db.prepare('INSERT INTO recues (id, travail_id, societe_id, type_travail, numero_recu, montant, date_recu, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, body.travail_id, body.societe_id, body.type_travail, body.numero_recu, body.montant || null, body.date_recu || null, body.description || null);
      return json(res, { id, ...body }, 201);
    }

    const recuesListMatch = path.match(/^\/api\/travaux\/([^/]+)\/recues$/);
    if (recuesListMatch && method === 'GET') {
      const travailId = recuesListMatch[1];
      const results = db.prepare('SELECT * FROM recues WHERE travail_id = ? ORDER BY created_at DESC').all(travailId);
      return json(res, results);
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
});<|end|><|start|>write to=assistant<|channel|>analysis<|message|>Created file successfully: C:/Users/safa.dhaoui/Documents/Default Project/controle-fiscal/api/local/server.mjs