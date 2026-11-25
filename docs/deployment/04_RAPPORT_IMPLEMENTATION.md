# 04 — Rapport d'implémentation

Session du 25 novembre 2026. Demande : créer un dossier de déploiement et y préparer les deux
applications, d'après `PROMPT_CONFIGURATION_JB_HOTEL.md`.
**Aucun déploiement n'a été effectué** et **aucun code applicatif n'a été modifié.**

## 1. Audit préalable

### Versions constatées

| Composant | Version | Source |
|---|---|---|
| Laravel | 12 | `backend/composer.json`, imposé par PHP 8.2 |
| PHP | 8.2.12 (XAMPP, ZTS) | `php -v` |
| Composer | 2.10.2 | `composer --version` |
| MariaDB | 10.4, port 3306 | environnement local (la CI teste MySQL 8.4) |
| React | 19.3 | `frontend/package.json` |
| Vite | 7 (plugin React 6.1) | idem |
| TypeScript | 7 | idem |
| React Router | 8.5 (importé depuis `react-router`) | idem |
| TanStack Query | 5.108 | idem |
| Node / npm | 24.18.0 / 11.16.0 | `node -v`, `npm -v` |

### Authentification réelle

**Sanctum en mode SPA, session par cookie** (D-005) — ni Bearer, ni JWT.
`bootstrap/app.php` appelle `$middleware->statefulApi()` ; le client envoie
`credentials: 'include'` et relit le cookie `XSRF-TOKEN` pour le renvoyer dans `X-XSRF-TOKEN`.
Ce mécanisme n'a pas été changé : il est fonctionnel et conditionne toute la configuration CORS.

### Points vérifiés

