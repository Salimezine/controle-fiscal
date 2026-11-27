// CONTROLE FISCAL - API Worker Cloudflare
// Gestion multi-sociétés avec types de travaux (DMI, AP, CNSS, IS)
// et pièces justificatives PDF

interface Env {
  DB: D1Database;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

import { anneesDisponibles, preparerAnnee } from './annees';
import { heures, minutesBetween } from './stats';

const TYPES_TRAVAUX = ['DMI', 'AP', 'CNSS', 'IS'];
const currentYear = () => Number(new Date().toISOString().slice(0, 4));

// Temps de traitement d'un dossier : création -> dernière activité tracée.
const DUREE_TRAVAIL_SQL = `CAST((julianday(COALESCE((
  SELECT MAX(at) FROM (
    SELECT p.uploaded_at AS at FROM pieces_justificatives p WHERE p.travail_id = t.id
    UNION ALL SELECT rp.uploaded_at FROM recue_pdfs rp WHERE rp.travail_id = t.id
    UNION ALL SELECT r.created_at FROM recues r WHERE r.travail_id = t.id
    UNION ALL SELECT al.created_at FROM audit_log al WHERE al.travail_id = t.id
  )
), t.created_at)) - julianday(t.created_at)) * 1440 AS INTEGER)`;

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

// Hash local des mots de passe (même algo que l'ancien snapshot EUREX).
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hex}`;
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

    // === GUARD : toutes les routes /api/ sauf login exigent un token ===
    let actor: any = null;
    if (path.startsWith('/api/') && path !== '/api/auth/login') {
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

    // === AUTH (100% local — aucune sync externe) ===
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await request.json() as any;
      const { email, password } = body;

      if (!email) return json({ error: 'Email requis' }, 400);
      if (!password) return json({ error: 'Mot de passe requis' }, 400);

      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ? AND is_active = 1'
      ).bind(email).first() as any;

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
        token
      });
    }

    // Déconnexion : invalide le token courant
    if (path === '/api/auth/logout' && method === 'POST') {
      const header = request.headers.get('Authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ status: 'ok' });
    }

    // === COMPTES (gestion locale — plus aucune dépendance EUREX) ===
    if (path === '/api/users' && method === 'GET') {
      const { results: users } = await env.DB.prepare(
        'SELECT id, full_name, email, role, societe_id, is_active, created_at FROM users ORDER BY full_name'
      ).all();
      const { results: affectations } = await env.DB.prepare('SELECT user_id, societe_id FROM user_societes').all();
      return json(users.map((u: any) => ({
        ...u,
        societe_ids: affectations.filter((a: any) => a.user_id === u.id).map((a: any) => a.societe_id)
      })));
    }

    if (path === '/api/users' && method === 'POST') {
      if (actor?.role !== 'admin') return json({ error: 'Accès réservé à l\'expert' }, 403);
      const body = await request.json() as any;
      const { full_name, email, password, role, societe_id } = body;
      if (!full_name || !email || !password) return json({ error: 'Nom, email et mot de passe requis' }, 400);
      if (!['admin', 'user'].includes(role)) return json({ error: 'Rôle invalide' }, 400);
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (exists) return json({ error: 'Cet email existe déjà' }, 409);

      const id = genId();
      await env.DB.prepare(
        'INSERT INTO users (id, societe_id, full_name, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime(\'now\'))'
      ).bind(id, societe_id || null, full_name, email, await hashPassword(password), role).run();

      const societeIds: string[] = Array.isArray(body.societe_ids) ? body.societe_ids : [];
      for (const sid of societeIds) {
        await env.DB.prepare('INSERT OR IGNORE INTO user_societes (user_id, societe_id) VALUES (?, ?)').bind(id, sid).run();
      }
      await logAudit(env, actor, 'creation_compte', {
        entityType: 'user', entityId: id, societeId: societe_id || null,
        details: `${full_name} (${email}) - ${role === 'admin' ? 'Expert' : 'Comptable'}`
      });
      return json({ id, full_name, email, role, societe_id: societe_id || null, societe_ids: societeIds }, 201);
    }

    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && (method === 'PUT' || method === 'DELETE')) {
      if (actor?.role !== 'admin') return json({ error: 'Accès réservé à l\'expert' }, 403);
      const id = userMatch[1];
      const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() as any;
      if (!target) return json({ error: 'Compte introuvable' }, 404);
      if (id === actor.id) return json({ error: 'Impossible de modifier son propre statut' }, 400);

      if (method === 'DELETE') {
        await env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(id).run();
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
        await logAudit(env, actor, 'desactivation_compte', {
          entityType: 'user', entityId: id, details: `${target.full_name} (${target.email})`
        });
        return json({ status: 'ok' });
      }

      const body = await request.json() as any;
      const fullName = body.full_name ?? target.full_name;
      const email = body.email ?? target.email;
      const role = body.role ?? target.role;
      const isActive = body.is_active === undefined ? target.is_active : (body.is_active ? 1 : 0);
      if (!['admin', 'user'].includes(role)) return json({ error: 'Rôle invalide' }, 400);
      const duplicate = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, id).first();
      if (duplicate) return json({ error: 'Cet email existe déjà' }, 409);
      if (!isActive) return json({ error: 'Utilisez DELETE pour désactiver' }, 400);

      const passwordHash = body.password ? await hashPassword(body.password) : target.password_hash;
      await env.DB.prepare(
        'UPDATE users SET full_name = ?, email = ?, role = ?, is_active = ?, password_hash = ? WHERE id = ?'
      ).bind(fullName, email, role, isActive, passwordHash, id).run();

      if (Array.isArray(body.societe_ids)) {
        await env.DB.prepare('DELETE FROM user_societes WHERE user_id = ?').bind(id).run();
        for (const sid of body.societe_ids) {
          await env.DB.prepare('INSERT OR IGNORE INTO user_societes (user_id, societe_id) VALUES (?, ?)').bind(id, sid).run();
        }
      }
      await logAudit(env, actor, 'modification_compte', {
        entityType: 'user', entityId: id, details: `${fullName} (${email})`
      });
      return json({ id, full_name: fullName, email, role, is_active: isActive });
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
          (SELECT COUNT(*) FROM recues r WHERE r.travail_id = t.id) AS nb_recues,
          ${DUREE_TRAVAIL_SQL} AS duree_minutes
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
        (SELECT COUNT(*) FROM recues r WHERE r.travail_id = t.id) AS nb_recues,
        ${DUREE_TRAVAIL_SQL} AS duree_minutes
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

    // === OBJECTIFS ANNUELS PAR TYPE (lecture: tous, écriture: expert) ===
    if (path === '/api/objectifs' && method === 'GET') {
      const raw = url.searchParams.get('annee');
      const annee = raw && /^\d{4}$/.test(raw) ? Number(raw) : currentYear();
      const year = String(annee);

      const { results: objectifsRows } = await env.DB.prepare(
        'SELECT type_travail, objectif FROM objectifs_annuels WHERE annee = ?'
      ).bind(annee).all();

      // "Réalisé" = dossiers ayant au moins une preuve PDF déposée dans l'année.
      const { results: realisesRows } = await env.DB.prepare(
        `SELECT type_travail, COUNT(DISTINCT travail_id) AS realise FROM (
           SELECT p.travail_id, p.type_travail FROM pieces_justificatives p
             WHERE strftime('%Y', p.uploaded_at) = ?
           UNION
           SELECT t.id AS travail_id, t.type_travail FROM recue_pdfs rp
             JOIN travaux t ON t.id = rp.travail_id
             WHERE strftime('%Y', rp.uploaded_at) = ?
         ) GROUP BY type_travail`
      ).bind(year, year).all();

      const { results: creesRows } = await env.DB.prepare(
        "SELECT type_travail, COUNT(*) AS total FROM travaux WHERE strftime('%Y', created_at) = ? GROUP BY type_travail"
      ).bind(year).all();

      const objectifsMap = new Map(objectifsRows.map((o: any) => [o.type_travail, Number(o.objectif)]));
      const realisesMap = new Map(realisesRows.map((r: any) => [r.type_travail, Number(r.realise)]));
      const creesMap = new Map(creesRows.map((r: any) => [r.type_travail, Number(r.total)]));

      const objectifs = TYPES_TRAVAUX.map(type => {
        const objectif = objectifsMap.get(type) ?? 0;
        const realise = realisesMap.get(type) ?? 0;
        const dossiersCrees = creesMap.get(type) ?? 0;
        return {
          annee,
          type_travail: type,
          objectif,
          realise,
          dossiers_crees: dossiersCrees,
          reste: Math.max(0, objectif - realise),
          pourcent: objectif > 0 ? Math.min(100, Math.round((realise / objectif) * 100)) : 0
        };
      });
      return json({ annee, objectifs });
    }

    if (path === '/api/objectifs' && method === 'PUT') {
      if (actor?.role !== 'admin') return json({ error: 'Accès réservé à l\'expert' }, 403);
      const body = await request.json() as any;
      const annee = Number(body.annee) || currentYear();
      if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
        return json({ error: 'Année invalide' }, 400);
      }
      const values = body.objectifs;
      if (!Array.isArray(values) || values.length === 0) {
        return json({ error: 'Aucun objectif fourni' }, 400);
      }
      const changes: string[] = [];
      for (const item of values) {
        const type = String(item?.type_travail || '').toUpperCase();
        const objectif = Number(item?.objectif);
        if (!TYPES_TRAVAUX.includes(type)) return json({ error: `Type invalide: ${type}` }, 400);
        if (!Number.isInteger(objectif) || objectif < 0 || objectif > 9999) {
          return json({ error: `Objectif invalide pour ${type}` }, 400);
        }
        await env.DB.prepare(
          `INSERT INTO objectifs_annuels (id, annee, type_travail, objectif, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(annee, type_travail) DO UPDATE SET objectif = excluded.objectif`
        ).bind(genId(), annee, type, objectif).run();
        changes.push(`${type}: ${objectif}`);
      }
      await logAudit(env, actor, 'modification_objectifs', {
        entityType: 'objectif', entityId: String(annee),
        details: `${annee} — ${changes.join(', ')}`
      });
      return json({ annee, status: 'ok' });
    }

    // === ACTIVITÉ PAR COMPTABLE (année courante ou choisie) ===
    // Expert : voit tout le monde. Comptable : voit uniquement sa propre ligne.
    if (path === '/api/activite' && method === 'GET') {
      const raw = url.searchParams.get('annee');
      const annee = raw && /^\d{4}$/.test(raw) ? Number(raw) : currentYear();
      const year = String(annee);
      const isAdmin = actor?.role === 'admin';

      const { results: users } = await env.DB.prepare(
        `SELECT id, full_name, role FROM users WHERE is_active = 1
         ${isAdmin ? '' : 'AND id = ?'} ORDER BY role DESC, full_name`
      ).bind(...(isAdmin ? [] : [actor?.id || ''])).all();

      const { results: creesRows } = await env.DB.prepare(
        `SELECT a.comptable_id AS user_id, t.type_travail, COUNT(*) AS n
         FROM travaux t JOIN travail_attributions a ON a.travail_id = t.id
         WHERE strftime('%Y', t.created_at) = ?
         GROUP BY a.comptable_id, t.type_travail`
      ).bind(year).all();

      const { results: realisesRows } = await env.DB.prepare(
        `SELECT user_id, type_travail, COUNT(DISTINCT travail_id) AS n FROM (
           SELECT a.comptable_id AS user_id, p.travail_id, p.type_travail
           FROM pieces_justificatives p
           JOIN travail_attributions a ON a.travail_id = p.travail_id
           WHERE strftime('%Y', p.uploaded_at) = ?
           UNION
           SELECT a.comptable_id, rp.travail_id, t.type_travail
           FROM recue_pdfs rp
           JOIN travaux t ON t.id = rp.travail_id
           JOIN travail_attributions a ON a.travail_id = rp.travail_id
           WHERE strftime('%Y', rp.uploaded_at) = ?
         ) GROUP BY user_id, type_travail`
      ).bind(year, year).all();

      const { results: evenements } = await env.DB.prepare(
        `SELECT user_id, travail_id, MIN(at) AS first_at, MAX(at) AS last_at FROM (
           SELECT a.comptable_id AS user_id, t.id AS travail_id, t.created_at AS at
           FROM travaux t JOIN travail_attributions a ON a.travail_id = t.id
           WHERE strftime('%Y', t.created_at) = ?
           UNION ALL
           SELECT a.comptable_id, p.travail_id, p.uploaded_at
           FROM pieces_justificatives p
           JOIN travail_attributions a ON a.travail_id = p.travail_id
           WHERE strftime('%Y', p.uploaded_at) = ?
           UNION ALL
           SELECT a.comptable_id, rp.travail_id, rp.uploaded_at
           FROM recue_pdfs rp
           JOIN travail_attributions a ON a.travail_id = rp.travail_id
           WHERE strftime('%Y', rp.uploaded_at) = ?
           UNION ALL
           SELECT al.user_id, al.travail_id, al.created_at
           FROM audit_log al
           JOIN travail_attributions a
             ON a.travail_id = al.travail_id AND a.comptable_id = al.user_id
           WHERE al.travail_id IS NOT NULL AND strftime('%Y', al.created_at) = ?
         ) GROUP BY user_id, travail_id`
      ).bind(year, year, year, year).all();

      const minutesParUser = new Map<string, number>();
      for (const e of evenements) {
        const minutes = minutesBetween(e.first_at, e.last_at);
        if (minutes > 0) minutesParUser.set(e.user_id, (minutesParUser.get(e.user_id) || 0) + minutes);
      }

      const count = (rows: any[], user: string, type: string) =>
        Number(rows.find(r => r.user_id === user && r.type_travail === type)?.n || 0);
      const sum = (rows: any[], user: string) =>
        rows.filter(r => r.user_id === user).reduce((total, r) => total + Number(r.n || 0), 0);

      const comptables = users.map((u: any) => {
        const parType: Record<string, { crees: number; realises: number }> = {};
        for (const type of TYPES_TRAVAUX) {
          parType[type] = {
            crees: count(creesRows, u.id, type),
            realises: count(realisesRows, u.id, type)
          };
        }
        const minutes = minutesParUser.get(u.id) || 0;
        return {
          id: u.id,
          full_name: u.full_name,
          role: u.role,
          dossiers_crees: sum(creesRows, u.id),
          realises: sum(realisesRows, u.id),
          par_type: parType,
          minutes,
          heures: heures(minutes)
        };
      });

      const totalMinutes = comptables.reduce((total, c) => total + c.minutes, 0);
      const totalCrees = comptables.reduce((total, c) => total + c.dossiers_crees, 0);
      const totalRealises = comptables.reduce((total, c) => total + c.realises, 0);

      return json({
        annee,
        comptables,
        total: { dossiers_crees: totalCrees, realises: totalRealises, minutes: totalMinutes, heures: heures(totalMinutes) }
      });
    }

    // === OBJECTIFS PAR SOCIÉTÉ / DOSSIER ===
    // 12 DMI (1/mois), 4 CNSS (1/trimestre), 3 AP, 1 IS pour chaque société.
    // « Réalisé » = nombre de PDF déposés dans l'année (pas seulement le nb de dossiers).
    if (path === '/api/objectifs/societes' && method === 'GET') {
      const raw = url.searchParams.get('annee');
      const annee = raw && /^\d{4}$/.test(raw) ? Number(raw) : currentYear();
      const year = String(annee);
      const { results } = await env.DB.prepare(
        `SELECT os.societe_id, os.type_travail, os.objectif,
           (SELECT COUNT(*) FROM travaux t
             WHERE t.societe_id = os.societe_id AND t.type_travail = os.type_travail
               AND strftime('%Y', t.created_at) = ?) AS dossiers_crees,
           (SELECT COUNT(*) FROM pieces_justificatives p
             WHERE p.societe_id = os.societe_id AND p.type_travail = os.type_travail
               AND strftime('%Y', p.uploaded_at) = ?)
           + (SELECT COUNT(*) FROM recue_pdfs rp
              JOIN travaux t2 ON t2.id = rp.travail_id
              WHERE t2.societe_id = os.societe_id AND t2.type_travail = os.type_travail
                AND strftime('%Y', rp.uploaded_at) = ?) AS realise
         FROM objectifs_societes os
         WHERE os.annee = ?
         ORDER BY os.societe_id, os.type_travail`
      ).bind(year, year, year, annee).all();

      const total = (results || []).reduce((acc: any, r: any) => {
        acc.objectif += Number(r.objectif || 0);
        acc.realise += Number(r.realise || 0);
        acc.dossiers_crees += Number(r.dossiers_crees || 0);
        return acc;
      }, { objectif: 0, realise: 0, dossiers_crees: 0 });
      return json({ annee, objectifs: results || [], total });
    }

    if (path === '/api/objectifs/societes' && method === 'PUT') {
      if (actor?.role !== 'admin') return json({ error: 'Accès réservé à l\'expert' }, 403);
      const body = await request.json() as any;
      const annee = Number(body?.annee);
      const societeId = String(body?.societe_id || '');
      if (!Number.isInteger(annee) || annee < 2000 || annee > 2100 || !societeId) {
        return json({ error: 'Année ou société invalide' }, 400);
      }
      const values = body?.objectifs;
      if (!Array.isArray(values) || values.length === 0) {
        return json({ error: 'Aucun objectif fourni' }, 400);
      }
      const soc = await env.DB.prepare('SELECT raison_sociale FROM societes WHERE id = ?').bind(societeId).first() as any;
      if (!soc) return json({ error: 'Société non trouvée' }, 404);

      const changes: string[] = [];
      for (const item of values) {
        const type = String(item?.type_travail || '').toUpperCase();
        const objectif = Number(item?.objectif);
        if (!TYPES_TRAVAUX.includes(type) || !Number.isInteger(objectif) || objectif < 0 || objectif > 9999) {
          return json({ error: `Objectif invalide pour ${type}` }, 400);
        }
        await env.DB.prepare(
          `INSERT INTO objectifs_societes (id, annee, societe_id, type_travail, objectif)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(annee, societe_id, type_travail) DO UPDATE SET objectif = excluded.objectif`
        ).bind(`obj-soc-${annee}-${societeId}-${type}`, annee, societeId, type, objectif).run();
        changes.push(`${type}: ${objectif}`);
      }
      await logAudit(env, actor, 'modification_objectifs', {
        entityType: 'societe', entityId: societeId,
        societeId, societeNom: soc.raison_sociale,
        details: `Objectifs ${annee} · ${soc.raison_sociale} · ${changes.join(', ')}`
      });
      return json({ annee, societe_id: societeId, status: 'ok' });
    }

    // === ANNÉES (liste pour le filtre de l'UI) ===
    if (path === '/api/annees' && method === 'GET') {
      return json({ annees: await anneesDisponibles(env) });
    }

    // Renouvellement manuel (expert) — utilisé aussi par le cron du 1er janvier.
    if (path === '/api/annees/prepare' && method === 'POST') {
      if (actor?.role !== 'admin') return json({ error: 'Accès réservé à l\'expert' }, 403);
      const body = await request.json() as any;
      const annee = Number(body?.annee);
      const depuis = Number(body?.depuis ?? (annee - 1));
      if (!Number.isInteger(annee) || !Number.isInteger(depuis) ||
          annee < 2000 || annee > 2100 || depuis < 2000 || annee <= depuis) {
        return json({ error: 'Années invalides' }, 400);
      }
      return json({ annee, depuis, ...await preparerAnnee(env, annee, depuis) });
    }

    return json({ error: 'Route non trouvée' }, 404);
  },

  // 1er janvier 00:00 UTC : on prépare l'année nouvelle depuis l'année écoulée.
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = new Date(controller.scheduledTime);
    if (now.getUTCMonth() !== 0 || now.getUTCDate() !== 1) return;
    const annee = now.getUTCFullYear();
    ctx.waitUntil(preparerAnnee(env, annee, annee - 1));
  }
}