# Livraison LWS — backend privé dans home

Version du 23 novembre 2026. Elle reprend la version du 22 novembre (corrections hors ligne, facturation automatique, guide de réservation, droits des caissières) et ajoute le **module Sync** (D-069) : journal des changements lu par le logiciel Windows et par l'application web, qui actualisent alors leurs écrans toutes les 30 secondes quand un autre poste travaille. Le frontend inclut aussi le correctif de la copie hors ligne (session gardée quand Internet tombe alors que le Wi-Fi reste actif). Les archives sont des mises à jour de l'installation existante ; aucun .env, contenu de stockage, journal ou export de base n'est livré.

**Nouveau dans cette version, à ne pas oublier :** une migration (`2026_11_23_100000_create_sync_changes_table`, table technique `sync_changes`, aucune donnée existante modifiée) et une vérification supplémentaire : `/backend/api/v1/sync/status` doit répondre 401 sans connexion (404 = backend pas à jour). Si seule l'archive privée est publiée, le module fonctionne pour le logiciel Windows ; l'archive publique est nécessaire pour que l'application web s'actualise aussi.

## Où extraire chaque ZIP

| Archive | Destination dans le gestionnaire LWS | Contenu à retrouver directement |
| --- | --- | --- |
| `jb-hotel-backend-prive.zip` | `/home/jb-hotel-backend/` | `artisan`, `app`, `bootstrap`, `vendor`, `composer.json`… |
| `jb-hotel-public.zip` | `/htdocs/` | `index.html`, `assets`, `.htaccess`, `sw.js`, `backend/index.php`, `backend/.htaccess` |

Le dossier public `/htdocs/backend` contient seulement `index.php` et `.htaccess`. Il charge le projet Laravel privé dans `/home/jb-hotel-backend`. L'adresse API reste `https://banguiweb-tech.com/backend` : ce chemin HTTP ne désigne pas le dossier privé du projet.

Les ZIP n'ont pas de dossier parent supplémentaire : ne pas les extraire dans un nouveau sous-dossier `dist`, `backend` ou `jb-hotel-backend`. Afficher les fichiers cachés pour voir les `.htaccess`. Les dépendances PHP de production sont incluses depuis `composer.lock` ; une installation Composer sur le serveur n'est pas nécessaire pour extraire ces archives.

## Avant le remplacement

1. Sauvegarder la base serveur et les fichiers actuels. Synchroniser les opérations en attente de chaque poste lorsque possible et exporter leur sauvegarde chiffrée. Prévoir une interruption de caisse pendant la bascule.
2. Conserver le `.env` actuel de `/home/jb-hotel-backend` avec son `APP_KEY` et ses identifiants MySQL/SMTP, ainsi que tout son dossier `storage`. Ne pas déplacer le backend : il reste dans `home`.
3. Sauvegarder puis remplacer les dossiers de code et `vendor` du backend par ceux de l'archive privée. Ne pas supprimer le projet complet : cela supprimerait son `.env` et son stockage.
4. Publier les deux archives pendant la même intervention. Dans `htdocs`, conserver les dossiers des autres sites et sous-domaines et les anciens fichiers `assets` jusqu'à fermeture des anciennes sessions. Les fichiers de même nom du build sont à remplacer.

## Configuration et commandes dans le projet privé

