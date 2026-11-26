# LWS : frontend et API sur banguiweb-tech.com

> **Actualisation du 22 novembre 2026 :** le projet privé est déjà dans `home`, confirmé par l'utilisateur. Utiliser les nouvelles archives décrites dans [LIVRAISON_LWS_HOME.md](LIVRAISON_LWS_HOME.md). Les manipulations de déplacement et les anciennes archives évoquées ci-dessous concernent des incidents précédents ; elles ne sont pas à rejouer pour cette mise à jour.

Destination actuelle, choisie le 20 novembre 2026 : le frontend reste à la racine du domaine ; Laravel est accessible dans `/backend`. Cette procédure remplace la publication sur le sous-domaine API décrite dans les anciens diagnostics.

| Usage | Adresse |
| --- | --- |
| Application | `https://banguiweb-tech.com` |
| Santé de l’API | `https://banguiweb-tech.com/backend/api/v1/health` |
| Utilisateur connecté | `https://banguiweb-tech.com/backend/api/v1/auth/me` |
| Cookie CSRF | `https://banguiweb-tech.com/backend/sanctum/csrf-cookie` |
| Vérification d’une facture | `https://banguiweb-tech.com/backend/verification/factures/{uuid}?code=…` |

Les requêtes du navigateur restent sur la même origine : aucun sous-domaine API ni précontrôle CORS entre les deux services. Le dossier `/backend` désigne la racine publique Laravel ; son préfixe interne `/api/v1` reste inchangé.

## 1. Préparer le projet privé

Arborescence cible dans le gestionnaire LWS :

```text
/
├── home/
│   └── jb-hotel-backend/       projet Laravel complet, vendor, .env, storage
└── htdocs/
    ├── .htaccess              routage du frontend fourni
    ├── index.html             frontend compilé
    ├── assets/
    └── backend/
        ├── .htaccess          routage public Laravel fourni
        └── index.php          entrée PHP fournie, charge /home/jb-hotel-backend
```

Conserver une sauvegarde du backend et des fichiers racine existants. Depuis le Terminal LWS, pour **copier** l’installation actuelle sans supprimer l’ancien dossier :

```sh
cd ~/htdocs
mkdir -p ../home/jb-hotel-backend
cp -a api.hotel.banguiweb-tech.com/. ../home/jb-hotel-backend/
```

Si `home/jb-hotel-backend` contient déjà une installation, vérifier son contenu avant de copier par-dessus. À défaut du Terminal, utiliser la fonction Copier du gestionnaire de fichiers pour copier le contenu du projet dans `home/jb-hotel-backend`.

