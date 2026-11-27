// CONTROLE FISCAL - API Worker Cloudflare
// Gestion multi-sociétés avec types de travaux (DMI, AP, CNSS, IS)
// et pièces justificatives PDF

interface Env {
  DB: D1Database;
  // EUREX est sur un AUTRE compte Cloudflare : pas de binding D1 possible.
  // On passe par l'API HTTP D1 avec un token dédié (vars wrangler).
  EUREX_ACCOUNT_ID?: string;
  EUREX_DB_ID?: string;
  EUREX_D1_TOKEN?: string;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function genId(): string {
  return crypto.randomUUID();
}

async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash || !passwordHash.includes(':')) return false;
  const [salt, expected] = passwordHash.split(':');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + password));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === expected;
}

// Requête sur la D1 EUREX via l'API Cloudflare (cross-account).
async function eurexQuery(env: Env, sql: string, params: any[] = []): Promise<any[]> {
  if (!env.EUREX_D1_TOKEN || !env.EUREX_ACCOUNT_ID || !env.EUREX_DB_ID) return [];
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.EUREX_ACCOUNT_ID}/d1/database/${env.EUREX_DB_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EUREX_D1_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params })
    }
  );
  const data = await res.json() as any;
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'Erreur API EUREX');
  return data.result?.[0]?.results || [];
}