Le `.env` serveur doit conserver les réglages de connexion actuels et utiliser notamment :

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://banguiweb-tech.com/backend
APP_TIMEZONE=Africa/Bangui
FRONTEND_URL=https://banguiweb-tech.com
APP_FRONTEND_URL=https://banguiweb-tech.com
VERIFICATION_BASE_URL=https://banguiweb-tech.com/backend
SANCTUM_STATEFUL_DOMAINS=banguiweb-tech.com
SESSION_DOMAIN=null
SESSION_PATH=/
SESSION_SECURE_COOKIE=true
```

Avant la première commande Artisan, retirer uniquement les fichiers PHP générés `config.php`, `routes-*.php`, `packages.php` et `services.php` de `/home/jb-hotel-backend/bootstrap/cache` s'ils existent. En particulier, un ancien manifeste peut référencer les dépendances de développement absentes de cette livraison. Conserver le dossier `bootstrap/cache` et son droit d'écriture ; ne pas toucher au `.env` ni au stockage métier.

Dans le terminal, ouvrir le dossier privé qui contient `artisan`. Le gestionnaire LWS et le terminal peuvent présenter des préfixes différents : utiliser son chemin réel, sans supposer que `/home` est le dossier personnel Unix.

```sh
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan migrate --force
php artisan permission:cache-reset
php artisan config:cache
php artisan view:cache
php artisan queue:restart
```

Employer la version PHP compatible de l'hébergement pour ces commandes et le cron. Les dossiers `bootstrap/cache` et `storage` doivent être inscriptibles par PHP. Ne pas lancer `migrate:fresh`, ne pas régénérer `APP_KEY`, ne pas réinitialiser les rôles ou les données de démonstration. Cette version ajoute une seule migration, `2026_11_23_100000_create_sync_changes_table` (table technique, ajout seul) ; `migrate --force` l'applique avec les éventuelles migrations manquantes. Après `migrate`, vérifier avec `php artisan migrate:status` qu'elle apparaît comme exécutée (« Ran »).

Si le terminal est absent : retirer les caches générés `config.php`, `routes-*.php`, `packages.php` et `services.php` dans le `bootstrap/cache` du backend privé après sauvegarde. Cela ne remplace pas l'application d'éventuelles migrations manquantes ni le redémarrage d'un worker permanent ; ces points doivent être réglés avec l'accès disponible chez l'hébergeur.

Conserver le cron/worker existant s'il est fonctionnel et vérifier qu'il vise bien le fichier `artisan` privé dans `home`. Aucune tâche publique HTTP supplémentaire n'est nécessaire.

Le journal des changements garde 365 jours (`SYNC_RETENTION_DAYS`) ; sa purge quotidienne passe par le planificateur Laravel (`php artisan schedule:run` chaque minute, si ce cron existe). Sans planificateur, rien ne casse : la table grossit lentement (quelques lignes par opération) et `php artisan model:prune --model="App\Modules\Sync\Models\SyncChange"` peut être lancé de temps en temps. Variables facultatives du `.env` : `SYNC_RETENTION_DAYS=365`, `SYNC_COMMIT_LAG_SECONDS=15`, `SYNC_POLL_SECONDS=30`.

## Vérification après publication

- `/backend/api/v1/health` : JSON 200, base accessible.
- `/backend/api/v1/auth/me` sans connexion : JSON 401 ; `/backend/sanctum/csrf-cookie` : 204.
- `/backend/api/v1/sync/status` sans connexion : JSON 401 (404 : module Sync absent ou cache de routes ancien).
- Logiciel Windows : le fermer puis le rouvrir ; écran Synchronisation → Poste Windows, « Changements du serveur » doit afficher « Vérifiés à … » au lieu de « Suivi indisponible ».
- Deux postes ouverts (ou le logiciel et le site) : un encaissement fait sur l'un apparaît sur l'autre en moins d'une minute, sans recharger.
- Connexion d'un administrateur et des caissières concernées, bouton « Nouvelle réservation » selon les droits communs du rôle.
- Réservation confirmée, facture automatique unique, guide, encaissement/reçu et impression sur le poste réel.
- Copie hors ligne préparée en ligne, coupure, réouverture et retour réseau : synchronisation sans doublon.
- Traitement des e-mails par la file et vérification du cron.

Fermer les anciennes fenêtres puis rouvrir l'application en ligne après publication. Ne pas effacer IndexedDB ou les données du site pour forcer une mise à jour : elles peuvent contenir des opérations non synchronisées. Une synchronisation garantie exige que l'application soit ouverte ou rouverte.

Les contrôles locaux réussis et ces archives ne valent pas validation de la configuration distante ou de la recette à l'hôtel. `manifest.json` indique les destinations et les empreintes ; `SHA256SUMS.txt` permet de contrôler les ZIP après transfert. Aucun déploiement distant n'a été effectué pour préparer cette livraison.

## Si « Postes de caisse » et « Mode hors ligne » manquent

Diagnostic du 23 novembre 2026 : ces deux rubriques sont absentes de la session Administrateur observée dans Chrome. Le JavaScript servi en ligne est pourtant strictement identique à celui du ZIP public fourni (empreinte SHA-256 comparée). Les routes API `/backend/api/v1/workstations` et `/backend/api/v1/offline/overview` répondent 404 sans session alors que la version actuelle doit répondre 401 sur ces routes protégées. La route `/backend/api/v1/auth/me` répond bien 401.

Le problème n'est donc pas un oubli de ces écrans dans le build livré : la version active du backend ou son cache de routes reste à actualiser. Les permissions effectives de la session n'ont pas été lues via l'API authentifiée pendant ce diagnostic.

1. Vérifier que le ZIP privé a bien mis à jour `/home/jb-hotel-backend` : notamment `bootstrap/providers.php`, les modules `Workstations` et les migrations `2026_11_21_100000`, `2026_11_21_100100` et `2026_11_22_100000`. Ne pas extraire ce ZIP privé dans `htdocs`.
2. Retirer les anciens caches générés puis exécuter les commandes de mise à jour de la section précédente depuis ce dossier privé. Les migrations créent les tables et attribuent `workstations.manage` et `offline.manage` au rôle administrateur existant ; remplacer le frontend seul ne fait pas cette mise à jour.
3. Contrôler les routes et les migrations, puis recharger l'application en ligne. La lecture des droits est actualisée par le nouveau frontend. Les fichiers publics `/htdocs/backend/index.php` et `.htaccess` doivent rester ceux fournis dans le ZIP public.

Ne pas contourner ce problème en affichant arbitrairement les liens administratifs pour toutes les caissières. Aucun changement distant n'a été effectué pendant le diagnostic.
