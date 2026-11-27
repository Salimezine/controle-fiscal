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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

function genId(): string {
  return crypto.randomUUID();
}

// base64 sûr pour les PDF (pas de dépassement de pile avec spread)
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Écriture dans le journal d'audit (traçabilité pour l'expert)
async function logAudit(
  env: Env,
  actor: any,
  action: string,
  opts: {
    entityType?: string; entityId?: string; societeId?: string; societeNom?: string;
    travailId?: string; travailTitre?: string; details?: string;
  } = {}
): Promise<void> {
  if (!actor) return;
  await env.DB.prepare(
    'INSERT INTO audit_log (id, user_id, user_name, role, action, entity_type, entity_id, societe_id, societe_nom, travail_id, travail_titre, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    genId(), actor.id, actor.full_name, actor.role, action,
    opts.entityType || null, opts.entityId || null,
    opts.societeId || null, opts.societeNom || null,
    opts.travailId || null, opts.travailTitre || null, opts.details || null
  ).run();
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
  // Les sociétés EUREX sont les CLIENTS (org_clients), pas la table societes interne.
  const societes = await eurexQuery(env,
    'SELECT id, name AS raison_sociale, matricule_fiscal, created_at FROM org_clients WHERE deleted_at IS NULL');
  for (const s of societes) {
    await env.DB.prepare('INSERT OR IGNORE INTO societes (id, raison_sociale, matricule_fiscal, created_at) VALUES (?, ?, ?, ?)')
      .bind(s.id, s.raison_sociale, s.matricule_fiscal || null, s.created_at || null).run();
  }
  // Affectation réelle : comptable -> ses clients
  const affectations = await eurexQuery(env,
    'SELECT assigned_comptable_id AS user_id, id AS societe_id FROM org_clients WHERE deleted_at IS NULL AND assigned_comptable_id IS NOT NULL');
  for (const a of affectations) {
    await env.DB.prepare('INSERT OR IGNORE INTO user_societes (user_id, societe_id) VALUES (?, ?)')
      .bind(a.user_id, a.societe_id).run();
  }

  const sql = email
    ? 'SELECT id, full_name, email, password_hash, role, role_label, is_active FROM org_users WHERE email = ? AND is_active = 1'
    : 'SELECT id, full_name, email, password_hash, role, role_label, is_active FROM org_users WHERE is_active = 1';
  const users = await eurexQuery(env, sql, email ? [email] : []);
  for (const u of users) {
    // Rôle : expert/manager -> admin, comptable -> user
    const role = u.role === 'expert' || u.role_label === 'manager' ? 'admin' : 'user';
    // rattachement : premier client (fallback) — l'affectation réelle est dans org_clients.assigned_comptable_id
    const societeId = societes[0]?.id || null;
    await env.DB.prepare(
      'INSERT INTO users (id, societe_id, full_name, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime(\'now\')) ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name, password_hash=excluded.password_hash, role=excluded.role, is_active=1'
    ).bind(u.id, societeId, u.full_name, u.email, u.password_hash, role).run();
  }
  // Miroir propre : supprimer les comptes qui n'existent plus dans EUREX.
  // Uniquement lors d'une sync complète (jamais lors du login ciblé par email).
  if (!email && users.length > 0) {
    const placeholders = users.map(() => '?').join(',');
    const ids = users.map((u: any) => u.id);
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id NOT IN (${placeholders})`).bind(...ids).run();
    await env.DB.prepare(`DELETE FROM user_societes WHERE user_id NOT IN (${placeholders})`).bind(...ids).run();
    await env.DB.prepare(`DELETE FROM users WHERE id NOT IN (${placeholders})`).bind(...ids).run();
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // Health check
    if (path === '/health') {
      return json({ status: 'ok', project: 'CONTROLE FISCAL' });
    }

    // === GUARD : toutes les routes /api/ sauf login et sync (CI) exigent un token ===
    let actor: any = null;
    if (path.startsWith('/api/') && path !== '/api/auth/login' && path !== '/api/sync/eurex') {
      const header = request.headers.get('Authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) return json({ error: 'Non authentifié' }, 401);
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE token = ? AND created_at > datetime('now','-7 days')"
      ).bind(token).first() as any;
      if (!session) return json({ error: 'Session invalide ou expirée' }, 401);
      actor = await env.DB.prepare('SELECT id, full_name, email, role, societe_id FROM users WHERE id = ?')
        .bind(session.user_id).first() as any;
      if (!actor) return json({ error: 'Compte introuvable' }, 401);
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

      // Session valable 7 jours
      const token = genId();
      await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)')
        .bind(token, user.id).run();

      return json({
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        societe_id: user.societe_id || null,
        token,
        synced: true
      });
    }

    // Déconnexion : invalide le token courant
    if (path === '/api/auth/logout' && method === 'POST') {
      const header = request.headers.get('Authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ status: 'ok' });
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

    // === TRAVAUX / DOSSIERS ===
    const travauxMatch = path.match(/^\/api\/travaux\/([^/]+)$/);
    if (travauxMatch && method === 'GET') {
      const id = travauxMatch[1];
      const travail = await env.DB.prepare(
        `SELECT t.*, a.comptable_id, a.comptable_name, a.assigned_at,
          (SELECT COUNT(*) FROM pieces_justificatives p WHERE p.travail_id = t.id) AS nb_pieces,
          (SELECT COUNT(*) FROM recues r WHERE r.travail_id = t.id) AS nb_recues
         FROM travaux t LEFT JOIN travail_attributions a ON a.travail_id = t.id
         WHERE t.id = ?`
      ).bind(id).first();
      if (!travail) return json({ error: 'Non trouvé' }, 404);
      return json(travail);
    }

    if (path === '/api/travaux' && method === 'GET') {
      const societeId = url.searchParams.get('societe_id');
      const typeTravail = url.searchParams.get('type');
      const isAdmin = actor?.role === 'admin';

      let query = `SELECT t.*, a.comptable_id, a.comptable_name, a.assigned_at,
        (SELECT COUNT(*) FROM pieces_justificatives p WHERE p.travail_id = t.id) AS nb_pieces,
        (SELECT COUNT(*) FROM recues r WHERE r.travail_id = t.id) AS nb_recues
        FROM travaux t LEFT JOIN travail_attributions a ON a.travail_id = t.id
        WHERE 1=1`;
      const binds: any[] = [];

      // Un comptable ne voit que ses dossiers (attribution ou société affectée)
      if (!isAdmin) {
        query += ' AND (a.comptable_id = ? OR t.societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = ?))';
        binds.push(actor?.id || '', actor?.id || '');
      }
      if (societeId) { query += ' AND t.societe_id = ?'; binds.push(societeId); }
      if (typeTravail) { query += ' AND t.type_travail = ?'; binds.push(typeTravail); }

      query += ' ORDER BY t.created_at DESC';
      const { results } = await env.DB.prepare(query).bind(...binds).all();
      return json(results);
    }

    if (path === '/api/travaux' && method === 'POST') {
      const body = await request.json() as any;
      const id = genId();
      const isAdmin = actor?.role === 'admin';
      const comptableId = isAdmin && body.comptable_id ? body.comptable_id : (actor?.id || null);
      const comptableName = isAdmin && body.comptable_nom ? body.comptable_nom : (actor?.full_name || null);

      await env.DB.prepare('INSERT INTO travaux (id, societe_id, type_travail, reference, titre, description) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, body.societe_id, body.type_travail, body.reference || null, body.titre, body.description || null).run();
      if (comptableId) {
        await env.DB.prepare(
          'INSERT OR REPLACE INTO travail_attributions (travail_id, comptable_id, comptable_name, assigned_by) VALUES (?, ?, ?, ?)'
        ).bind(id, comptableId, comptableName, actor?.id || null).run();
      }

      const soc = body.societe_id
        ? await env.DB.prepare('SELECT raison_sociale FROM societes WHERE id = ?').bind(body.societe_id).first() as any
        : null;
      await logAudit(env, actor, 'creation_dossier', {
        entityType: 'travail', entityId: id, societeId: body.societe_id || null,
        societeNom: soc?.raison_sociale || null, travailId: id, travailTitre: body.titre,
        details: `${body.type_travail}${body.reference ? ' - Réf. ' + body.reference : ''} - Comptable: ${comptableName || 'inconnu'}`
      });
      return json({ id, ...body, comptable_id: comptableId, comptable_name: comptableName }, 201);
    }

    // Suppression d'un dossier (expert ou comptable attribué)
    if (travauxMatch && method === 'DELETE') {
      const id = travauxMatch[1];
      const t = await env.DB.prepare('SELECT * FROM travaux WHERE id = ?').bind(id).first() as any;
      if (!t) return json({ error: 'Non trouvé' }, 404);
      const attr = await env.DB.prepare('SELECT comptable_id FROM travail_attributions WHERE travail_id = ?').bind(id).first() as any;
      if (actor?.role !== 'admin' && attr?.comptable_id !== actor?.id) {
        return json({ error: 'Accès refusé' }, 403);
      }
      await env.DB.prepare('DELETE FROM recue_pdfs WHERE travail_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM recues WHERE travail_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM pieces_justificatives WHERE travail_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM travail_attributions WHERE travail_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM travaux WHERE id = ?').bind(id).run();
      const soc = await env.DB.prepare('SELECT raison_sociale FROM societes WHERE id = ?').bind(t.societe_id).first() as any;
      await logAudit(env, actor, 'suppression_dossier', {
        entityType: 'travail', entityId: id, societeId: t.societe_id,
        societeNom: soc?.raison_sociale || null, travailId: id, travailTitre: t.titre
      });
      return json({ status: 'ok' });
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
      
      const travail = await env.DB.prepare('SELECT societe_id, type_travail, titre FROM travaux WHERE id = ?').bind(travailId).first() as any;
      if (!travail) return json({ error: 'Travail non trouvé' }, 404);
      
      const id = genId();
      
      // Lire le fichier et encoder en base64
      const base64 = toBase64(await file.arrayBuffer());
      
      await env.DB.prepare('INSERT INTO pieces_justificatives (id, travail_id, societe_id, type_travail, label, file_data, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, travailId, travail.societe_id, travail.type_travail, label, base64, file.name, file.type, file.size, actor?.id || null).run();

      const soc = await env.DB.prepare('SELECT raison_sociale FROM societes WHERE id = ?').bind(travail.societe_id).first() as any;
      await logAudit(env, actor, 'ajout_piece', {
        entityType: 'piece', entityId: id, societeId: travail.societe_id,
        societeNom: soc?.raison_sociale || null, travailId, travailTitre: travail.titre,
        details: `${label} (${file.name}, ${Math.round(file.size / 1024)} KB)`
      });

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
          'Content-Length': String(piece.file_size),
          ...CORS_HEADERS
        }
      });
    }

    const piecesListMatch = path.match(/^\/api\/travaux\/([^/]+)\/pieces$/);
    if (piecesListMatch && method === 'GET') {
      const travailId = piecesListMatch[1];
      const { results } = await env.DB.prepare('SELECT * FROM pieces_justificatives WHERE travail_id = ? ORDER BY uploaded_at DESC').bind(travailId).all();
      return json(results);
    }

    // === RECUES (RCUE) ===
    if (path === '/api/recues' && method === 'POST') {
      const body = await request.json() as any;
      const id = genId();
      const travail = body.travail_id
        ? await env.DB.prepare('SELECT societe_id, type_travail, titre FROM travaux WHERE id = ?').bind(body.travail_id).first() as any
        : null;
      const societeId = body.societe_id || travail?.societe_id || null;
      await env.DB.prepare('INSERT INTO recues (id, travail_id, societe_id, type_travail, numero_recu, montant, date_recu, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, body.travail_id, societeId, body.type_travail || travail?.type_travail || null,
          body.numero_recu, body.montant || null, body.date_recu || null, body.description || null).run();
      const soc = societeId ? await env.DB.prepare('SELECT raison_sociale FROM societes WHERE id = ?').bind(societeId).first() as any : null;
      await logAudit(env, actor, 'ajout_recu', {
        entityType: 'recue', entityId: id, societeId, societeNom: soc?.raison_sociale || null,
        travailId: body.travail_id || null, travailTitre: travail?.titre || null,
        details: `RCUE n°${body.numero_recu}${body.montant ? ' - ' + body.montant + ' TND' : ''}`
      });
      return json({ id, ...body }, 201);
    }

    // Reçu avec PDF joint (multipart)
    const recueUploadMatch = path.match(/^\/api\/travaux\/([^/]+)\/recues$/);
    if (recueUploadMatch && method === 'POST') {
      const travailId = recueUploadMatch[1];
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const numero = (formData.get('numero_recu') as string || '').trim();
      const montantRaw = formData.get('montant') as string || '';
      const montant = montantRaw ? parseFloat(montantRaw) : null;
      const dateRecu = formData.get('date_recu') as string || null;
      const description = formData.get('description') as string || null;

      if (!numero) return json({ error: 'Numéro de reçu requis' }, 400);
      const travail = await env.DB.prepare('SELECT societe_id, type_travail, titre FROM travaux WHERE id = ?').bind(travailId).first() as any;
      if (!travail) return json({ error: 'Dossier non trouvé' }, 404);

      if (file && file.size > 0) {
        if (file.type !== 'application/pdf') return json({ error: 'Seuls les PDF sont acceptés' }, 400);
        if (file.size > 700 * 1024) return json({ error: 'PDF trop volumineux (max 700KB)' }, 400);
      }

      const recueId = genId();
      await env.DB.prepare('INSERT INTO recues (id, travail_id, societe_id, type_travail, numero_recu, montant, date_recu, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(recueId, travailId, travail.societe_id, travail.type_travail, numero, montant, dateRecu, description).run();

      let hasPdf = false;
      if (file && file.size > 0) {
        await env.DB.prepare(
          'INSERT INTO recue_pdfs (id, recue_id, travail_id, societe_id, label, file_data, file_name, file_type, file_size, uploaded_by, uploaded_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          genId(), recueId, travailId, travail.societe_id, `RCUE ${numero}`,
          toBase64(await file.arrayBuffer()), file.name, file.type, file.size,
          actor?.id || null, actor?.full_name || null
        ).run();
        hasPdf = true;
      }

      const soc = await env.DB.prepare('SELECT raison_sociale FROM societes WHERE id = ?').bind(travail.societe_id).first() as any;
      await logAudit(env, actor, hasPdf ? 'ajout_recu_pdf' : 'ajout_recu', {
        entityType: 'recue', entityId: recueId, societeId: travail.societe_id,
        societeNom: soc?.raison_sociale || null, travailId, travailTitre: travail.titre,
        details: `RCUE n°${numero}${montant ? ' - ' + montant + ' TND' : ''}${hasPdf ? ' - PDF: ' + file!.name : ''}`
      });
      return json({ id: recueId, numero_recu: numero, has_pdf: hasPdf }, 201);
    }

    // Téléchargement du PDF d'un reçu
    const recuePdfMatch = path.match(/^\/api\/recues\/([^/]+)\/pdf$/);
    if (recuePdfMatch && method === 'GET') {
      const pdf = await env.DB.prepare('SELECT * FROM recue_pdfs WHERE recue_id = ?').bind(recuePdfMatch[1]).first() as any;
      if (!pdf?.file_data) return json({ error: 'PDF introuvable' }, 404);
      const binary = atob(pdf.file_data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdf.file_name}"`,
          'Content-Length': String(pdf.file_size),
          ...CORS_HEADERS
        }
      });
    }

    const recuesListMatch = path.match(/^\/api\/travaux\/([^/]+)\/recues$/);
    if (recuesListMatch && method === 'GET') {
      const travailId = recuesListMatch[1];
      const { results } = await env.DB.prepare(
        `SELECT r.*, p.id AS pdf_id, p.file_name AS pdf_name, p.file_size AS pdf_size,
          p.uploaded_by_name AS pdf_uploaded_by, p.uploaded_at AS pdf_uploaded_at
         FROM recues r LEFT JOIN recue_pdfs p ON p.recue_id = r.id
         WHERE r.travail_id = ? ORDER BY r.created_at DESC`
      ).bind(travailId).all();
      return json(results);
    }

    // === AUDIT (expert uniquement) ===
    if (path === '/api/audit' && method === 'GET') {
      if (actor?.role !== 'admin') return json({ error: 'Accès réservé à l\'expert' }, 403);
      const userId = url.searchParams.get('user_id');
      const societeId = url.searchParams.get('societe_id');
      const travailId = url.searchParams.get('travail_id');
      let query = 'SELECT * FROM audit_log WHERE 1=1';
      const binds: any[] = [];
      if (userId) { query += ' AND user_id = ?'; binds.push(userId); }
      if (societeId) { query += ' AND societe_id = ?'; binds.push(societeId); }
      if (travailId) { query += ' AND travail_id = ?'; binds.push(travailId); }
      query += ' ORDER BY created_at DESC LIMIT 200';
      const { results } = await env.DB.prepare(query).bind(...binds).all();
      return json(results);
    }

    // Nettoyage du journal (expert uniquement) — filtre obligatoire
    if (path === '/api/audit' && method === 'DELETE') {
      if (actor?.role !== 'admin') return json({ error: 'Accès réservé à l\'expert' }, 403);
      const userId = url.searchParams.get('user_id');
      const prefix = url.searchParams.get('prefix');
      if (!userId && !prefix) return json({ error: 'Filtre requis (user_id ou prefix)' }, 400);
      let query = 'DELETE FROM audit_log WHERE 1=1';
      const binds: any[] = [];
      if (userId) { query += ' AND user_id = ?'; binds.push(userId); }
      if (prefix) { query += ' AND user_id LIKE ?'; binds.push(prefix + '%'); }
      const res = await env.DB.prepare(query).bind(...binds).run();
      return json({ status: 'ok', deleted: res.meta?.changes ?? 0 });
    }

    // Liste des comptables pour l'affectation (expert)
    if (path === '/api/comptables' && method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT id, full_name, email, role FROM users WHERE is_active = 1 AND role = 'user' ORDER BY full_name"
      ).all();
      return json(results);
    }

    return json({ error: 'Route non trouvée' }, 404);
  }
}