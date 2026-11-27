-- Snapshot initial (historique) : comptes + sociétés repris d'EUREX.
-- INSERT OR IGNORE : ne remplace jamais les comptes créés/modifiés localement.
-- Rôles : expert/manager -> admin, comptable -> user. Périmètre : soc_animal.

INSERT OR IGNORE INTO societes (id, raison_sociale, matricule_fiscal, created_at) VALUES
  ('soc_animal', 'ANIMAL CITY CARE', NULL, '2026-08-31 20:46:28');

INSERT OR IGNORE INTO users (id, societe_id, full_name, email, password_hash, role, is_active, created_at) VALUES
  ('user_expert_001', 'soc_animal', 'Omar', 'omar.bouhlila@eurextunisie.com', '93d3046b-3c6c-4a:436981820e14a75802d37b0b87b42f5541556414bbafda3e32c1c226eca07904', 'admin', 1, '2026-09-20 08:06:48'),
  ('user_comp_001', 'soc_animal', 'Salim', 'salim.ezzine@eurextunisie.com', '1b9aa891-2715-42:ad09f17da25e7ee292f11ce4fa5a72ebc9eeaf1e9d898d386eaceb4e31863888', 'user', 1, '2026-09-20 08:06:48'),
  ('user_comp_002', 'soc_animal', 'Samar', 'samar.daboussi@eurextunisie.com', 'b5456262-a2aa-4b:e6d6c66f47971e2eaebf93decd7bea91535f5d8cc02b810a7ba36533f79979a0', 'user', 1, '2026-09-20 08:06:48'),
  ('7e8b6a23da74dd238c0797bf50aa82c0', 'soc_animal', 'Abla', 'abla.troudi@eurextunisie.com', '0b178e6a-c2ee-4e:3b17ab1e0ff959240f95b2c49b4968e2fecac2d436bac229e9083c17cf472e44', 'admin', 1, '2026-10-02 15:19:31'),
  ('3ac6dfec-18fc-4fe8-b0d9-5435ea31ac63', 'soc_animal', 'Malak', 'malak.nsir@eurextunisie.com', '5ee427c8-fdb3-4f:1d19029c271e5a8cc623eff5e5900307eeecfa51b7e34845569e9fe00cc99bd8', 'user', 1, '2026-10-08 14:12:37'),
  ('e8a0471b-e440-4025-ad2c-a41bc22b0210', 'soc_animal', 'Nawel', 'nawal.chawali@eurextunisie.com', 'cb8ab4e4-8e3e-4b:3b2872dfd6c14ded334ca0ade1163032a129dc5e3b1b4062313e079e7ce4268b', 'user', 1, '2026-10-10 07:10:47'),
  ('34ba3719-b9a8-429f-8059-90780034e6c7', 'soc_animal', 'Siwar', 'siwar.nefzi@eurextunisie.com', '502802e6-2bdb-4b:1577f42792244b9f1f20fa2c9de38234f030dc475c5ca6c8e859a92b7bd1d731', 'user', 1, '2026-10-10 07:20:17'),
  ('93437f3f-5891-46d2-81e8-0a0b6f254ddc', 'soc_animal', 'Chaima', 'chaima.belhay@eurextunisie.com', '1d1c5a7e-e4bd-4c:d059fba57211f7b9e1cc73a4ac6f2f4dc3aa3239cccda5b96a78e54c10ffadc2', 'user', 1, '2026-10-10 07:23:48');
