# Inventaire RISC

Webapp de suivi du matériel RISC (EPI, cordes, quincaillerie) : remplace le
fichier Excel historique par une base partagée (Supabase) consultable par
tous et modifiable par les référents matériel.

## Stack

- React + Vite + TypeScript + Tailwind, servi statiquement sur GitHub Pages
- [Supabase](https://supabase.com) (PostgreSQL + Auth) — gratuit
- Rôles : **Admin** (ajout/modif/suppression, contrôles SECT) / **Lecture** (consultation, sans compte)

## Mise en route (développement local)

```bash
npm install
npm run dev
```

Copier `.env.local.example` (si présent) ou créer `.env.local` avec :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # uniquement pour le script d'import, jamais commit
```

## Base de données

1. Dans le dashboard Supabase → **SQL Editor**, exécuter `supabase/schema.sql`
   (crée les tables `items`, `inspections`, `profiles`, les policies RLS et la
   vue `items_with_alerts`).
2. Créer un premier compte admin : **Authentication → Users → Add user**, puis
   dans le SQL Editor :
   ```sql
   update profiles set role = 'admin' where email = 'vous@exemple.be';
   ```

## Import des données existantes (une seule fois)

```bash
npm run import -- "chemin/vers/Inventaire RISC.xlsx"
```

Le script lit les feuilles Stock / Inventaire / Déclassé-Disparu, normalise les
types, conserve les ID RISC historiques, marque les dates de fabrication
aberrantes comme "inconnues", et reconstruit l'historique des contrôles SECT
à partir des colonnes annuelles.

**Doublons d'ID connus** : le fichier source contenait 2 collisions d'ID RISC
(le même numéro utilisé pour deux articles différents, ou un oubli de mise à
jour de statut). Après un import sur un nouveau projet Supabase, relire la
sortie du script pour les mêmes cas et les arbitrer à la main (voir historique
de conversation / commits pour le détail des 2 cas déjà résolus : #1904 et
#3741).

## Déploiement

Le déploiement se fait automatiquement (GitHub Actions, `.github/workflows/deploy.yml`)
à chaque push sur `main`. Pré-requis, une fois :

1. Repo **Settings → Pages → Source : GitHub Actions**
2. Repo **Settings → Secrets and variables → Actions**, ajouter :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Règle d'alerte

Un item "en service" est signalé si :

- son âge dépasse 10 ans (date de fabrication connue), **ou**
- son dernier contrôle SECT date de plus d'un an (ou n'existe pas)

## Feuille de route

- **Phase 1 (ce dépôt)** : CRUD + auth + import + alertes + export CSV
- **Phase 2** : OCR (Groq, vision) pour les numéros de série gravés sans code
  lisible + mode hors-ligne (PWA)
- **Phase 3** : scan QR / codes-barres (étiquettes générées + lecture des
  codes fabricant existants)
