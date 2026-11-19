# JB Hôtel — Gestion des chambres, réservations et caisse

Application web de gestion hôtelière pour JB Hôtel (République centrafricaine). La version V1 couvre les chambres, les réservations et la caisse. Elle ne comprend ni site public ni paiement en ligne.

> **État d'avancement :** voir [CHECK_LEVEL.md](CHECK_LEVEL.md).
> **Décisions et questions ouvertes :** [docs/DECISIONS.md](docs/DECISIONS.md) et [docs/QUESTIONS.md](docs/QUESTIONS.md).

## Structure du dépôt

```text
backend/     API REST Laravel 12 (PHP 8.2+), routes /api/v1
frontend/    Application React 19 + TypeScript (Vite)
docs/        Spécifications, MCD, schéma SQL de référence, décisions, questions, journal
infra/       Docker Compose (MySQL 8.4) pour le développement
CHECK_LEVEL.md  Suivi de ce qui est fait et de ce qui reste à faire
```

Le backend et le frontend sont **deux applications distinctes**. Chacune démarre seule. Elles communiquent par l'API versionnée `/api/v1`, avec CORS et les cookies de session Sanctum.

## Prérequis

- PHP 8.2+ avec les extensions `pdo_mysql`, `mbstring`, `bcmath`, `intl`, `zip` et `gd`, plus Composer 2
- Node.js 24+ et npm
- MySQL 8+ (cible), ou MariaDB 10.4+ pour le développement local (XAMPP)

## Installation

### 1. Base de données

Il y a deux possibilités. Dans les deux cas, il faut les bases `jb_hotel` et `jb_hotel_test` en `utf8mb4`.

**Option A : MySQL ou MariaDB local (XAMPP).**

```sql
CREATE DATABASE jb_hotel      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE jb_hotel_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Option B : Docker (MySQL 8.4).**

```bash
cp .env.example .env    # puis remplacer les mots de passe « change-me »
docker compose --env-file .env -f infra/docker-compose.yml up -d
```

Ensuite, dans `backend/.env` :
- `DB_PORT=3307` ;
- `DB_USERNAME` et `DB_PASSWORD` : les mêmes valeurs que `MYSQL_USER` et `MYSQL_PASSWORD`.

### 2. Backend

```bash
cd backend
composer install
cp .env.example .env          # ajuster DB_* si besoin
php artisan key:generate
php artisan migrate --seed    # tables + rôles, paramètres et comptes de démonstration (local)
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # VITE_API_URL=http://localhost:8000
```

## Démarrage (deux terminaux)

```bash
cd backend  && php artisan serve     # API : http://localhost:8000  (santé : /api/v1/health)
cd frontend && npm run dev           # Interface : http://localhost:5173
```

La page d'accueil du frontend affiche l'**état du système** : API, base de données et heure du serveur.

## Commandes

### Backend (`backend/`)

| Commande | Rôle |
|---|---|
| `php artisan test` | Tous les tests (base `jb_hotel_test`, jamais SQLite) |
| `php artisan test --filter=ErrorContractTest` | Une classe de test |
| `php artisan test --filter=test_server_time_uses_hotel_timezone` | Un seul test |
| `composer lint` / `composer format` | Vérifier le format / formater (Pint) |
| `composer analyse` | Analyse statique (Larastan, niveau 6) |

### Frontend (`frontend/`)

| Commande | Rôle |
|---|---|
| `npm test` | Tous les tests (Vitest) |
| `npx vitest run src/shared/api/errors.test.ts` | Un fichier de test |
| `npx vitest run -t "message réseau"` | Les tests dont le nom correspond |
| `npm run lint` | Lint (oxlint) |
| `npm run format` / `npm run format:check` | Formater / vérifier le format (Prettier) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run build` | Build de production (`dist/`) |

La CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) exécute ces vérifications sur MySQL 8.4.

## Comptes de test

Les comptes de démonstration sont créés par `php artisan db:seed` (ou `migrate --seed`), **uniquement en environnement local ou de test** :

| E-mail | Rôle |
|---|---|
| `admin@jbhotel.local` | Administrateur : toutes les permissions |
| `caissiere@jbhotel.local` | Caissière : réservations, clients, encaissements, factures, tableau de bord |

**Mot de passe :** aucun n'est codé en dur. Définis `DEMO_USERS_PASSWORD` dans `backend/.env` avant le seed. Sinon, un mot de passe aléatoire est généré et **affiché dans le terminal** pendant le seed. Un compte déjà existant n'est jamais modifié.

**En production**, aucun compte de démonstration n'est créé. Le premier administrateur se crée avec :

```bash
php artisan jb:create-admin     # mot de passe saisi de façon masquée
```

### Connexion depuis l'API

L'authentification utilise **Sanctum en mode SPA** : session par cookie et protection CSRF.

1. `GET /sanctum/csrf-cookie` dépose le cookie `XSRF-TOKEN`.
2. `POST /api/v1/auth/login` avec `{ "email", "password" }` et l'en-tête `X-XSRF-TOKEN`.
3. `GET /api/v1/auth/me` renvoie l'utilisateur, son rôle et ses permissions. `POST /api/v1/auth/logout` ferme la session.

> Ouvre toujours le frontend avec la **même** adresse que l'API (`localhost` des deux côtés). Sinon le cookie de session n'est pas partagé.

## Documentation

Spécifications (dans `docs/`) :
- [Cahier des charges](docs/01_cahier_des_charges.md)
- [Architecture backend](docs/02_architecture_backend.md)
- [Architecture frontend](docs/03_architecture_frontend.md)
- [MCD](docs/04_MCD_JB_Hotel.drawio)
- [Charte UI/UX](docs/05_charte_design_UI_UX.md)
- [Prompt de l'agent](docs/06_PROMPT_AGENT_IA_IMPLEMENTATION.md)
- [Règles métier et recette](docs/07_regles_metier_et_recette.md)
- [Plan d'implémentation](docs/08_plan_implementation.md)
- [Schéma SQL de référence](docs/09_schema_reference.sql)

Suivi du projet :
- [Décisions](docs/DECISIONS.md)
- [Questions ouvertes](docs/QUESTIONS.md)
- [Journal des modifications](docs/CHANGELOG.md)
