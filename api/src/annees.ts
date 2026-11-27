// Gestion des années : liste déroulante dans l'UI et renouvellement automatique
// des dossiers au 1er janvier (copie de l'année précédente).

export interface AnneesEnv {
  DB: D1Database;
}

const TYPES = ['DMI', 'AP', 'CNSS', 'IS'];

// Années présentes dans les dossiers / objectifs, plus l'année courante.
export async function anneesDisponibles(env: AnneesEnv): Promise<number[]> {
  const anneeCourante = new Date().getUTCFullYear();
  const { results } = await env.DB.prepare(
    `SELECT strftime('%Y', created_at) AS y FROM travaux
     UNION
     SELECT CAST(annee AS TEXT) AS y FROM objectifs_annuels`
  ).all();
  const annees = new Set<number>([anneeCourante]);
  for (const row of results || []) {
    const y = Number((row as any).y);
    if (Number.isInteger(y) && y >= 2000 && y <= 2100) annees.add(y);
  }
  return [...annees].sort((a, b) => b - a);
}

// Copie les dossiers de `depuis` vers `annee`. Idempotent : une référence déjà
// présente dans l'année cible est ignorée. Remet aussi les objectifs par défaut.
export async function preparerAnnee(
  env: AnneesEnv,
  annee: number,
  depuis: number
): Promise<{ cree: number; deja: number; objectifs: number }> {
  if (!Number.isInteger(annee) || !Number.isInteger(depuis) || annee <= depuis) {
    throw new Error('Années invalides');
  }

  const { results: source } = await env.DB.prepare(
    `SELECT t.id, t.societe_id, t.type_travail, t.reference, t.titre, t.description,
            a.comptable_id, a.comptable_name, s.raison_sociale AS societe_nom
     FROM travaux t
     LEFT JOIN travail_attributions a ON a.travail_id = t.id
     LEFT JOIN societes s ON s.id = t.societe_id
     WHERE strftime('%Y', t.created_at) = ?
     ORDER BY t.created_at, t.id`
  ).bind(String(depuis)).all();

  let cree = 0;
  let deja = 0;

  for (const [i, row] of (source || []).entries()) {
    const d = row as any;
    const reference = typeof d.reference === 'string' && /-\d{4}$/.test(d.reference)
      ? d.reference.replace(/-\d{4}$/, `-${annee}`)
      : `AUTO-${d.type_travail}-${String(i + 1).padStart(2, '0')}-${annee}`;

    const existant = await env.DB.prepare('SELECT 1 FROM travaux WHERE reference = ?').bind(reference).first();
    if (existant) { deja += 1; continue; }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO travaux (id, societe_id, type_travail, reference, titre, description, statut, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'en_cours', datetime('now'))`
    ).bind(id, d.societe_id, d.type_travail, reference, d.titre, d.description || null).run();

    if (d.comptable_id) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO travail_attributions (travail_id, comptable_id, comptable_name, assigned_by)
         VALUES (?, ?, ?, ?)`
      ).bind(id, d.comptable_id, d.comptable_name || null, null).run();
    }

    await env.DB.prepare(
      `INSERT INTO audit_log
        (id, user_id, user_name, role, action, entity_type, entity_id, societe_id, societe_nom, travail_id, travail_titre, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), null, 'Système', 'system', 'creation_dossier_auto',
      'travail', id, d.societe_id, d.societe_nom || null, id, d.titre,
      `Renouvellement ${annee} depuis ${depuis} · ${reference}`
    ).run();

    cree += 1;
  }

  // Objectifs par société : on recopie ceux de l'année écoulée (modifiables ensuite).
  const { results: objectifsSource } = await env.DB.prepare(
    `SELECT societe_id, type_travail, objectif FROM objectifs_societes WHERE annee = ?`
  ).bind(depuis).all();
  for (const row of objectifsSource || []) {
    const o = row as any;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO objectifs_societes (id, annee, societe_id, type_travail, objectif)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(`obj-soc-${annee}-${o.societe_id}-${o.type_travail}`, annee, o.societe_id, o.type_travail, o.objectif).run();
  }

  let objectifs = 0;
  for (const type of TYPES) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO objectifs_annuels (id, annee, type_travail, objectif) VALUES (?, ?, ?, ?)`
    ).bind(`obj-${type}-${annee}`, annee, type, type === 'DMI' ? 12 : 0).run();
    if ((result.meta?.changes || 0) > 0) objectifs += 1;
  }

  return { cree, deja, objectifs };
}
