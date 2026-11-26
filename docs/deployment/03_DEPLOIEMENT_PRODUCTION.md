# 03 — Déploiement en production (app.jb-hotel.com et api.jb-hotel.com)

Référence : `PROMPT_CONFIGURATION_JB_HOTEL.md`, sections 2 et 10.
**Aucun déploiement réel n'a été effectué** : ce document décrit la procédure et le contenu du
dossier `deploiement/`, préparé et vérifié en local.

## 1. Cible

| Sous-domaine | Racine web (document root) | Contenu |
|---|---|---|
| `https://app.jb-hotel.com` | dossier du frontend | contenu de `deploiement/frontend` |
| `https://api.jb-hotel.com` | **`public/` du projet Laravel** | `deploiement/backend` |

Le sous-domaine de l'API doit pointer sur `backend/public`, **jamais** sur la racine du projet :
sinon `.env`, `vendor/`, `config/` et `storage/` deviennent téléchargeables.

Si l'hébergeur le permet, placer le projet Laravel **hors de toute racine web** (par exemple
`/home/jb-hotel/api`) et ne laisser que `public/` accessible. Pour la variante mono-domaine avec
l'API dans un sous-dossier (banguiweb-tech.com), voir `docs/DEPLOIEMENT_LWS_DOSSIER.md` et
`infra/build_lws.py` : elle utilise un `index.php` relais et un backend privé.

## 2. Préparer le dossier

```bash
python deploiement/preparer.py
# ou, pour d'autres adresses :
python deploiement/preparer.py --api-url https://api.exemple.com --app-url https://app.exemple.com
```

Le script :

1. construit React avec `VITE_API_URL` passé **en variable d'environnement** (priorité sur
   `frontend/.env.production.local`, qui vise l'autre livraison) et copie `dist` ;
2. remplace le `.htaccess` du build par celui du sous-domaine (`modeles/app-jb-hotel.htaccess`) ;
3. vérifie que l'adresse de l'API est bien dans le JavaScript compilé, que tous les fichiers
   référencés par `index.html` existent et que `sw.js`, le manifeste et les icônes sont présents ;
4. copie le projet Laravel **sans `.env`, sans `tests`, sans journaux ni archives** ;
5. installe `vendor` avec `composer install --no-dev --optimize-autoloader`, vérifie
   `check-platform-reqs` et l'absence de dépendances de développement ;
