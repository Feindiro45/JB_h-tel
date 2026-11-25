# Dossier de déploiement — JB Hôtel

Les deux applications, préparées et vérifiées en local, prêtes à être mises en ligne.
**Rien n'est déployé par ce dossier** : il contient les fichiers à téléverser et le script qui les
produit. Préparé d'après `PROMPT_CONFIGURATION_JB_HOTEL.md`.

## Contenu

| Chemin | Rôle | Versionné |
|---|---|---|
| `preparer.py` | construit et vérifie les deux livraisons | oui |
| `modeles/backend.env.production.example` | modèle de `.env` Laravel, sans secrets | oui |
| `modeles/frontend.env.production.example` | modèle d'environnement Vite (production) | oui |
| `modeles/frontend.env.development.example` | modèle d'environnement Vite (local) | oui |
| `modeles/app-jb-hotel.htaccess` | `.htaccess` React du sous-domaine `app` | oui |
| `frontend/` | **à téléverser** : contenu de la racine de `app.jb-hotel.com` | non (construit) |
| `backend/` | **à téléverser** : projet Laravel ; `api.jb-hotel.com` pointe sur son `public/` | non (construit) |
| `archives/*.zip` | les deux mêmes livraisons en archives, pour un envoi FTP ou un gestionnaire de fichiers | non (construit) |
| `desktop/` | **à téléverser** dans `/desktop` de `app.jb-hotel.com` : canal des mises à jour du logiciel Windows | non (construit par `npm run update-channel` dans `electron/`) |
| `MANIFESTE.json`, `SHA256SUMS.txt` | adresses utilisées, tailles, empreintes | non (construit) |

Les dossiers construits sont exclus de Git : ils contiennent `vendor/` et le build React, qui se
reconstruisent à l'identique avec le script.

## Préparer (ou reconstruire) la livraison

```bash
python deploiement/preparer.py
```

Par défaut : `https://app.jb-hotel.com` et `https://api.jb-hotel.com`. Pour d'autres adresses :

```bash
python deploiement/preparer.py --api-url https://api.exemple.com --app-url https://app.exemple.com
```

`--api-url` est la **racine publique de Laravel, sans `/api`** : le client ajoute lui-même
`/api/v1/...` et appelle `/sanctum/csrf-cookie`, qui est hors de ce préfixe. Le script refuse une
adresse terminée par `/api`.

Prérequis : `frontend/node_modules` installé, Composer, PHP 8.2+ et Python 3.12+ dans le PATH.
Le backend local, son `.env` et son `vendor` de développement ne sont jamais modifiés.

Effet de bord à connaître : le script passe par `npm run build`, donc `frontend/dist` contient
ensuite le build de **cette** livraison, avec l'adresse `api.jb-hotel.com`. Ne jamais téléverser
`frontend/dist` directement : la seule livraison vérifiée est `deploiement/frontend`. Un build pour
l'autre hébergement (`infra/build_lws.py`) écrase `frontend/dist` à son tour.
Le script échoue — sans produire de livraison incomplète — si l'adresse de l'API est absente du
JavaScript compilé, si un fichier référencé par `index.html` manque, si `vendor` contient des
dépendances de développement, ou si un `.env` se glisse dans la livraison.

## Mettre en ligne

| Sous-domaine | Racine web | Source |
|---|---|---|
| `https://app.jb-hotel.com` | dossier du frontend | contenu de `frontend/` |
| `https://api.jb-hotel.com` | **`public/` du projet Laravel** | `backend/` |

1. Téléverser le contenu de `frontend/`, **`.htaccess` compris** (les clients FTP masquent souvent
   les fichiers commençant par un point).
2. Téléverser `backend/` et faire pointer `api.jb-hotel.com` sur son dossier `public`, jamais sur la
   racine du projet.
3. Copier `backend/.env.production.example` en `.env`, puis renseigner `APP_KEY`, la base MySQL et le
   compte SMTP. Garder `SESSION_DOMAIN=.jb-hotel.com` : sans cela, le frontend ne peut pas lire le
   cookie CSRF et **toutes les écritures échouent en 419**.