async function syncEurex(env: Env, email?: string): Promise<{ users: number; societes: number }> {
  const societes = await eurexQuery(env, 'SELECT id, raison_sociale, matricule_fiscal, created_at FROM societes');
  for (const s of societes) {
    await env.DB.prepare('INSERT OR IGNORE INTO societes (id, raison_sociale, matricule_fiscal, created_at) VALUES (?, ?, ?, ?)')
      .bind(s.id, s.raison_sociale, s.matricule_fiscal || null, s.created_at || null).run();
  }
  const sql = email
    ? 'SELECT id, full_name, email, password_hash, role, role_label, is_active FROM org_users WHERE email = ? AND is_active = 1'
    : 'SELECT id, full_name, email, password_hash, role, role_label, is_active FROM org_users WHERE is_active = 1';
  const users = await eurexQuery(env, sql, email ? [email] : []);
  for (const u of users) {
    // Rôle : expert/manager -> admin, comptable -> user
    const role = u.role === 'expert' || u.role_label === 'manager' ? 'admin' : 'user';
    // rattachement à la société EUREX (une seule société pour l'instant)
    const societeId = societes[0]?.id || null;
    await env.DB.prepare(
      'INSERT INTO users (id, societe_id, full_name, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime(\'now\')) ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name, password_hash=excluded.password_hash, role=excluded.role, is_active=1'
    ).bind(u.id, societeId, u.full_name, u.email, u.password_hash, role).run();
  }
  return { users: users.length, societes: societes.length };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Health check
    if (path === '/health') {
      return json({ status: 'ok', project: 'CONTROLE FISCAL' });
    }

    // === AUTH / SYNC ===
    // Sync manuelle : POST /api/sync/eurex
    if (path === '/api/sync/eurex' && method === 'POST') {
      const result = await syncEurex(env);
      return json({ status: 'ok', ...result });
    }

    // Login avec synchronisation depuis EUREX (API HTTP cross-account)
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await request.json() as any;
      const { email, password } = body;

      if (!email) return json({ error: 'Email requis' }, 400);
      if (!password) return json({ error: 'Mot de passe requis' }, 400);

      let user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ? AND is_active = 1'
      ).bind(email).first() as any;

      if (!user && env.EUREX_D1_TOKEN) {
        await syncEurex(env, email);
        user = await env.DB.prepare(
          'SELECT * FROM users WHERE email = ? AND is_active = 1'
        ).bind(email).first() as any;
      }

      if (!user) return json({ error: 'Identifiants incorrects' }, 401);
      if (!await verifyPassword(user.password_hash, password)) {
        return json({ error: 'Identifiants incorrects' }, 401);
      }

      return json({
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        societe_id: user.societe_id || null,
        synced: true
      });
    }

    // === USERS (debug / verification) ===
    if (path === '/api/users' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, full_name, email, role, societe_id, is_active FROM users ORDER BY full_name').all();
      return json(results);
    }

    // === SOCIETES ===
    if (path === '/api/societes' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM societes ORDER BY raison_sociale').all();
      return json(results);
    }

    if (path === '/api/societes' && method === 'POST') {
      const body = await request.json() as any;
      const id = genId();
      await env.DB.prepare('INSERT INTO societes (id, raison_sociale, matricule_fiscal) VALUES (?, ?, ?)')
        .bind(id, body.raison_sociale, body.matricule_fiscal || null).run();
      return json({ id, ...body }, 201);
    }

    // === TYPES DE TRAVAUX ===
    if (path === '/api/types-travaux' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM types_travaux ORDER BY code').all();
      return json(results);
    }

    // === TRAVAUX ===
    const travauxMatch = path.match(/^\/api\/travaux\/([^/]+)$/);
    if (travauxMatch && method === 'GET') {
      const id = travauxMatch[1];
      const travail = await env.DB.prepare('SELECT * FROM travaux WHERE id = ?').bind(id).first();
      if (!travail) return json({ error: 'Non trouvé' }, 404);
      return json(travail);
    }

    if (path === '/api/travaux' && method === 'GET') {
      const societeId = url.searchParams.get('societe_id');
      const typeTravail = url.searchParams.get('type');
      
      let query = 'SELECT * FROM travaux WHERE 1=1';
      const binds: any[] = [];
      
      if (societeId) { query += ' AND societe_id = ?'; binds.push(societeId); }
      if (typeTravail) { query += ' AND type_travail = ?'; binds.push(typeTravail); }
      
      query += ' ORDER BY created_at DESC';
      const { results } = await env.DB.prepare(query).bind(...binds).all();
      return json(results);
    }

    if (path === '/api/travaux' && method === 'POST') {
      const body = await request.json() as any;
      const id = genId();
      await env.DB.prepare('INSERT INTO travaux (id, societe_id, type_travail, reference, titre, description) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, body.societe_id, body.type_travail, body.reference || null, body.titre, body.description || null).run();
      return json({ id, ...body }, 201);
    }

    // === PIECES JUSTIFICATIVES PDF ===
    const pieceUploadMatch = path.match(/^\/api\/travaux\/([^/]+)\/pieces$/);
    if (pieceUploadMatch && method === 'POST') {
      const travailId = pieceUploadMatch[1];
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const label = formData.get('label') as string || file.name;
      
      if (!file) return json({ error: 'Fichier manquant' }, 400);
      if (file.type !== 'application/pdf') return json({ error: 'Seuls les PDF sont acceptés' }, 400);
      
      // Limite de taille : 1MB (D1 row limit ~1MB, base64 augmente de ~33%)
      if (file.size > 700 * 1024) {
        return json({ error: 'Fichier trop volumineux (max 700KB)' }, 400);
      }
      
      const travail = await env.DB.prepare('SELECT societe_id, type_travail FROM travaux WHERE id = ?').bind(travailId).first() as any;
      if (!travail) return json({ error: 'Travail non trouvé' }, 404);
      
      const id = genId();
      
      // Lire le fichier et encoder en base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      await env.DB.prepare('INSERT INTO pieces_justificatives (id, travail_id, societe_id, type_travail, label, file_data, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, travailId, travail.societe_id, travail.type_travail, label, base64, file.name, file.type, file.size, 'user').run();
      
      return json({ id, label, file_name: file.name, file_size: file.size }, 201);
    }

    const pieceDownloadMatch = path.match(/^\/api\/pieces\/([^/]+)\/download$/);
    if (pieceDownloadMatch && method === 'GET') {
      const id = pieceDownloadMatch[1];
      const piece = await env.DB.prepare('SELECT * FROM pieces_justificatives WHERE id = ?').bind(id).first() as any;
      if (!piece) return json({ error: 'Pièce non trouvée' }, 404);
      if (!piece.file_data) return json({ error: 'Fichier non trouvé' }, 404);
      
      // Décoder le base64 en binaire
      const binaryString = atob(piece.file_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${piece.file_name}"`,
          'Content-Length': String(piece.file_size)
        }
      });
    }

    const piecesListMatch = path.match(/^\/api\/travaux\/([^/]+)\/pieces$/);
    if (piecesListMatch && method === 'GET') {
      const travailId = piecesListMatch[1];
      const { results } = await env.DB.prepare('SELECT * FROM pieces_justificatives WHERE travail_id = ? ORDER BY uploaded_at DESC').bind(travailId).all();
      return json(results);
    }

    // === RECUES ===
    if (path === '/api/recues' && method === 'POST') {
      const body = await request.json() as any;
      const id = genId();
      await env.DB.prepare('INSERT INTO recues (id, travail_id, societe_id, type_travail, numero_recu, montant, date_recu, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, body.travail_id, body.societe_id, body.type_travail, body.numero_recu, body.montant || null, body.date_recu || null, body.description || null).run();
      return json({ id, ...body }, 201);
    }

    const recuesListMatch = path.match(/^\/api\/travaux\/([^/]+)\/recues$/);
    if (recuesListMatch && method === 'GET') {
      const travailId = recuesListMatch[1];
      const { results } = await env.DB.prepare('SELECT * FROM recues WHERE travail_id = ? ORDER BY created_at DESC').bind(travailId).all();
      return json(results);
    }

    return json({ error: 'Route non trouvée' }, 404);
  }
}