6. démarre Laravel à blanc (`route:list`, base en mémoire, aucun envoi d'e-mail) pour prouver que la
   livraison se charge, puis vide `bootstrap/cache` (régénéré sur le serveur) ;
7. écrit `MANIFESTE.json`, `SHA256SUMS.txt` et les deux archives `.zip`.

Le backend local, son `.env` et son `vendor` de développement ne sont jamais touchés.

## 3. Mise en ligne du frontend

1. Créer le sous-domaine `app.jb-hotel.com` et sa racine web.
2. Téléverser **le contenu** de `deploiement/frontend` (ou `archives/jb-hotel-frontend.zip` à
   décompresser sur place), `.htaccess` compris : les fichiers commençant par un point sont souvent
   masqués par les clients FTP, il faut activer leur affichage.
3. Activer SSL/HTTPS et forcer la redirection depuis HTTP.

`.htaccess` fourni : `index.html` pour toute adresse inconnue (React Router 8), cache long sur les
fichiers de `assets/` (ils portent une empreinte dans leur nom), revalidation de `index.html`,
`sw.js` et du manifeste. Sans mod_rewrite, l'application fonctionne à la racine mais un
rafraîchissement sur `/reservations` renvoie 404 : prévoir la règle équivalente du serveur utilisé.

## 4. Mise en ligne de l'API

1. Téléverser `deploiement/backend` et faire pointer `api.jb-hotel.com` sur son dossier `public`.
2. Copier `.env.production.example` en `.env`, puis compléter :
   - `APP_KEY` : `php artisan key:generate --force` (ou une clé générée en local et recopiée) ;
   - `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` (MySQL 8+, InnoDB, utf8mb4) ;
   - `MAIL_*` : compte SMTP de l'hôtel ;
   - vérifier `SESSION_DOMAIN=.jb-hotel.com` et `SESSION_SECURE_COOKIE=true`
     (voir `02_CONFIGURATION_CORS.md`, section 3 — sans cela, les écritures échouent en 419).
3. Permissions : `storage/` et `bootstrap/cache/` inscriptibles par le serveur web
   (`chmod -R 775`, propriétaire = utilisateur Apache/PHP). Rien d'autre n'a besoin de l'être.
4. Migrations, **non destructives** :

   ```bash
   php artisan migrate --force          # jamais migrate:fresh, jamais db:wipe
   php artisan db:seed --class=RolesAndPermissionsSeeder --force
   php artisan db:seed --class=SettingsSeeder --force
   php artisan jb:create-admin          # premier administrateur (chemin privé en CLI)
   ```

   `migrate:fresh`, `migrate:refresh` et `db:wipe` détruisent les données : interdits en production.
   Ne pas exécuter `DemoUsersSeeder` : les comptes de démonstration n'ont rien à faire en production.
5. Caches de production :

   ```bash
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   php artisan optimize
   ```

   À refaire après **chaque** modification du `.env` : un cache obsolète ignore les nouvelles valeurs.
6. File d'attente (e-mails clients et personnel, D-039 / D-054) : `QUEUE_CONNECTION=database` exige un
   exécutant. Idéalement un service permanent (`php artisan queue:work --tries=3`) ; sur un
   hébergement mutualisé, une tâche planifiée `php artisan queue:work --stop-when-empty` toutes les
   minutes. Sans cela, aucun e-mail ne partira et les messages s'accumuleront dans la table `jobs`.
7. Tâches planifiées : `php artisan schedule:run` toutes les minutes. La seule tâche déclarée
   (`routes/console.php`) purge le journal des changements des postes au-delà de
   `jbhotel.sync.retention_days` (D-069). Les identités d'opérations hors ligne, elles, ne sont
   **jamais** purgées (D-067) : une sauvegarde ancienne doit pouvoir être rejouée.
8. Vérifier `php artisan jb:mail-test` (envoi synchrone, erreurs expliquées en français).

## 5. Sécurité

- `APP_DEBUG=false` et `APP_ENV=production` : sinon une erreur expose la configuration.
- `.env` jamais versionné, jamais téléchargeable. Le `.htaccess` placé à la racine du projet
  (copie de `infra/lws/api-root.htaccess`) refuse les fichiers cachés et renvoie tout vers `public/`
  si l'hébergeur expose la racine ; il est inopérant — et inutile — quand la racine web est `public/`.
- Vérifier après mise en ligne que ces adresses répondent **403 ou 404**, jamais le contenu :
  `https://api.jb-hotel.com/../.env`, `https://app.jb-hotel.com/.env`,
  et, si htdocs est partagé, `https://jb-hotel.com/backend/.env`.
- HTTPS obligatoire sur les deux sous-domaines (`SESSION_SECURE_COOKIE=true` en dépend).
- `FRONTEND_URL` ne contient que `https://app.jb-hotel.com` : aucune origine de développement.
- Aucun secret dans les variables `VITE_*` : elles sont lisibles dans le JavaScript livré.
- Sauvegarde de la base **avant** toute mise à jour (`infra/database-backup.php`).
- Audit de sécurité existant : `docs/AUDIT_SECURITE.md`, `docs/AUDIT_PRODUCTION_2026-11-22.md`.

## 6. Vérifications après mise en ligne

| # | Vérification | Attendu |
|---|---|---|
| 1 | `curl https://api.jb-hotel.com/api/v1/health` | `{"status":"ok", ...}` |
| 2 | `curl -I https://app.jb-hotel.com` | 200, `text/html` |
| 3 | Ouvrir `https://app.jb-hotel.com/reservations` puis rafraîchir | la page s'affiche (pas de 404) |
| 4 | Connexion depuis le navigateur | `GET /sanctum/csrf-cookie` puis `POST /api/v1/auth/login` en 200 |
| 5 | Une écriture (paiement de test) | 200, pas de 419 : le cookie CSRF est bien partagé |
| 6 | Onglet Réseau | aucune erreur CORS, `OPTIONS` avant chaque écriture |
| 7 | QR code d'un ticket | ouvre la page de vérification sur `api.jb-hotel.com` |
| 8 | Installation PWA, puis coupure réseau | les écrans déjà consultés restent lisibles |
| 9 | `https://api.jb-hotel.com/.env` | 403 ou 404 |

Utiliser des **données de test** pour les opérations financières (paiements, factures) : une facture
émise est immuable et ne se supprime pas ; seule une note de crédit peut la corriger.

## 7. Mise à jour d'une version déjà en ligne

1. Sauvegarder la base et le dossier `storage/`.
2. `php artisan down` (page de maintenance).
3. Relancer `python deploiement/preparer.py`, téléverser les deux dossiers **en conservant le `.env`
   du serveur et le contenu de `storage/`** (ne jamais écraser `storage/app`).
4. `php artisan migrate --force`, puis `php artisan optimize`.
5. `php artisan up`, puis rejouer les vérifications 1 à 6 de la section 6.

Le frontend est une PWA : après mise à jour, le service worker sert d'abord l'ancienne version puis
installe la nouvelle. Les règles de cache du `.htaccess` (revalidation de `index.html` et de `sw.js`)
assurent la bascule au rechargement suivant. Ne jamais vider le stockage local du navigateur d'un
poste de caisse : il peut contenir des opérations hors ligne non encore envoyées
(`docs/RECETTE_HORS_LIGNE.md`).
