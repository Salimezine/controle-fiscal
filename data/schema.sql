-- Schéma Base de Données CONTROLE FISCAL

-- Sociétés
CREATE TABLE IF NOT EXISTS societes (
  id TEXT PRIMARY KEY,
  raison_sociale TEXT NOT NULL,
  matricule_fiscal TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Types de travaux (DMI, AP, CNSS, IS)
CREATE TABLE IF NOT EXISTS types_travaux (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,  -- 'DMI', 'AP', 'CNSS', 'IS'
  label TEXT NOT NULL,
  description TEXT
);

-- Insérer les types par défaut
INSERT OR IGNORE INTO types_travaux (id, code, label, description) VALUES
  ('type-dmi', 'DMI', 'Dépôt DMI', 'Dépôt de bilan et documents fiscaux'),
  ('type-ap', 'AP', 'Achats', 'Gestion des achats et factures'),
  ('type-cnss', 'CNSS', 'Sécurité Sociale', 'Déclarations CNSS'),
  ('type-is', 'IS', 'Impôt Sociétés', 'Déclarations IS');

-- Dossiers / Travaux
CREATE TABLE IF NOT EXISTS travaux (
  id TEXT PRIMARY KEY,
  societe_id TEXT NOT NULL,
  type_travail TEXT NOT NULL,  -- 'DMI', 'AP', 'CNSS', 'IS'
  reference TEXT,              -- numéro de dossier
  titre TEXT NOT NULL,
  description TEXT,
  statut TEXT DEFAULT 'en_cours',  -- 'en_cours', 'termine', 'valide'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (societe_id) REFERENCES societes(id)
);

-- Pièces justificatives PDF
CREATE TABLE IF NOT EXISTS pieces_justificatives (
  id TEXT PRIMARY KEY,
  travail_id TEXT NOT NULL,
  societe_id TEXT NOT NULL,
  type_travail TEXT NOT NULL,
  label TEXT NOT NULL,
  file_data TEXT,             -- PDF encodé en base64 (stocké dans D1)
  file_name TEXT,             -- nom original
  file_type TEXT,             -- 'application/pdf'
  file_size INTEGER,          -- taille en bytes
  uploaded_by TEXT,
  uploaded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (travail_id) REFERENCES travaux(id),
  FOREIGN KEY (societe_id) REFERENCES societes(id)
);

-- Reçus (RECUE)
CREATE TABLE IF NOT EXISTS recues (
  id TEXT PRIMARY KEY,
  travail_id TEXT NOT NULL,
  societe_id TEXT NOT NULL,
  type_travail TEXT NOT NULL,
  numero_recu TEXT NOT NULL,
  montant REAL,
  date_recu TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (travail_id) REFERENCES travaux(id),
  FOREIGN KEY (societe_id) REFERENCES societes(id)
);

-- Utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  societe_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',  -- 'admin', 'user'
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Affectation comptable -> sociétés (snapshot local, gérable depuis l'écran Comptes)
CREATE TABLE IF NOT EXISTS user_societes (
  user_id TEXT NOT NULL,
  societe_id TEXT NOT NULL,
  PRIMARY KEY (user_id, societe_id)
);

-- Sessions de connexion (token Bearer, valable 7 jours)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Attribution d'un dossier au comptable qui le traite
CREATE TABLE IF NOT EXISTS travail_attributions (
  travail_id TEXT PRIMARY KEY,
  comptable_id TEXT NOT NULL,
  comptable_name TEXT,
  assigned_by TEXT,
  assigned_at TEXT DEFAULT (datetime('now'))
);

-- PDF des reçus (RCUE) — la table recues garde les métadonnées
CREATE TABLE IF NOT EXISTS recue_pdfs (
  id TEXT PRIMARY KEY,
  recue_id TEXT NOT NULL,
  travail_id TEXT NOT NULL,
  societe_id TEXT NOT NULL,
  label TEXT,
  file_data TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by TEXT,
  uploaded_by_name TEXT,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

-- Journal d'audit (traçabilité pour l'expert)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  societe_id TEXT,
  societe_nom TEXT,
  travail_id TEXT,
  travail_titre TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);