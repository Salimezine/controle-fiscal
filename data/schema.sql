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

-- Affectation comptable -> sociétés (miroir de org_clients.assigned_comptable_id EUREX)
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