Le dossier privé doit contenir `artisan`, `app`, `bootstrap`, `config`, `routes`, `resources`, `vendor`, `storage` et le `.env` existant. Conserver `APP_KEY`, la base et les identifiants MySQL/SMTP actuels. Aucune réinitialisation de base n’est nécessaire pour ce déplacement. Ne pas publier ces fichiers privés dans `/htdocs/backend` : seuls les deux fichiers d’entrée publics y vont. Cette séparation suit le [principe de déploiement Laravel](https://laravel.com/docs/12.x/deployment#server-configuration).

## 2. Adapter le .env privé

Modifier `/home/jb-hotel-backend/.env` :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://banguiweb-tech.com/backend
FRONTEND_URL=https://banguiweb-tech.com
APP_FRONTEND_URL=https://banguiweb-tech.com
SANCTUM_STATEFUL_DOMAINS=banguiweb-tech.com
SESSION_DOMAIN=null
SESSION_PATH=/
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
VERIFICATION_BASE_URL=https://banguiweb-tech.com/backend
```

`SESSION_PATH=/` est nécessaire pour que la page React puisse lire le cookie XSRF. `SESSION_DOMAIN=null` crée un cookie limité à l’hôte courant. Les nouveaux liens d’invitation restent sur le frontend ; les nouveaux QR et les liens de désinscription utilisent la racine Laravel dans `/backend`. Les liens déjà envoyés ou imprimés conservent leur ancienne adresse.

Dans le terminal, depuis le **nouveau** projet privé :

```sh
cd ~/home/jb-hotel-backend
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan config:cache
```

Si le rôle administrateur manque encore, l’initialiser puis créer le compte uniquement s’il n’existe pas :

```sh
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan jb:create-admin --name="Paterne Feindiro" --email="paternefeindiro@gmail.com"
```

Le mot de passe est demandé de façon masquée (10 caractères minimum, lettres et chiffres).

## 3. Publier les fichiers publics

L’archive locale `output/lws/deploiement-dossier.zip` contient le frontend compilé et les deux fichiers d’entrée de `/backend`, sans `.env`, base ni identifiants. La charger puis l’extraire **directement dans `/htdocs`**. Elle doit créer `index.html`, `assets`, `.htaccess` et `backend` à ce niveau, sans dossier `dist` supplémentaire. Vérifier l’affichage des fichiers cachés.

Sources des deux fichiers backend : `infra/lws/backend-public/index.php` et `infra/lws/backend-public/.htaccess`. L’entrée PHP charge le projet privé dans `../../home/jb-hotel-backend`. Si le projet privé est absent, elle retourne une réponse JSON 503 sans détail du serveur.

Le `.htaccess` racine laisse `/backend/*` au routage Laravel au lieu d’y servir React. Celui du dossier backend utilise une base `/backend/` et transmet les routes à son `index.php`. Ne pas y mettre `api-root.htaccess`, qui concernait l’ancienne installation complète sur sous-domaine.

Pour refaire l’archive après une évolution : copier `frontend/.env.production.example` en `frontend/.env.production.local`, compiler avec `npm run build`, puis assembler le contenu de `frontend/dist` avec `infra/lws/backend-public` dans un dossier `backend`. Le build doit contenir :

```dotenv
VITE_API_URL=https://banguiweb-tech.com/backend
VITE_TIMEZONE=Africa/Bangui
```

## 4. Vérifier puis basculer les e-mails

1. Santé : `/backend/api/v1/health` doit renvoyer un JSON 200 avec `database: ok`.
2. `/backend/api/v1/auth/me` sans session doit renvoyer un JSON 401 ; c’est le comportement attendu.
3. `/backend/sanctum/csrf-cookie` doit répondre 204 avec le cookie XSRF sur `/`.
4. Effacer les anciens cookies de `banguiweb-tech.com` et de ses sous-domaines une fois, puis tester la connexion et un rechargement de page. Vérifier dans Réseau que les appels utilisent `/backend/`.
5. Ouvrir une facture PDF et sa vérification publique. Le déplacement ne change pas les écritures ni les documents enregistrés.

Modifier la tâche cron des e-mails pour lancer `artisan` dans le nouveau dossier `~/home/jb-hotel-backend` avec le chemin PHP réel de LWS. Ne pas laisser deux tâches traiter la même file. Si un worker permanent tourne sur l’ancien projet, l’arrêter avant d’activer le nouveau ; avec un cron court, attendre la fin de son exécution avant la bascule. Ne pas supprimer l’ancienne installation avant confirmation de la connexion, des PDF et du nouveau cron.

Les fichiers et tests locaux sont préparés ; cette procédure ne constitue pas une confirmation de déploiement sur LWS. Vérifier en particulier que le PHP de l’hébergement peut lire le projet privé dans `home` ; un message `open_basedir restriction` dans le journal PHP indique qu’il faut faire ajuster ce chemin par LWS.


## Correctif si toutes les routes du backend répondent 404

Si le nouveau frontend est présent mais que la santé, la session et CSRF répondent tous avec le JSON Laravel « Élément introuvable », publier le correctif `output/lws/correctif-login.zip` dans `/htdocs`. Il remplace uniquement `/htdocs/backend/index.php` ; aucune modification du `.env` ni des données.

Certains frontaux PHP annoncent `/index.php` au lieu de `/backend/index.php` dans les variables du script. Symfony conserve alors `/backend` dans le chemin recherché, qui ne correspond à aucune route Laravel. L’entrée publique fixe explicitement `SCRIPT_NAME`, `PHP_SELF` et `SCRIPT_FILENAME` pour ce montage, en conservant `REQUEST_URI`, les paramètres, la méthode et le corps de la requête. Référence : [détection du chemin de base Symfony](https://github.com/symfony/http-foundation/blob/7.3/Request.php).

Une reproduction locale exécutant le véritable fichier d’entrée avec les métadonnées erronées donne 404 avant le correctif, puis 401 sur l’utilisateur sans session, 200 à la racine et 204 pour CSRF après le correctif. Le montage et le correctif doivent encore être confirmés sur LWS après remplacement du fichier.


## Correctif 503 si le projet complet est resté dans /htdocs/backend

Le message JSON « Le service est en cours de configuration » provient de la garde de l’entrée publique : le projet privé attendu est absent ou illisible. Il ne suffit pas de lancer `artisan up` dans ce cas. Le 20/11, l’utilisateur confirme que le projet complet est encore dans `/htdocs/backend`.

Charger `output/lws/correctif-emplacement.zip` puis l’extraire dans `/htdocs`. Dans le Terminal LWS :

```sh
php ~/htdocs/reparer-emplacement-backend.php
```

Ce script est exclusivement CLI (404 via le Web). Il vérifie le projet source et les fichiers publics, refuse d’écraser une destination existante, prépare les fichiers publics hors du Web, déplace le projet complet vers `/home/jb-hotel-backend`, puis remet seulement `index.php` et `.htaccess` dans `/htdocs/backend`. Il conserve `.env`, `vendor`, `storage` et toutes les données. Si la seconde étape de déplacement échoue, il tente de restaurer le dossier initial. Aucun fichier n’est supprimé.

Après le message de réussite :

```sh
cd ~/home/jb-hotel-backend
php artisan config:clear
php artisan route:clear
php artisan config:cache
```

Contrôler ensuite la santé et le cookie CSRF. Le script a été vérifié sur un projet factice local : déplacement réussi, `.env` conservé, seulement deux fichiers dans le dossier public, seconde exécution refusée sans modifier la destination. Aucun déplacement distant effectué par l’agent.


### Si le réparateur affiche « backend/index.php est absent »

Utiliser `output/lws/correctif-emplacement-v2.zip`, à extraire dans `/htdocs` en remplaçant `reparer-emplacement-backend.php`, puis relancer la même commande PHP. Le début de la sortie doit afficher « version 2 ». La version précédente exigeait inutilement les fichiers publics à la racine du projet ; la version 2 les génère elle-même. L’arrêt précédent n’a déplacé aucun fichier.


## Réparation manuelle dans le gestionnaire LWS, sans commande

1. Déplacer le dossier complet `/htdocs/backend` dans `/home`, puis le renommer `jb-hotel-backend`. Il doit contenir directement `artisan`, `vendor`, `bootstrap`, `storage` et `.env`.
2. Charger `output/lws/backend-public.zip` et l’extraire dans `/htdocs`. Cette archive crée un nouveau dossier `backend` contenant seulement `index.php` et `.htaccess`.
3. Adapter `/home/jb-hotel-backend/.env` avec les valeurs de la section 2 de ce guide, en conservant la clé et les identifiants actuels.
4. Dans `/home/jb-hotel-backend/bootstrap/cache`, supprimer les fichiers générés `config.php` et `routes-v7.php` s’ils existent. Laravel relira ainsi le `.env` et les routes sans commande Artisan.
5. Vérifier `/backend/api/v1/health`, puis recharger la connexion.

L’archive publique de deux fichiers a été vérifiée. Aucun déplacement ni suppression de cache distant exécuté par l’agent.


### Si le 503 persiste après une manipulation manuelle

Observation du gestionnaire LWS : le dossier privé peut avoir été seulement renommé `/htdocs/jb-hotel-backend`, et les deux fichiers de l’API extraits à la racine `/htdocs/index.php` et `/htdocs/.htaccess`. Le chemin attendu par PHP reste `/home/jb-hotel-backend`, et le frontend doit avoir son propre `index.html` à la racine.

Déplacer le projet complet de `/htdocs/jb-hotel-backend` vers `/home/jb-hotel-backend`. Extraire ensuite `output/lws/publication-complete-v3.zip` dans `/htdocs` : l’archive a des fichiers à sa racine et un sous-dossier `backend`, sans dossier parent à retirer. Vérifier visuellement que `/htdocs/index.html`, `/htdocs/assets` et `/htdocs/backend/index.php` existent. Le `.htaccess` frontend fixe `DirectoryIndex index.html` pour que l’ancien fichier PHP racine ne remplace pas la page React. La configuration doit être éditée dans le `.env` du projet privé, puis ses caches générés retirés comme indiqué plus haut.

Aucun déplacement ou remplacement distant n’a été exécuté par l’agent pendant cette observation.


## 419 malgré une santé 200 et CSRF 204

Contrôler le domaine dans les en-têtes `Set-Cookie`. Le 20/11, le serveur émet encore `domain=.hotel.banguiweb-tech.com` depuis `banguiweb-tech.com` : le navigateur refuse ces cookies et aucun jeton de session ne peut être renvoyé à la connexion.

Dans le fichier actif `/home/jb-hotel-backend/.env`, mettre `SESSION_DOMAIN=null` (sans guillemets), `SESSION_PATH=/` et `SESSION_SECURE_COOKIE=true`. Dans le gestionnaire de fichiers, supprimer uniquement le cache généré `/home/jb-hotel-backend/bootstrap/cache/config.php` s’il existe ; aucune commande nécessaire. Effacer ensuite les cookies enregistrés pour le domaine principal et ses sous-domaines, puis rouvrir la connexion. L’en-tête `Set-Cookie` ne doit plus contenir de domaine explicite ; le cookie sera limité à l’hôte courant.


## Mail de test reçu, autres messages en attente

Vérification directe du 20/11 : 5 messages en attente, 0 en échec dans Paramètres ; 0 tâche cron configurée dans LWS (maximum 1). Le test SMTP est synchrone ; les autres messages attendent un worker.

Dans LWS → Base de données & PHP → Tâches cron, créer une exécution toutes les minutes si l’offre l’autorise (sinon sa fréquence minimale), avec cette commande proposée :

```sh
/opt/php8.2/bin/php /home/jb-hotel-backend/artisan queue:work database --stop-when-empty --max-time=50 --timeout=45 --tries=3
```

Le chemin PHP doit être disponible sur l’hébergement. La [documentation LWS des versions PHP](https://aide.lws.fr/base/Hebergement-web-mutualise/Terminal-web/Comment-changer-la-version-PHP-Terminal-Web-LWS-Panel) décrit `/opt/phpX.Y/bin` et liste PHP 8.2 ; la [gestion cron LWS](https://aide.lws.fr/base/Hebergement-web-mutualise/Outils-web/Comment-creer-une-tache-cron-LWS-Panel) explique le champ Commande. Laravel documente [le traitement jusqu’à file vide](https://laravel.com/docs/12.x/queues#processing-all-queued-jobs-and-then-exiting).

Ne pas ajouter de nouveau script public HTTP ni modifier le SMTP fonctionnel pour résoudre cette absence de traitement. Après activation, contrôler les compteurs de la file et la réception : le compteur seul ne prouve pas la livraison dans la boîte du destinataire. Aucune activation ni aucun envoi effectués par l’agent pendant le diagnostic.