| Point | Constat |
|---|---|
| CORS | `config/cors.php` déjà correct : `supports_credentials`, origines explicites depuis `FRONTEND_URL`, `sanctum/csrf-cookie` dans `paths`, en-têtes métier autorisés et `Content-Disposition` exposé |
| Appels HTTP | déjà centralisés dans `shared/api/client.ts` (fetch natif, pas d'Axios). Aucune URL d'API codée en dur : tout passe par `shared/config.ts` |
| Adresse de l'API | `VITE_API_URL` = **racine publique de Laravel, sans `/api`**. `buildUrl()` ajoute `api/v1/...` et contrôle que l'URL finale reste sous cette racine |
| Gestion des erreurs | contrat JSON français côté serveur (`ApiExceptionRenderer`), modale globale côté client, 400/401/403/404/409/419/422/429/500/503 traités, message réseau imposé |
| PWA | `public/manifest.webmanifest` (scope et `start_url` relatifs), `public/sw.js` enregistré en production uniquement, copie locale en IndexedDB sans expiration, file d'attente d'écritures (outbox) avec clés d'idempotence |
| Connectivité | `shared/offline/connectivity.ts` suit la joignabilité réelle du serveur, pas `navigator.onLine`, et ne confond pas une erreur applicative avec une coupure |
| Santé | `GET /api/v1/health` existe déjà (base de données incluse) : rien à créer |
| Endpoints | 105 routes applicatives chargées dans la livraison |

### Deux livraisons distinctes, à ne pas confondre

Le dépôt contenait déjà une livraison **mono-domaine** : frontend et API sur
`banguiweb-tech.com`, API dans le sous-dossier `/backend` avec un `index.php` relais et le projet
Laravel privé hors de `htdocs` (`infra/build_lws.py`, `docs/DEPLOIEMENT_LWS_DOSSIER.md`).
Le prompt de configuration vise une architecture **à deux sous-domaines**
(`app.jb-hotel.com` / `api.jb-hotel.com`). Les deux coexistent : rien de l'existant n'a été
repointé, et chaque outil construit dans son propre dossier.

## 2. Fichiers créés

| Fichier | Rôle |
|---|---|
| `deploiement/README.md` | carte du dossier, préparation, mise en ligne |
| `deploiement/preparer.py` | construit et vérifie les deux livraisons |
| `deploiement/modeles/backend.env.production.example` | `.env` Laravel de production, sans secrets |
| `deploiement/modeles/frontend.env.production.example` | environnement Vite de production |
| `deploiement/modeles/frontend.env.development.example` | environnement Vite local |
| `deploiement/modeles/app-jb-hotel.htaccess` | `.htaccess` React du sous-domaine `app` |
| `docs/deployment/01_CONFIGURATION_LOCALE.md` | prérequis, variables, démarrage, vérifications |
| `docs/deployment/02_CONFIGURATION_CORS.md` | CORS, Sanctum, cookies partagés, tests, dépannage |
| `docs/deployment/03_DEPLOIEMENT_PRODUCTION.md` | sous-domaines, Apache, SSL, sécurité, mise à jour |
| `docs/deployment/04_RAPPORT_IMPLEMENTATION.md` | ce rapport |

Produits par le script (exclus de Git, reproductibles) : `deploiement/frontend/`,
`deploiement/backend/`, `deploiement/archives/`, `MANIFESTE.json`, `SHA256SUMS.txt`.

## 3. Fichiers modifiés

| Fichier | Modification |
|---|---|
| `.gitignore` | exclusion des artefacts construits de `deploiement/` |

**Rien d'autre.** Aucun fichier de `backend/app`, `backend/config`, `frontend/src`, aucun `.env`
existant, aucune migration. En particulier :

- `backend/.env` local conservé tel quel : il était déjà conforme (`APP_URL`, `FRONTEND_URL`,
  `SANCTUM_STATEFUL_DOMAINS` corrects) et contient `APP_KEY`, les identifiants MySQL et le compte
  SMTP réel ;
- `config/cors.php` conservé : déjà correct pour Sanctum en mode SPA ;
- `frontend/.env.production.local` conservé : il vise la livraison mono-domaine. Le script passe
  l'adresse de production **en variable d'environnement**, ce qui a la priorité sur les fichiers
  `.env` dans Vite ; aucun fichier d'environnement n'est donc réécrit ;
- `frontend/public/.htaccess` conservé : il est écrit pour la livraison mono-domaine et sa condition
  `HTTP_HOST` ne correspondrait pas au sous-domaine. Le script le **remplace dans la livraison**
  sans toucher à la source.

## 4. Décisions et écarts par rapport au prompt

| Sujet | Prompt | Retenu | Raison |
|---|---|---|---|
| `VITE_API_URL` | `https://api.jb-hotel.com/api` | `https://api.jb-hotel.com` | le client ajoute `api/v1/...` et appelle `/sanctum/csrf-cookie` hors de `/api` ; le suffixe produirait `/api/api/v1/...` et ferait refuser l'appel CSRF. Le script refuse une adresse terminée par `/api` |
| `supports_credentials` | `false` | `true` (inchangé) | la configuration de référence du prompt décrit des jetons Bearer ; l'application utilise des cookies de session |
| `allowed_headers` | `*` | liste explicite (inchangé) | le joker est refusé par les navigateurs avec `credentials` |
| Fichiers d'environnement React | `.env.development` / `.env.production` | modèles dans `deploiement/modeles/` + variables passées au build | un `.env.production.local` existant est prioritaire sur `.env.production` et aurait rendu un tel fichier inopérant |
| Endpoint de santé | `/api/health` à créer | `/api/v1/health` existant | toutes les routes métier sont sous `/api/v1` ; créer un second endpoint dupliquerait un contrat déjà testé |
| `SESSION_DOMAIN` | non traité | `.jb-hotel.com` | deux sous-domaines : sans point initial, le frontend ne peut pas lire le cookie CSRF et toutes les écritures échouent en 419 |

## 5. Problèmes rencontrés et solutions

| Problème | Solution |
|---|---|
| `frontend/.env.production.local` (livraison mono-domaine) aurait écrasé toute adresse de production placée dans un `.env.production` | adresse passée en variable d'environnement au build, et vérification que `banguiweb-tech.com` est **absent** du JavaScript compilé — la livraison échoue sinon |
| Le `.htaccess` du build conditionne le repli React à `HTTP_HOST = banguiweb-tech.com` et réserve `/backend` à Laravel : sur `app.jb-hotel.com`, les liens profonds auraient renvoyé 404 après rafraîchissement | `.htaccess` dédié au sous-domaine, substitué dans la livraison, source inchangée |
| `http://localhost:8000` est présent dans le bundle même après un build de production | c'est le repli de `shared/config.ts`, utilisé seulement si aucune adresse n'est fournie. La vérification porte donc sur la **présence** de l'adresse de production, pas sur l'absence de `localhost` |
| Une page PWA mise en cache un an réclamerait des assets supprimés après mise à jour | cache long réservé aux fichiers portant une empreinte dans leur nom ; `index.html`, `sw.js` et le manifeste revalidés |
| L'en-tête du `.htaccess` de protection racine réutilisé était écrit pour LWS | seules les **règles** sont partagées avec `infra/lws/api-root.htaccess` ; l'en-tête est réécrit à la copie |
| Sous Windows, `vendor/` peut contenir des fichiers en lecture seule qui bloquent la reconstruction | suppression forcée (`onexc`) avant chaque préparation |
| Préparé sous Windows, un `.htaccess` partait avec des fins de ligne CRLF vers un serveur Linux | tous les fichiers écrits par le script passent par `ecrire_lf` (UTF-8, LF), `SHA256SUMS.txt` compris pour que `sha256sum -c` le relise |

## 6. Tests réellement exécutés

### Préparation de la livraison — `python deploiement/preparer.py`

Terminé avec succès (code 0), le 25/11/2026 à 15:55 UTC :

| Vérification automatique | Résultat |
|---|---|
| Build React de production (`tsc -b && vite build`) | réussi |
| `https://api.jb-hotel.com` présent dans le JavaScript compilé | présent |
| `banguiweb-tech.com` absent du JavaScript compilé | absent |
| Fichiers référencés par `index.html` | tous présents |
| `sw.js`, `manifest.webmanifest`, icônes, `.htaccess` | présents |
| `composer install --no-dev --optimize-autoloader` | réussi |
| `composer check-platform-reqs --no-dev` | toutes les extensions `success` |
| `vendor` identique aux dépendances verrouillées, aucune dépendance de développement | conforme |
| `.env`, `tests/`, `phpunit.xml`, journaux, archives absents de la livraison | conforme |
| Démarrage de Laravel dans la livraison (`route:list`, base en mémoire) | **105 routes applicatives chargées** |
| Archives sans secret ni lien symbolique, intégrité contrôlée | conformes |

Livraison produite : frontend 12 fichiers / 1,9 Mo (archive 0,5 Mo) ; backend 7 929 fichiers /
46,2 Mo (archive 15,0 Mo). Empreintes dans `deploiement/SHA256SUMS.txt`.

### CORS et authentification, serveur local `php artisan serve`

| # | Test | Résultat |
|---|---|---|
| 1 | `GET /api/v1/health` | **200** `{"status":"ok","database":"ok",...}` |
| 2 | `OPTIONS /api/v1/auth/login`, `Origin: http://localhost:5173` | **204** + `Access-Control-Allow-Origin: http://localhost:5173`, `Allow-Credentials: true`, `Allow-Methods` (6 méthodes), `Allow-Headers` (7 en-têtes dont `x-xsrf-token`, `idempotency-key`, `x-offline-replay`), `Max-Age: 600`, `Vary: Origin` |
| 3 | `OPTIONS /api/v1/auth/login`, origine non autorisée | **204 sans aucun en-tête `Access-Control-*`** : un navigateur bloquerait l'appel |
| 4 | `GET /sanctum/csrf-cookie`, `Origin: http://localhost:5173` | **204** + en-tête CORS ; cookie `XSRF-TOKEN` **lisible par JavaScript** (sans `HttpOnly`), cookie de session en `HttpOnly` |

Le test 4 confirme le mécanisme qui impose `SESSION_DOMAIN=.jb-hotel.com` en production.

### Non-régression

Aucun code applicatif n'ayant été modifié, les suites servent de contrôle de l'état du dépôt :
280 tests backend et 227 tests frontend passés (détail en section 8).

## 7. Tests non exécutés, et pourquoi

| Test attendu (prompt, section 11) | État | Raison |
|---|---|---|
| CORS validé **dans un navigateur** | non exécuté | demande une session interactive. `curl` n'applique aucune politique d'origine : il ne prouve rien sur le CORS, il ne fait que lire les en-têtes. Procédure dans `02_CONFIGURATION_CORS.md`, section 5 |
| Parcours fonctionnels complets (clients, chambres, réservations, caisse, paiements, factures, tickets 80 mm, tableau de bord) | non rejoués dans cette session | couverts par les suites existantes et par `docs/RECETTE.md` ; aucune modification fonctionnelle à valider ici |
| Démarrage hors ligne après extinction et redémarrage de la machine | non exécuté | demande un redémarrage physique du poste. Les scénarios automatisés `npm run test:e2e:offline` couvrent la coupure réseau, pas le redémarrage |
| Routes React après rafraîchissement **sur le serveur de production** | non exécuté | demande le sous-domaine en ligne. Le `.htaccess` fourni l'assure ; vérification n° 3 de `03_DEPLOIEMENT_PRODUCTION.md`, section 6 |
| Connexion, rôles et permissions **sur l'environnement de production** | non exécuté | aucune action sur la production, conformément à la consigne |
| Migrations de production | non exécutées | aucune base de production accessible ; commandes documentées, `migrate:fresh` et `db:wipe` explicitement interdits |
| CI sur MySQL 8.4 | non exécutée localement | MySQL 8 et Docker ne sont pas installés sur ce poste (MariaDB 10.4) ; la CI GitHub s'en charge |

Rien de ce qui n'a pas été exécuté n'est présenté comme réussi.

## 8. Résultats des suites de tests

Exécutées le 25/11/2026 après la préparation, sur ce poste (MariaDB 10.4, base `jb_hotel_test`) :

| Suite | Commande | Résultat |
|---|---|---|
| Backend | `php artisan test` | **280 tests passés**, 2 268 assertions, 194,8 s, code 0 |
| Frontend | `npm test` (Vitest) | **227 tests passés**, 43 fichiers, 131,3 s, code 0 |

Aucun échec, aucun test ignoré. Ces chiffres correspondent à l'état attendu du dépôt
(`CHECK_LEVEL.md`) : la préparation du déploiement n'a introduit aucune régression, ce qui est
cohérent avec le fait qu'aucun code applicatif n'a été touché.

Non exécutés dans cette session : `composer lint`, `composer analyse`, `npm run lint`,
`npm run typecheck` (ce dernier est toutefois lancé par `npm run build`, donc passé pendant la
préparation), et les suites de navigateur (`npm run test:e2e`, `npm run test:e2e:offline`,
`npm run check:dev`) — voir la section 7.

## 9. Risques et recommandations

1. **`SESSION_DOMAIN` est le point de rupture le plus probable.** Avec `null`, la connexion semble
   fonctionner (les lectures passent) mais toute écriture échoue en 419. À vérifier en premier.
2. **HTTPS obligatoire sur les deux sous-domaines** : `SESSION_SECURE_COOKIE=true` rend la connexion
   impossible sans certificat valide.
3. **Racine web de l'API** : si `api.jb-hotel.com` pointe sur la racine du projet au lieu de
   `public/`, `.env` et `vendor/` deviennent accessibles. Le `.htaccess` racine fourni limite les
   dégâts, mais la bonne configuration du sous-domaine reste la seule protection fiable.
4. **File d'attente** : sans `queue:work` (ou tâche planifiée équivalente), aucun e-mail client ou
   personnel ne partira — les messages s'empilent silencieusement dans la table `jobs`.
5. **`php artisan optimize` après chaque changement de `.env`** : un cache de configuration obsolète
   est la première cause de CORS ou de session « qui ne prennent pas ».
6. **Postes de caisse hors ligne** : ne jamais vider le stockage local d'un navigateur de poste, il
   peut contenir des opérations non envoyées (`docs/RECETTE_HORS_LIGNE.md`). Les prévenir avant
   une mise à jour et vérifier que leur file d'attente est vide.
7. **Mono-domaine ou sous-domaines, il faut trancher.** Deux livraisons cohabitent dans le dépôt.
   Si l'hôtel retient `jb-hotel.com`, la livraison LWS (`infra/build_lws.py`, adresse
   `banguiweb-tech.com`) devrait être retirée pour éviter qu'un build parte avec la mauvaise
   adresse d'API. Décision à faire valider.
8. **Règles métier encore provisoires** : les points ouverts de `docs/QUESTIONS.md` (définition de la
   « journée », règles fiscales en RCA, conditions de remboursement) restent en attente de validation
   par l'hôtel, ainsi que l'en-tête légal des tickets (`HOTEL_TAX_ID`, `HOTEL_RCCM`) resté vide dans
   le modèle d'environnement. Une mise en production de facturation réelle devrait attendre ces
   réponses.