4. `php artisan migrate --force`, puis `php artisan optimize`.
5. Rejouer les vérifications de `docs/deployment/03_DEPLOIEMENT_PRODUCTION.md`, section 6.

Procédure complète, permissions, SSL, file d'attente, sécurité et mise à jour :
**`docs/deployment/03_DEPLOIEMENT_PRODUCTION.md`**.

### Mises à jour du logiciel Windows (`desktop/`)

Les postes installés (1.0.3 et suivantes) vérifient `https://app.jb-hotel.com/desktop/latest.yml`
au démarrage puis toutes les 6 h, et téléchargent seuls la nouvelle version.

1. Dans `electron/` : augmenter la version, `npm run dist`, puis `npm run update-channel`.
2. Créer le dossier `desktop` à la racine de `app.jb-hotel.com`, à côté d'`index.html`.
3. Y téléverser le **contenu** de `deploiement/desktop/`, `.htaccess` compris, **`latest.yml` en
   dernier**. L'installateur (≈ 122 Mo) passe mieux par FTP que par un gestionnaire de fichiers web.
4. Contrôle : `https://app.jb-hotel.com/desktop/latest.yml` doit afficher `version: …` et non la page
   de connexion de l'application.

Le dossier `desktop` du serveur n'appartient pas au build React : le garder quand on remplace le
contenu de `frontend/` sur le serveur. Détails : `docs/WINDOWS_BUILD_AND_INSTALL.md`.

### Sous-domaines LWS avec répertoires imposés

Si LWS sert `htdocs/api.jb-hotel.com` sans permettre de choisir `backend/public`, copier les deux
fichiers de `modeles/api-jb-hotel/` dans ce répertoire. Leur `index.php` charge le point d'entrée
du dossier voisin `htdocs/backend/public`. Le projet Laravel reste protégé par son `.htaccess`
de racine ; ne pas copier son `.env` ou son `vendor` dans le répertoire du sous-domaine.

Conserver `RewriteBase /` et une cible relative dans les règles Apache : `index.php` pour l'API,
`index.html` pour le frontend. Sur cet hébergement, ces règles évitent les erreurs de réécriture
et permettent d'ouvrir directement `/connexion` ou `/reservations`.

Après configuration de MySQL dans le `.env` serveur, exécuter depuis `backend` :

```bash
php artisan config:clear
php artisan migrate --force
php artisan config:cache
```

Vérifier `/api/v1/health` (`database: ok`), `/sanctum/csrf-cookie` (204), le preflight `OPTIONS`
depuis `https://app.jb-hotel.com` (204), puis la connexion dans le navigateur. La commande privée
`php artisan jb:create-admin` crée le premier administrateur après initialisation des rôles avec
`php artisan db:seed --class=RolesAndPermissionsSeeder --force` ; saisir le mot de passe de façon
masquée dans la console.

La sonde `GET /api/v1/auth/me` répond `200` avec `{"data":null}` sans session, pour que l'ouverture
de la page de connexion ne génère pas d'erreur réseau attendue dans la console. Les autres routes
protégées conservent leur réponse `401` sans authentification ; un compte désactivé reste refusé.

## Documentation

| Fichier | Contenu |
|---|---|
| `docs/deployment/01_CONFIGURATION_LOCALE.md` | prérequis, variables, démarrage, vérifications |
| `docs/deployment/02_CONFIGURATION_CORS.md` | CORS, Sanctum, cookies partagés, tests, dépannage |
| `docs/deployment/03_DEPLOIEMENT_PRODUCTION.md` | sous-domaines, Apache, SSL, sécurité, mise à jour |
| `docs/deployment/04_RAPPORT_IMPLEMENTATION.md` | audit, modifications, tests réellement exécutés |

## Autre livraison

Pour l'hébergement mono-domaine (frontend et API sur `banguiweb-tech.com`, API dans un sous-dossier,
projet Laravel privé hors de `htdocs`), l'outil est `infra/build_lws.py` et la procédure
`docs/DEPLOIEMENT_LWS_DOSSIER.md`. Les deux livraisons coexistent sans se gêner : chaque script
construit dans son propre dossier et lit l'adresse d'API qui lui est propre.
