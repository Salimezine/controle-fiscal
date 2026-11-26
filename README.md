# 🏛️ CONTROLE FISCAL

Système de gestion de contrôle fiscal pour cabinets comptables tunisiens.

## Fonctionnalités

- **Multi-sociétés** : Gestion de plusieurs entreprises
- **Types de travaux** : DMI, AP, CNSS, IS
- **Pièces justificatives PDF** : Upload et téléchargement
- **Intégration reçus** : Génération de reçus
- **Chaque type** s'ouvre dans une page séparée

## Structure

```
controle-fiscal/
├── api/          # Worker Cloudflare
├── web/          # Frontend React
├── data/         # Schémas SQL
└── docs/         # Documentation
```

## Stack Technique

- Frontend: React 18 + TypeScript + Vite
- Backend: Cloudflare Workers + Wrangler
- Base de données: D1 (Cloudflare)
- Stockage PDF: R2 (Cloudflare)
- Tests: Vitest + TSC
```

---<|end|><|start|>write to=assistant<|channel|>analysis<|message|>Created file successfully: C:/Users/safa.dhaoui/Documents/Default Project/controle-fiscal/README.md