# 01 — Configuration locale (React + Laravel)

Référence : `PROMPT_CONFIGURATION_JB_HOTEL.md`, sections 3 à 5 et 11.
Les deux applications démarrent indépendamment et communiquent en HTTP.

| Composant | Local | Production |
|---|---|---|
| React (Vite 7) | http://localhost:5173 | https://app.jb-hotel.com |
| Laravel 12 | http://localhost:8000 | https://api.jb-hotel.com |
| API REST | http://localhost:8000/api/v1 | https://api.jb-hotel.com/api/v1 |

## 1. Prérequis constatés sur ce poste

| Outil | Version installée | Remarque |
|---|---|---|
| PHP | 8.2.12 (XAMPP, ZTS) | impose Laravel 12 |
| Composer | 2.10.2 | |
| MariaDB | 10.4 (port 3306, `root` sans mot de passe) | MySQL 8 et Docker non installés ; la CI teste sur MySQL 8.4 |
| Node | 24.18.0 | |
| npm | 11.16.0 | |
| Python | 3.15 | utilisé par `deploiement/preparer.py` |

Bases de données : `jb_hotel` (développement) et `jb_hotel_test` (tests, jamais SQLite — le verrouillage
et les contraintes doivent être testés sur le vrai moteur).

## 2. Variables d'environnement

### Laravel — `backend/.env`

Le fichier local existant est déjà conforme et **n'a pas été modifié** (il contient `APP_KEY`, les
identifiants MySQL et le compte SMTP réel). Valeurs qui gouvernent la communication :

```env
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173
SANCTUM_STATEFUL_DOMAINS=localhost:5173,127.0.0.1:5173,localhost:4173
SESSION_DRIVER=database
SESSION_DOMAIN=null
```

`FRONTEND_URL` accepte plusieurs origines séparées par des virgules ; `config/cors.php` les lit
directement. `localhost:4173` sert au mode hors ligne réel (`npm run hors-ligne`).

Modèle de production sans secrets : `deploiement/modeles/backend.env.production.example`.

### React — `frontend/.env.local`

```env
VITE_API_URL=http://localhost:8000
VITE_TIMEZONE=Africa/Bangui
```

**`VITE_API_URL` est la racine publique de Laravel, sans `/api`.** Le client
(`frontend/src/shared/api/client.ts`) ajoute lui-même `/api/v1/...` et appelle
`/sanctum/csrf-cookie`, qui est hors du préfixe `/api`. Une valeur terminée par `/api` produirait
`/api/api/v1/...` et ferait refuser l'appel CSRF par le contrôle d'origine de `buildUrl()`.
C'est le seul écart assumé par rapport à l'exemple de la section 4 du prompt.

Ordre de priorité effectif (Vite) : variables d'environnement réelles `VITE_*` >
`.env.production.local` / `.env.local` > `.env.production` / `.env.development` > `.env`.
`frontend/.env.production.local` existe et vise la livraison mono-domaine
(`https://banguiweb-tech.com/backend`) : un `.env.production` serait donc ignoré. C'est pourquoi
`deploiement/preparer.py` passe l'adresse de production en variable d'environnement.

Modèles : `deploiement/modeles/frontend.env.development.example` et `…production.example`.

### Secrets

Aucun secret dans les variables `VITE_*` : elles sont lisibles dans le JavaScript compilé.
`APP_KEY`, les identifiants MySQL et le mot de passe SMTP restent uniquement dans `backend/.env`.

## 3. Démarrage

```bash
# Terminal 1 — API
cd backend
php artisan serve                 # http://localhost:8000

# Terminal 2 — file d'attente (e-mails clients et personnel, D-039 / D-054)
cd backend
php artisan queue:work

# Terminal 3 — frontend
cd frontend
npm run dev                       # http://localhost:5173
```

Première installation, ou après une mise à jour des dépendances :

```bash
cd backend  && composer install && php artisan key:generate && php artisan migrate --seed
cd frontend && npm install
```

`migrate:fresh --seed` crée les comptes de démonstration `admin@jbhotel.local` et
`caissiere@jbhotel.local` (mot de passe : `DEMO_USERS_PASSWORD`, sinon affiché par le seeder).
Un administrateur de production se crée avec `php artisan jb:create-admin`.

## 4. Vérifications

```bash
# Santé de l'API (non sensible, déjà présente : routes/api.php)
curl http://localhost:8000/api/v1/health

# Contrôles de qualité
cd backend  && php artisan test && composer lint && composer analyse
cd frontend && npm test && npm run lint && npm run typecheck && npm run build

# Serveur de développement réellement servi (navigateur anonyme, sans réinitialiser la base)
cd frontend && npm run check:dev
```

Le CORS ne se valide pas en ligne de commande : `curl` n'applique pas la politique d'origine.
Voir `02_CONFIGURATION_CORS.md`, section « Tests ».

## 5. Pièges propres à ce poste

- Garder une origine cohérente : `localhost` partout. `localhost:5173` et `127.0.0.1:5173` sont deux
  origines distinctes pour le navigateur et deux entrées distinctes de `SANCTUM_STATEFUL_DOMAINS`.
- Git Bash réécrit les valeurs commençant par `/` en chemins Windows : `MSYS_NO_PATHCONV=1`.
- Écrire les fichiers du frontend de façon atomique : le serveur Vite peut lire un fichier à moitié
  écrit et continuer à servir un module vide.
- VS Code impose `ELECTRON_RUN_AS_NODE=1` : le retirer avant de lancer Electron à la main.
