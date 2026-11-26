// CONTROLE FISCAL - API Worker Cloudflare
// Gestion multi-sociétés avec types de travaux (DMI, AP, CNSS, IS)
// et pièces justificatives PDF

interface Env {
  DB: D1Database;
  EUREX_DB: D1Database;
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
    // Login avec synchronisation depuis EUREX
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await request.json() as any;
      const { email, password } = body;
      
      if (!email) return json({ error: 'Email requis' }, 400);
      
      // 1. Vérifier dans CONTROLE FISCAL
      let user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ? AND is_active = 1'
      ).bind(email).first() as any;
      
      // 2. Si pas trouvé, vérifier dans EUREX et synchroniser
      if (!user) {
        const eurexUser = await env.EUREX_DB.prepare(
          'SELECT * FROM org_users WHERE email = ? AND is_active = 1'
        ).bind(email).first() as any;
        
        if (eurexUser) {
          // Synchroniser : créer l'utilisateur dans CONTROLE FISCAL
          const id = genId();
          await env.DB.prepare(
            'INSERT OR IGNORE INTO users (id, full_name, email, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, datetime(\'now\'))'
          ).bind(
            id,
            eurexUser.full_name,
            eurexUser.email,
            eurexUser.password_hash,
            eurexUser.role === 'expert' || eurexUser.role === 'manager' ? 'admin' : 'user'
          ).run();
          
          user = await env.DB.prepare(
            'SELECT * FROM users WHERE email = ? AND is_active = 1'
          ).bind(email).first() as any;
        }
      }
      
      if (!user) return json({ error: 'Utilisateur non trouvé' }, 401);
      
      // Note: En production, vérifier le mot de passe hashé
      // Pour l'instant, on retourne l'utilisateur sans vérification de mot de passe
      // (à implémenter selon vos besoins de sécurité)
      
      return json({
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        synced: true
      });
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