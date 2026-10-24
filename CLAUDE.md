# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Inventaire RISC : webapp (en français) de suivi du matériel RISC (EPI, cordes, quincaillerie) qui remplace un fichier Excel. React 19 + Vite + TypeScript + Tailwind 4, PWA, backend 100 % Supabase (PostgreSQL + Auth + une edge function). Pas de serveur à nous, pas de suite de tests.

## Commandes

```bash
npm run dev       # serveur Vite
npm run build     # tsc -b && vite build (sert aussi de vérification de types)
npm run lint      # oxlint
npm run import -- "chemin/Inventaire RISC.xlsx"   # import Excel unique (scripts/import-excel.ts, tsx)
```

`.env.local` doit définir `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` ; `SUPABASE_SERVICE_ROLE_KEY` n'est utilisée que par le script d'import (jamais commit).

## Architecture

- **Déploiement** : GitHub Pages sous `base: '/RISC/'` (voir `vite.config.ts`), via `.github/workflows/deploy.yml` à chaque push sur `main` (secrets `VITE_SUPABASE_*`). Routage en `HashRouter` (`src/App.tsx`) pour que Pages fonctionne sans réécriture d'URL. `keep-alive.yml` ping Supabase tous les 3 jours pour éviter la mise en pause du palier gratuit.
- **Données** : pas d'API maison, les pages interrogent Supabase directement (`src/lib/supabase.ts`). Tables `items`, `inspections` (contrôles SECT), `profiles`, plus la vue `items_with_alerts` qui porte la règle d'alerte (en service ET âge > 10 ans OU dernier contrôle SECT > 1 an / absent). La règle vit dans le SQL, pas dans le front.
- **Schéma SQL** : `supabase/schema.sql` puis `migration-00N-*.sql` à appliquer à la main dans le SQL Editor, dans l'ordre (pas d'outil de migration automatique). Toute évolution de colonne doit aussi être répercutée dans la vue `items_with_alerts` (cf. migration coloris).
- **Rôles** (`src/auth/AuthContext.tsx`, RLS dans les migrations) : `admin` (CRUD items, contrôles, comptes), `controleur` (ajoute des contrôles SECT et scanne, sans créer/modifier d'item), `lecture` (consultation, sans compte requis). L'accès est appliqué à la fois par les policies RLS et par `RequireAdmin` / `RequireInspector` côté UI ; ne changer qu'un des deux est un bug. La création de comptes passe par l'edge function `supabase/functions/create-account` (service role côté serveur).
- **Pagination obligatoire** : Supabase plafonne à 1000 lignes et l'inventaire en compte 4700+. Toute requête susceptible d'en ramener plus doit passer par `fetchAllRows` (`src/lib/fetchAll.ts`), sinon troncature silencieuse.
- **Hors-ligne** : seule l'appli (HTML/JS/CSS) est précachée par le service worker ; les données ne le sont pas. `src/lib/offlineCache.ts` garde en localStorage uniquement les fiches déjà consultées.
- **Scan** : pas de caméra/OCR (retiré volontairement, trop peu fiable sur DataMatrix gravé). `ScanLookup` accepte la saisie ou une douchette USB (se comporte comme un clavier + Entrée) ; recherche exacte puis approchée (`src/lib/fuzzy.ts`) sur le N° fabricant, ou lecture d'une étiquette QR RISC (`qr.ts`, `QrLabel.tsx`).
- **Import Excel** : `scripts/import-excel.ts` conserve les ID RISC historiques et reconstruit l'historique des contrôles depuis les colonnes annuelles. Le fichier source avait des collisions d'ID (#1904, #3741, déjà arbitrées) : relire la sortie en cas de réimport.
