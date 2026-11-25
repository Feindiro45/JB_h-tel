# Rapport de travail — JB Hôtel

## Mise à jour automatique de la copie locale — 23/11/2026 (D-070)

Demande : « que le logiciel en local se mette à jour automatiquement, sans que l'utilisateur fasse la synchronisation ; souvent ils peuvent l'oublier ».

**Ce qui se passe maintenant, sans aucun clic** (logiciel Windows et PWA installée) :
- au démarrage et au retour d'Internet : téléchargement complet du poste (« Tout télécharger ») s'il date de plus de 3 h, puis toutes les 3 h ;
- toutes les 15 min : mise à jour des écrans gardés et essentiels ;
- quand un autre poste ou le site change quelque chose : la fiche concernée est relue aussitôt, les écrans dans les 2 minutes (avec le module Sync en ligne) ;
- jamais pendant une coupure, ni tant qu'une opération faite hors ligne n'est pas partie (les reçus/factures provisoires ne sont pas écrasés) ;
- en arrière-plan (40 requêtes/min, la caissière garde la priorité), sans fenêtre d'erreur ; l'historique regroupe les passages réussis. La carte « Tout télécharger » affiche « Mise à jour automatique… », la progression et la dernière date.

Correction au passage : pendant une mise à jour, seules les données qu'elle télécharge étaient censées être silencieuses ; en réalité **toutes** les erreurs d'écran étaient masquées. C'est maintenant limité aux données de la mise à jour.

Preuves : 8 nouveaux tests ; suite frontend **227/227**, types, lint, format ; tests Electron 27/27 ; recette Electron réussie sur les sources **et** l'exécutable empaqueté, avec contrôle que le téléchargement complet automatique a lieu seul après la connexion.

À installer :
- **logiciel Windows** : `electron\release\JB-Hotel-Setup-1.0.1.exe` (s'installe par-dessus la 1.0.0 ; la base du poste est gardée). Fermer le logiciel avant ;
- **serveur LWS** : nouvelle livraison `output/lws/livraison-2026-11-23-e9a16141/` (remplace `livraison-2026-11-23-7cb665ea`, qui porte un fichier « REMPLACEE » ; backend identique, frontend avec D-070). Vérification refaite : intégrité, aucun secret, point d'entrée 200/200/401/401/401/204, caches de production OK. **Aucun déploiement distant effectué.**

Intervalles provisoires (3 h, 15 min, 2 min), modifiables dans `frontend/src/shared/offline/autoLocalUpdate.ts` ; à ajuster avec l'hôtel selon le volume de données et la connexion.

## Livraison LWS avec le module Sync — 23/11/2026

Constat préalable (lecture seule) : le logiciel Windows installé sur ce PC fonctionne déjà avec le serveur distant (connexion, écrans reçus à 09:13, poste enregistré), mais `https://banguiweb-tech.com/backend/api/v1/sync/status` répond 404 : le module Sync n'est pas en ligne, donc pas d'actualisation automatique des changements faits ailleurs.

Livraison préparée sur le modèle du 22/11 : `output/lws/livraison-2026-11-23-7cb665ea/` (**remplacée** par `livraison-2026-11-23-e9a16141`, voir ci-dessus ; empreintes ci-dessous valables pour l'ancienne)
- `jb-hotel-backend-prive.zip` → `/home/jb-hotel-backend/` (15 035 463 octets) : tout le backend actuel, dont le module Sync et la migration `2026_11_23_100000_create_sync_changes_table` ;
- `jb-hotel-public.zip` → `/htdocs/` (552 572 octets) : application web qui lit le journal toutes les 30 s et correctif de la copie hors ligne ;
- `INSTALLATION.md` (guide mis à jour : **une migration à appliquer**, `/backend/api/v1/sync/status` doit répondre 401 après publication), `manifest.json`, `SHA256SUMS.txt`, `VERIFICATION.json`.

Vérifié localement : intégrité et empreintes, aucun `.env`/journal/base, code identique aux sources, vendor de production seul, point d'entrée privé-public 200/200/401 et **401 sur `sync/status` et `sync/changes`**, 204 CSRF, `config:cache` et `view:cache` réussis. Non vérifié : la base MySQL distante et la publication elle-même (**aucun déploiement effectué**).

Après publication : `php artisan migrate --force` (et les autres commandes du guide), puis fermer et rouvrir le logiciel Windows ; Synchronisation → Poste Windows doit afficher « Changements du serveur : Vérifiés à … ».
## Logiciel Windows (Electron) hors ligne d'abord — 23/11/2026 (D-069)

Demande : « analyse tout mon projet et lance ma demande qui est dans le dossier electron », puis, en
votre absence : « fais tout et laisse-moi un rapport ; crée ton plan de travail et choisis la
meilleure option ». Le prompt `electron/PROMPT_IMPLEMENTATION_JB_HOTEL_ELECTRON_OFFLINE.md` a été
suivi dans l'ordre imposé (audit → conception → implémentation → validation → livraison).

### Résultat en une phrase
Un **installateur Windows fonctionnel** existe (`electron/release/JB-Hotel-Setup-1.0.0.exe`, 122 Mo) :
le logiciel s'ouvre sans Internet, garde tout dans une base **SQLite** chiffrée sur le PC, imprime
par l'imprimante du poste, et envoie automatiquement, une seule fois, ce qui a été fait hors ligne
dès que le serveur répond ; la PWA web continue de fonctionner à l'identique et s'actualise
désormais toute seule quand un autre poste travaille.

### Plan de travail suivi
| Étape | Contenu | État |
|---|---|---|
| A. Audit | dépôt, versions, 94 routes API, écrans, règles métier, couche hors ligne existante, frictions Electron, matrice de parité | ✅ `docs/ELECTRON_AUDIT.md` |
| B. Conception | comparaison de deux options, choix argumenté, flux, conflits | ✅ `docs/ELECTRON_ARCHITECTURE.md`, D-069 |
| C1. Socle Electron | fenêtre sécurisée, protocole `app://`, relais API, instance unique | ✅ |
| C2. Base SQLite | schéma, migrations, transactions, chiffrement, sauvegardes, restauration, reprise | ✅ |
| C3. Branchement de l'interface | stockage SQLite/IndexedDB, impression, réveil de Windows, écran « Poste Windows » | ✅ |
| C4. Serveur | module `Sync` (journal ordonné des changements, curseur) | ✅ |
| C5. Actualisation automatique | poste et PWA relisent les écrans touchés toutes les 30 s | ✅ |
| D. Validation | tests unitaires, intégration, recette Electron réelle ×3, non-régression | ✅ |
| E. Livraison | installateur, mises à jour, documents, CI | ✅ (canal de mise à jour et signature à fournir) |

### Option choisie (à confirmer par vous)
**Option A — même application, base SQLite derrière la couche hors ligne existante.** Le logiciel
Windows affiche exactement l'application React actuelle (aucun écran dupliqué) ; toutes les règles
déjà écrites et testées pour le hors ligne (réservation, prix, chambres libres, factures provisoires,
file d'envoi idempotente) sont réutilisées ; seul le stockage change (IndexedDB du navigateur →
SQLite sur le disque). Option B écartée : recopier les tables MySQL et recoder les règles dans
Electron aurait créé un second produit divergent (interdit par le prompt) pour plusieurs semaines de
travail et un risque d'écarts de calcul. La base SQLite garde donc la file des opérations, la copie
des écrans (par module), la numérotation provisoire, un journal et les impressions, et non une
réplique des tables MySQL : c'est l'écart principal avec la lettre du prompt, à valider.

### Ce qui a été fait
- **`electron/`** (nouveau) : Electron 45.4.1 ; `node:sqlite` intégré (pas de module natif à recompiler).
  - Interface servie depuis les fichiers installés (`app://jbhotel/`), CSP stricte, sandbox, isolation,
    navigation et fenêtres limitées, aucune API Node dans React.
  - **Relais de l'API** dans le processus principal : cookies Sanctum, jeton CSRF et origine gérés
    côté Electron → **aucun changement d'authentification sur le serveur**.
  - **Base `%APPDATA%\JBHotel\jbhotel.sqlite`** : une transaction par écriture (opération + numéro
    `LOC-…` + copie), WAL et écriture disque garantie, opération acceptée définitive et numérotation
    jamais en recul (triggers), journal immuable, contenu chiffré AES-256-GCM avec une clé protégée
    par Windows (DPAPI).
  - **Sauvegardes** quotidiennes vérifiées (30 gardées), avant migration/mise à jour/restauration,
    copie sur clé USB, restauration qui conserve les opérations plus récentes, **reprise automatique**
    d'une base endommagée (fichier mis de côté, dernière sauvegarde valide restaurée, alerte).
  - **Impression 80/58 mm** par l'imprimante choisie (mode direct possible), imprimante absente
    signalée en français, impressions et réimpressions notées.
  - **Mises à jour** du logiciel par electron-updater (canal HTTPS à créer), sauvegarde avant
    installation, base jamais touchée.
  - **Installateur NSIS** par utilisateur, raccourcis Bureau/Démarrer, données gardées à la désinstallation.
- **Frontend** : `shared/desktop/bridge.ts` (contrat), `storage.ts` (SQLite sur le poste, IndexedDB
  sur le web, mêmes fonctions), `serverChanges.ts` (changements du serveur), écran
  **Synchronisation → Poste Windows** (base, chiffrement, sauvegardes, restauration, imprimante,
  mise à jour), impression du ticket par le poste, synchronisation au réveil de Windows.
- **Backend** : module `app/Modules/Sync` en lecture seule — table `sync_changes` remplie dans la
  transaction de chaque écriture (événements Eloquent, aucune donnée personnelle),
  `GET /api/v1/sync/status`, `GET /api/v1/sync/changes?cursor=` (curseur sûr, filtrage par droit,
  pagination, 410 si trop ancien, conservation 365 jours, purge planifiée). Migration additive
  `2026_11_23_100000` **appliquée sur la base locale `jb_hotel`** (aucune autre base touchée hors tests).
- **Correctif utile aussi à la PWA**, trouvé pendant la recette : si le serveur est injoignable mais
  que le réseau local répond (Internet coupé, Wi-Fi actif), la session disparaissait de la copie et
  le redémarrage suivant renvoyait à la connexion. La copie garde maintenant les données déjà reçues.
- **CI** : nouveau job « Poste Windows (Electron, SQLite) » (types, 27 tests, build).

### Preuves (commandes réellement exécutées)
| Contrôle | Résultat |
|---|---|
| `electron` : `npm test` / `npm run typecheck` | ✅ 27/27 / ✅ |
| `electron` : recette réelle (connexion par le relais, copie SQLite, 2 redémarrages sans serveur, encaissement en file locale, envoi unique au retour, journal des changements) | ✅ sur les sources, ✅ sur l'exécutable empaqueté, ✅ sur la version installée par l'installateur (puis désinstallée proprement) |
| `electron` : `npm run dist` | ✅ `JB-Hotel-Setup-1.0.0.exe` |
| `backend` : `php artisan test` / Pint / Larastan | ✅ 280/280 (8 nouveaux) / ✅ / ✅ |
| `frontend` : `npm test` / lint / format / types | ✅ 219/219 (13 nouveaux) / ✅ / ✅ / ✅ |
| `frontend` : `npm run test:e2e:offline` (non-régression PWA hors ligne) | ✅ 2/2 |
| `frontend` : `npm run test:e2e` (10 parcours en ligne) | ✅ 10/10 (dont le ticket 80/58 mm) |

Détail : `docs/TEST_REPORT.md`.

### Pour l'essayer sur ce PC
- Installateur : `electron\release\JB-Hotel-Setup-1.0.0.exe` (Windows affichera « Éditeur inconnu » :
  « Informations complémentaires » → « Exécuter quand même »). Il vise le serveur de production
  `https://banguiweb-tech.com/backend` : **le module Sync n'y est pas encore déployé** (le logiciel
  l'ignore alors sans erreur) et l'origine `https://banguiweb-tech.com` doit être autorisée par Sanctum (c'est normalement déjà le cas).
- Contre l'API locale : `cd electron`, `npm run build`, puis
  `npx electron . --server=http://localhost:8000 --origin=http://localhost:5173`
  (dans VS Code, retirer d'abord `ELECTRON_RUN_AS_NODE` : `Remove-Item Env:ELECTRON_RUN_AS_NODE`).

### Décisions à prendre / points À CONFIRMER
1. **Valider l'option A** (D-069), notamment le fait que la base locale ne recopie pas les tables MySQL.
2. **Canal de mise à jour** : créer un dossier HTTPS (proposé `https://banguiweb-tech.com/desktop/`) ;
   reconstruire avec `JBH_UPDATE_URL`.
3. **Signature du code** : sans certificat, SmartScreen avertit à chaque installation.
4. **Temps réel** : impossible sans WebSocket sur l'hébergement mutualisé ; actualisation toutes les 30 s en place.
5. **Déploiement serveur** : migration `sync_changes` + module Sync (avec la livraison LWS en attente).

### Limites connues et reste à faire
- Non testé faute de matériel : impression papier sur l'imprimante thermique de l'hôtel, coupure
  réelle de la carte réseau, redémarrage complet de Windows, installation sur un Windows vierge
  (procédure : `docs/RECETTE_HORS_LIGNE.md` § 3 et `docs/GUIDE_POSTE_WINDOWS.md`).
- Une sauvegarde du poste ne se restaure que sur le même compte Windows (clé DPAPI) ; la sauvegarde
  des opérations chiffrée par mot de passe reste le moyen de changer de PC.
- Pas de compteur d'essais pour le déverrouillage local (protection par le coût PBKDF2).
- Rien n'a été commité ni poussé (le dépôt contenait déjà beaucoup de changements D-067/D-068 non commités).

Documents livrés : `docs/ELECTRON_AUDIT.md`, `ELECTRON_ARCHITECTURE.md`,
`SQLITE_SCHEMA_AND_MIGRATIONS.md`, `SYNC_PROTOCOL.md`, `OFFLINE_SECURITY.md`,
`WINDOWS_BUILD_AND_INSTALL.md`, `TEST_REPORT.md`, `GUIDE_POSTE_WINDOWS.md` ; mis à jour :
`DECISIONS.md` (D-069), `SCHEMA.md`, `CHANGELOG.md`, `RECETTE_HORS_LIGNE.md`, `CHECK_LEVEL.md`, `CLAUDE.md`.

## Sessions précédentes

## PWA en ligne — 23/11/2026

La PWA est intégrée au build : manifeste `standalone`, service worker, gestion de l'installation et panneau « Installation sur ce poste » dans Synchronisation. Contrôle HTTP public actuel : manifeste et service worker 200, identiques au ZIP public livré ; les quatre icônes déclarées répondent cependant 404. Elles sont bien incluses dans le ZIP complet. Ce défaut de publication peut empêcher la proposition d'installation Chrome/Edge ; il est distinct des routes backend manquantes.

Correctif préparé sans modification du code ni déploiement : `output/lws/livraison-2026-11-22-300b79bf/correctif-pwa-public.zip` (34 979 octets), à extraire directement dans `/htdocs/`. Contient uniquement manifeste, service worker et quatre icônes, pris dans le build vérifié. Intégrité ZIP, empreinte et dimensions PNG validées ; instructions dans `INSTALLATION-PWA.md` et `docs/CORRECTIF_PWA_LWS.md`. Preuves : `output/diagnostic-pwa-en-ligne-2026-11-23.json`, `VERIFICATION-PWA.json` dans la livraison. Aucun statut d'installation du navigateur de l'utilisateur ni fonctionnement hors ligne réel du site distant confirmé par cette seule vérification de ressources.

## Diagnostic du menu en ligne — 23/11/2026

À la demande de l'utilisateur, session Chrome existante consultée sur `https://banguiweb-tech.com/tableau-de-bord`, rôle affiché Administrateur. Les rubriques « Postes de caisse » et « Mode hors ligne » sont absentes ; les autres liens de gestion sont présents. Consultation seule : aucune réservation, modification de rôle, publication ou donnée changée.

Contrôle HTTP public en temps réel : le script `assets/index-BPd06XTm.js` distribué en ligne est identique octet pour octet à celui du ZIP livré (814 113 octets, SHA-256 `ecc9f732e7d904d190e12e8979d2f6cbb9f79d8d7cb7f1ab41f2cf2343cbe616`). Il contient les routes des deux écrans et leurs permissions. Les routes serveur `/backend/api/v1/workstations` et `/backend/api/v1/offline/overview` répondent cependant 404 sans session, tandis que `/backend/api/v1/auth/me` répond 401. La version courante locale expose ces trois routes et doit renvoyer 401 sans authentification.

Conclusion : la livraison du frontend est complète pour ces rubriques ; la mise à jour du backend actif et/ou de son cache de routes reste à terminer. Les permissions effectives du compte n'ont pas été lues par une requête authentifiée ; le statut réel des migrations distantes n'a pas été consulté. Vérifier le code privé dans `/home/jb-hotel-backend`, ses caches et les migrations des postes/mode hors ligne qui ajoutent aussi les droits administrateur. Guide actualisé : `docs/LIVRAISON_LWS_HOME.md`, recopié dans la livraison. Preuve : `output/diagnostic-menu-en-ligne-2026-11-23.json`.

## Livraison préparée — backend privé dans home — 22/11/2026

Emplacement confirmé par l'utilisateur : projet Laravel privé dans `home`, et non dans `htdocs`. La livraison conserve `/home/jb-hotel-backend` pour Laravel ; `/htdocs/backend` reçoit seulement le point d'entrée PHP et son `.htaccess`. L'API reste accessible sur `https://banguiweb-tech.com/backend`.

Archives actuelles dans `output/lws/livraison-2026-11-22-300b79bf/` : `jb-hotel-public.zip` pour `/htdocs/` (548 986 octets), `jb-hotel-backend-prive.zip` pour `/home/jb-hotel-backend/` (15 025 554 octets), `INSTALLATION.md`, manifeste et empreintes SHA-256. Elles intègrent les corrections hors ligne, la facture automatique, le guide et l'actualisation des droits. Les anciennes archives de `output/lws` et `frontend/dist.zip` ne sont pas cette livraison.

Le build frontend est reconstruit avec la racine API de production et le fuseau de Bangui. Les 83 dépendances PHP de production proviennent du verrou Composer, installées dans un dossier isolé sans modifier le vendor de développement. Aucune dépendance de développement, aucun `.env`, journal, stockage métier ou export SQL inclus. Le guide demande de conserver le `.env` et `storage` du serveur et de retirer ses anciens caches générés avant les commandes Artisan. L'assemblage peut être refait via `python infra/build_lws.py --date 2026-11-22`.

Intégrité ZIP et empreintes vérifiées après extraction ; fichiers applicatifs comparés aux sources courantes, absence de secrets et données de travail contrôlée. Le véritable point d'entrée public extrait charge bien le projet dans `home` : racine et santé 200, utilisateur sans session 401, CSRF 204. `config:cache` et `view:cache` réussissent avec le vendor de production. Ces vérifications utilisent une base SQLite en mémoire, le cache/session en mémoire et le mailer tableau ; elles ne valident pas la connexion MySQL distante. Preuves : `VERIFICATION.json` dans le dossier de livraison et `output/lws/verification-2026-11-22.log`.

Aucun accès à la base métier ni transmission d'e-mail ou publication distante pendant la préparation. La recette de production et les validations restantes décrites plus bas restent à effectuer.

## Droits communs aux caissières — 22/11/2026

Tous les comptes portant le rôle `caissiere` partagent les permissions de ce rôle. Le catalogue par défaut inclut `reservations.create`. Deux créations par l'API de test confirment des permissions identiques ; une modification du rôle se retrouve sur les comptes existants et un troisième compte créé ensuite. Les réglages communs personnalisés par l'administrateur sont conservés.

Un défaut de session a été identifié dans le code : les permissions de `/auth/me` pouvaient rester en cache dans une fenêtre ouverte sans relecture périodique. L'interface relit désormais ces droits au retour sur la fenêtre, au retour réseau et toutes les 30 secondes avant l'envoi des opérations en attente. Une panne conserve les derniers droits connus. L'administration explique explicitement que les droits sont communs à toutes les caissières.

La cause exacte du bouton absent sur certains comptes de **banguiweb-tech.com n'a pas été confirmée** : aucune consultation authentifiée concluante du site ni comparaison des comptes distants. Aucun droit distant n'a été modifié et aucun déploiement n'a été effectué. La correction traite le défaut de cache reproduit par les tests locaux.

Validation : **20 tests backend ciblés, 97 assertions**, **206 tests frontend réussis sur la suite complète** (dont trois nouveaux tests de droits : attribution/retrait pendant une session ouverte, restauration puis actualisation au démarrage, maintien des droits hors ligne). Pint, types, lint, format et build réussis. Trace frontend : `output/frontend-permissions.log`. Les 271 tests backend du lot précédent n'ont pas été rejoués intégralement pour ce complément ; seuls le test de rôle et celui d'administration des comptes ont été relancés.

## Corrections hors ligne et réservation guidée — 22 novembre 2026

**Plan exécuté :** [PLAN_CORRECTIONS_OFFLINE_RESERVATIONS.md](docs/PLAN_CORRECTIONS_OFFLINE_RESERVATIONS.md). Décisions D-067 et D-068 dans `docs/DECISIONS.md`.

### Fonctionnement livré localement

- **Hors ligne conservé.** File d'opérations, compteur provisoire, facture locale et copie des écrans enregistrés dans une même transaction IndexedDB. Ajouts/accusés/restaurations concurrents ne remplacent plus toute une ancienne version de la file. Un stockage indisponible produit une erreur au lieu d'annoncer un encaissement durable.
- **Synchronisation automatique.** Reprise à l'ouverture, au retour de l'API, au retour sur la fenêtre et périodiquement en ligne ; coordination entre onglets. Erreurs temporaires et sessions expirées conservent la file ; reconnexion de l'auteur pour reprendre. Les identités serveur ne sont plus supprimées à 30 jours : un ancien rejeu conserve son reçu et ne crée aucun double paiement.
- **Sécurité.** URL API imposée et sauvegardes validées après déchiffrement ; méthodes/chemins liés au type d'opération, limites de taille et paramètres cryptographiques. Une délégation de gestion des utilisateurs ne permet plus d'obtenir/créer un compte administrateur ni de modifier un compte administrateur. Les copies locales de `.env` sont également exclues de Git.
- **Tarifs contrôlés.** Une date client ne permet plus d'obtenir librement un ancien prix. Écart de tarif ou de montant observé : opération conservée avec refus `offline_rate_review`, à examiner par l'administrateur, sans changement silencieux de montant. Les dates historiques d'un rejeu borné permettent la reprise après plusieurs jours de coupure.
- **Facture automatique.** Création d'une réservation confirmée ou confirmation d'une réservation en attente : facture unique dans la même transaction. Échec de facture : opération annulée intégralement. Hors ligne, ticket provisoire sauvegardé avec le séjour, puis référence définitive reçue ; le ticket local reste disponible jusqu'au téléchargement du définitif. L'ancien endpoint retrouve une facture active, ce qui évite les doublons des anciens clients/files.
- **Guide de réservation.** Après création, focus sur cinq étapes : réservation, facture, arrivée, encaissement/reçu et départ. Prochaine action et boutons selon l'état réel et les droits, ticket directement accessible. Paiement différé conservé ; aucune arrivée, paiement ou sortie enregistrée automatiquement.
- **Documents et corrections.** Les instantanés restent figés ; la facture indique « Solde à l'émission », tandis que caisse et reçu montrent le solde courant. Les avoirs et remplacements sont conservés. Une réservation facturée se corrige par un compte autorisé à émettre un avoir, selon D-058 ; l'émission automatique ne donne aucun droit supplémentaire à la caissière.

### Vérifications terminées

| Contrôle | Résultat |
|---|---|
| Suite backend complète | **271/271**, 2 221 assertions |
| Suite frontend complète | **203/203** |
| Pint, Larastan, lint, types, Prettier, build | Réussis |
| Navigateur en ligne | 2 parcours concernés réussis : création/administration/rapports et tickets 80/58 mm |
| Navigateur hors ligne, build de production | Conflit entre postes réussi ; parcours complet réussi après adaptation du sélecteur du ticket provisoire : réouverture, verrou, facture et retour réseau |
| Régressions d'audit | 3 tests PHP et 5 frontend réussis |
| Vrai IndexedDB dans Edge | Un et deux onglets : aucune perte, numéros distincts |
| Serveur Vite déjà actif | Quatre routes et rechargement vérifiés sans erreur JavaScript |
| Présentation du guide | Capture réelle bureau inspectée ; adaptation mobile définie dans le CSS |

Un test d'export réel Excel attendait seulement une seconde ; son attente a été adaptée au chargement d'ExcelJS et à la fabrication du classeur. La suite frontend finale entière passe. Le build avertit toujours de la taille des fichiers JavaScript. L'avis npm modéré transitif ExcelJS/uuid, sans exploitation démontrée sur l'usage v4 du projet, et les paquets Composer abandonnés restent suivis ; la CI ajoute les contrôles de vulnérabilités et les parcours hors ligne. Le workflow distant n'a pas été exécuté pendant cette correction.

### Livraison et limites

Corrections et build actuels **locaux** ; aucune publication distante, remise à zéro de la base de travail ou transmission réelle d'e-mail. Les suites n'utilisent que leurs bases isolées. Pas de migration SQL ni d'effacement du stockage local requis ; le serveur doit conserver `idempotency_keys`.

Pour la mise en ligne, livrer ensemble backend et frontend, sauvegarder/synchroniser les opérations en attente, fermer les anciennes fenêtres puis rouvrir en ligne la nouvelle version et préparer sa copie hors ligne. Les anciennes archives de livraison présentes dans l'espace de travail ne sont pas des livraisons de cette correction. Voir `docs/EXPLOITATION.md`.

Restent : validation de l'hôtel (dont facturation/ticket), imprimante et postes réels, exploitation SMTP/worker, sauvegardes/restauration et runtime de l'hébergeur ; autres points de l'audit de sécurité hors du plan ciblé. L'application doit être ouverte ou rouverte pour la reprise garantie ; application fermée, la synchronisation dépend du navigateur. Les divergences de tarif, conflits entre postes et rejeux historiques hors fenêtre de 62 jours exigent un traitement administratif explicite. Le stockage des opérations reste sans expiration et leur sauvegarde chiffrée est conservée.

---

## Historique des vérifications précédentes

**Dernière vérification : 22 novembre 2026 — préparation à la production.**

**Verdict : mise en production déconseillée en l'état.** Le build et les analyses statiques passent, mais des risques de perte ou de doublon d'encaissements hors ligne et plusieurs faiblesses de sécurité ont été identifiés. Le site public répond et sa santé API annonce une base accessible ; cela ne valide pas les traitements financiers ni l'exploitation.

Le [rapport de production détaillé](docs/AUDIT_PRODUCTION_2026-11-22.md) donne les preuves, les conditions d'exploitation, les résultats des commandes et l'ordre de correction. Aucune correction applicative ni modification distante n'a été faite. Les affirmations des anciens rapports ci-dessous décrivent leurs sessions respectives et ne valent pas validation de production actuelle.

Contrôles de cette session : 263 tests backend réussis ; build, types, lint, format et analyse statique réussis ; deux scénarios hors ligne réussis. La suite frontend donne 194 réussites sur 196 et les parcours navigateur 9 sur 10 ; les cas en échec passent à la relance ciblée, sans correction. Huit reproductions d'audit confirment des faiblesses, dont un double paiement après purge à 30 jours. La perte d'opération et les numéros provisoires en double sont aussi reproduits avec le vrai IndexedDB dans Edge. `npm audit` conserve deux entrées modérées pour un même avis transitif.

---

## Rapport de la session précédente

**Date :** 22 novembre 2026.
**Objet :** tes trois dernières demandes :
- « retire les factures A4 et reçus et les boutons imprimer la page » ;
- « le client recevra le ticket par mail au lieu de la facture » ;
- « des exports Excel avec un bon design sur chaque module ».

Tu as aussi rappelé l'exigence SOLID et DTO.

## En bref

- **Ticket 80 mm seul (D-065).** Plus de facture A4, plus de reçu A4, plus de boutons « Imprimer » sur les pages.
  - Le client reçoit par e-mail le **ticket de sa facture en PDF** : une seule bande de 80 mm, avec le QR code de vérification.
  - Le ticket imprimé à la caisse porte le même QR code.
- **Exports Excel (D-066).** Chaque écran a un bouton **« Exporter (Excel) »** qui reprend les filtres de l'écran.
  - Chaque classeur commence par une feuille **Tableau de bord** : indicateurs, tableaux de synthèse et vrais graphiques Excel.
  - Les feuilles suivantes contiennent les données mises en forme.
  - **Sans réseau**, le poste construit lui-même un classeur simplifié à partir des données gardées.
- **SOLID et DTO.** Tu avais raison de poser la question : mes premiers contrôleurs d'export ne respectaient pas la règle. Ils sont refaits (détail en partie 3) et la règle est inscrite dans `CLAUDE.md` pour la suite.
- **Contrôles :** tout est vert : 263 tests backend, 195 tests frontend, 10 parcours navigateur (dont le téléchargement réel d’un classeur et le ticket avec QR code), 2 parcours hors ligne de production, analyse statique et mise en forme.

## 1. Ticket 80 mm à la place de l'A4 (D-065)

| Avant | Maintenant |
|---|---|
| Facture PDF A4 (lien « PDF » et « PDF A4 ») | Retirée. Le ticket 80 mm est le seul format |
| Reçu A4 (`/documents/recus/…`) | Retiré. L'ancienne adresse ouvre le ticket du reçu |
| Boutons « Imprimer », « Imprimer le journal » | Retirés. Seuls les tickets s'impriment |
| E-mail au client : facture A4 jointe | E-mail au client : `ticket-FAC-….pdf` joint, une seule bande, QR code |
| QR code seulement sur l'A4 | QR code sur le ticket (e-mail et caisse) |

Inchangé : factures et avoirs figés, numéros, avoirs, vérification publique par le QR code, exports CSV et PDF des rapports.

**À valider avec l'hôtel :** qu'un ticket 80 mm suffise comme facture pour les clients et la comptabilité (questions fiscales Q-09 et Q-16).

## 2. Exports Excel (D-066)

| Écran | Feuilles après le tableau de bord | Sans réseau |
|---|---|---|
| Réservations | Réservations, Occupants | Oui |
| Clients | Clients | Oui |
| Caisse | Mouvements, Par jour, Par moyen | Oui (période déjà ouverte) |
| Factures et reçus | Documents (avoirs en négatif) | Oui |
| Rapports | Par jour, Par catégorie, Soldes à encaisser, Définitions | Non |
| Chambres et Tarifs | Chambres, Catégories, Tarifs (toutes les versions) | Non |
| Utilisateurs | Utilisateurs (sans mot de passe) | Non |
| Journal d'audit | Journal | Non |
| Postes de caisse | Postes, Désignations | Non |
| Mode hors ligne | Opérations rejouées | Non |

**Présentation de chaque classeur :**
- bandeau vert et or avec les filtres, la date et l'auteur ;
- montants en FCFA entiers et dates au format jour/mois/année ;
- filtres automatiques et en-tête figé ;
- totaux qui suivent les filtres ;
- impression paysage à la largeur de la page.

**Classeur sans réseau :**
- même présentation, sans graphiques (des barres dans les cellules les remplacent) ;
- la mention « Données gardées sur ce poste » sur chaque feuille ;
- « Tout télécharger pour le hors ligne » prépare aussi l'outil des classeurs.

**Sécurité :**
- chaque export exige le droit de son écran ;
- un texte saisi qui commence par « = » reste du texte, jamais une formule ;
- le classeur des clients rappelle qu'il contient des données personnelles.

## 3. SOLID et DTO

Pour chaque module, la chaîne est désormais la même :
1. une requête validée (FormRequest) ;
2. un objet de filtres typé (DTO), le même pour la liste et pour l'export ;
3. une seule requête de lecture, partagée ;
4. une classe d'export qui ne fait que le rendu Excel ;
5. un contrôleur d'une ligne.

Les doublons sont supprimés (requêtes copiées, validations répétées, appels d'un contrôleur à un autre). La règle est écrite dans `CLAUDE.md` et gardée en mémoire.

## 4. Page Paramètres redessinée

Suite à ta remarque « cette version est moche » :
- une **colonne Domaines** à gauche (Remises, Encaissements, Réservations, Facturation, Hors ligne, Postes de caisse, E-mails), avec le nombre de règles et un point orange quand il y en a à valider ;
- une **recherche** (« Remise », « D-016 »…) et un filtre **Afficher** : à valider, validées, modifiables ;
- chaque domaine dans une **section à sa couleur**, et chaque règle dans une **carte** : valeur en grand, statut, référence, « Modifier » ou « Fixé par décision » ;
- corrigé : la liste « Opérations permises sans Internet » écrasait le texte de la règle ;
- sur tablette et mobile, les domaines deviennent une bande qui défile et les filtres passent l’un sous l’autre.

Aucune règle ni valeur n’a changé : seule la présentation est nouvelle.

## Ce qui reste

- **Hôtel :** ticket 80 mm comme seule facture (Q-09, Q-16), essais sur l'imprimante (5.2 du hors ligne).
- **Commits :** lot 5, D-065 et D-066 commités (`ea73cf3`, `63b9719`), ainsi que le déploiement LWS (`db26222`). Restent hors des commits : `Nouveau dossier/` et `backend/.env copy.example` (vrais secrets), `output/` et `frontend/dist.zip` (fichiers générés).

---

# Rapports précédents

**Date :** 20 novembre 2026.
**Objet :** tout ce qui a été fait pendant ton absence, puis le bilan de la journée. Ta dernière demande était : « ajoute les pages d'erreur 404, 505, etc. avec un design et le message », et « un bon design pour la page Paramètres du système » (décision D-060).

## En bref

- Les **pages d'erreur** sont en place, dans l'application comme sur les liens publics (QR code de facture, liens des e-mails).
- La **page Paramètres** est redessinée : règles rangées par domaine, valeurs et statuts lisibles.
- **Tous les contrôles sont verts** : 234 tests backend, 109 tests frontend, 8 parcours navigateur, analyse statique et mise en forme. La CI GitHub du commit précédent est verte, et celui de ce soir est poussé (voir plus bas).
- **Rien à faire de ton côté pour le code.** Il reste seulement des validations de l'hôtel (liste en fin de rapport).

## 1. Pages d'erreur (D-060)

### Dans l'application (personnel connecté)

Chaque page affiche le code en grand, un titre clair, une explication, une aide et des boutons pour repartir :

| Cas | Titre | Boutons |
|---|---|---|
| Adresse inconnue (404) | Page introuvable | Retour à l'accueil, Page précédente |
| Écran non autorisé pour le rôle (403) | Accès refusé | Retour à l'accueil |
| Compte sans aucun écran attribué | Accès à configurer | Aucun : l'aide invite à contacter l'administrateur (la déconnexion reste dans le menu) |
| Panne inattendue de l'écran (500) | Erreur inattendue | Recharger la page, Retour à l'accueil |

Aucun détail technique n'est jamais affiché.

### Sur les liens publics (client ou personnel hors de l'application)

Ce sont les pages qu'on voit par exemple en scannant un QR code abîmé ou en ouvrant un lien expiré. Elles reprennent le bandeau vert et or de l'hôtel et son contact :

- **403** Accès refusé, **404** Page introuvable, **419** Page expirée, **429** Trop de demandes ;
- **500** Erreur interne, **503** Service momentanément indisponible ;
- **pages génériques** pour les autres codes : un **505**, par exemple, affiche « 505 » avec un message adapté.

Deux choix de prudence :
- ces pages **ne renvoient pas vers l'écran de connexion du personnel**, car un client peut les voir ; elles proposent « Revenir en arrière », et « Réessayer » quand l'erreur est passagère ;
- en production, le message technique de l'erreur n'apparaît jamais. Un test le vérifie.

## 2. Page Paramètres

- **En haut :** la vue d'ensemble (nombre de règles, validées, provisoires, modifiables) et une légende des trois états : Validé, Provisoire, Fixé par décision.
- **Règles rangées par domaine :** Remises, Encaissements, Réservations, Facturation et caisse.
- **Pour chaque règle :**
  - la valeur en grand (par exemple « 10 % », « 12 h », les moyens de paiement en pastilles) ;
  - son statut ;
  - sa référence (D-016, Q-06…) ;
  - la date de sa dernière modification.
- **Bouton « Modifier » :** il n'apparaît que pour les deux règles modifiables, le plafond de remise et les moyens de paiement. Les autres affichent « Fixé par décision ».
- **En bas :** le panneau « Envoi des e-mails », avec le test d'envoi.

Aucune règle ni aucune valeur n'a changé : c'est uniquement la présentation. J'ai contrôlé l'affichage sur PC et sur téléphone.

## 3. Rappel de la journée

| Décision | Ta demande | Ce qui est en place |
|---|---|---|
| D-053 | Une réservation annulée restait comptée dans la caisse ; la prolongation ne refaisait pas la facture | L'annulation rembourse l'encaissé et crédite la facture (payée ou non). La prolongation remplace la facture par une nouvelle facture détaillée : séjour initial + prolongation. |
| D-054 | Envoi réel des e-mails | SMTP de l'hébergeur, alerte à chaque connexion, invitation ou bienvenue à la création d'un compte. Chaque envoi est retenté pendant 24 h, avec un bouton « Relancer les envois en échec ». |
| D-058 | Correction des erreurs de la caissière ; « Supprimer » réservé à l'administrateur | La caissière annule ses encaissements du jour et modifie une réservation avant le séjour. L'administrateur supprime définitivement, avec avertissement, motif et copie au journal. Encaissements et factures ne se suppriment jamais. |
| D-059 | Beau design pour la vérification de facture, le mot de passe oublié et la connexion ; vérifier que le compte existe avant d'envoyer le lien | Pages redessinées. Le compte est vérifié avant l'envoi : introuvable, désactivé ou adresse non joignable sont signalés. Le lien est valable 60 min et à usage unique. |
| D-060 | Pages d'erreur et page Paramètres | Voir plus haut. |

## 4. E-mails : état actuel

- **Authentification SMTP :** l'autre session a rétabli l'authentification auprès de l'hébergeur (les premiers essais étaient refusés, erreur 535). Une invitation réelle est partie.
- **Ce soir :**
  - la file d'attente est vide, sans aucun échec ;
  - le worker de l'application tourne ;
  - la configuration utilise le SMTP de l'hébergeur (port 465, connexion chiffrée).
- **À confirmer de ton côté :** la **réception** dans la boîte du destinataire. Pense aussi à vérifier le dossier « Spam ».
- **Si l'ordinateur redémarre :** relance `composer queue` dans `backend/`, sinon les e-mails attendent dans la file sans partir.

## 5. Vérifications de ce soir

| Contrôle | Résultat |
|---|---|
| Tests backend (base MariaDB de test) | 234 réussis, dont 3 nouveaux sur les pages d'erreur ; Pint et Larastan sans erreur |
| Tests frontend | 109 réussis, dont 2 nouveaux sur les pages d'erreur et le test Paramètres réécrit ; lint, Prettier, TypeScript et build verts |
| Parcours navigateur (vrai serveur, base de recette isolée) | 8 réussis, dont 1 nouveau qui contrôle les pages 404 (application et serveur), leur accessibilité et l'affichage mobile |
| Accessibilité | Le premier passage a trouvé un gris trop pâle sur la page Paramètres (« Modifié le… », « Fixé par décision ») : contraste 4,41 au lieu de 4,5 minimum. Corrigé (5,56), puis toute la suite rejouée avec succès |
| Captures | Paramètres, erreur 404 de l'application et erreur 404 du serveur, sur PC et sur mobile, inspectées |

Ta base de travail n'a pas été touchée : les captures ont été faites sur la base de recette isolée.

## 6. CI GitHub

- Le commit précédent (D-059) est **vert** : backend avec MySQL 8.4 et parcours navigateur, frontend.
- Le commit de ce soir (D-060, `d742202`) est **vert** lui aussi : backend avec MySQL 8.4 et les 8 parcours navigateur, frontend.

## 7. Ce qui reste (hors code)

- **Hôtel :**
  - valider les règles provisoires (priorité P1) ;
  - frais d'annulation (Q-14) ;
  - mentions légales de la facture ;
  - essai d'impression sur papier des factures et reçus.
- **E-mails :** confirmer la réception réelle, puis garder le worker lancé (`composer queue`).

## Complément — configuration du test LWS cPanel

L’utilisateur a précisé l’hébergement **LWS mutualisé cPanel** et le domaine **banguiweb-tech.com**. Deux modèles sans secrets ont été préparés : `backend/.env.production.example` et `frontend/.env.production.example`, avec `hotel.banguiweb-tech.com` pour l’interface et `api.hotel.banguiweb-tech.com` pour Laravel. Ils sont cohérents pour les cookies Sanctum, les invitations, les QR et les e-mails. Huit contrôles Dotenv ont réussi. La procédure détaillée, y compris le cron pour la file d’e-mails, figure dans `docs/EXPLOITATION.md`. Aucun domaine, secret local, serveur ou base de production n’a été modifié.

La demande de login simple sans image a également été contrôlée : carte centrée sur fond clair, captures PC et mobile inspectées, 4 tests d’authentification et 1 test navigateur réussis, ainsi que build, lint et contrôle du serveur actif. Les évolutions déjà présentes des écrans d’accès et les autres travaux du projet ont été conservés.

## Diagnostic de la connexion en ligne — 20 novembre 2026

Les contrôles HTTP identifient une API qui sert encore la page d’attente LWS, avec des routes en 404 et des requêtes OPTIONS génériques sans CORS. Le panneau observé est LWS Panel Perso, pas cPanel. L’utilisateur confirme le backend dans `/htdocs/api.hotel.banguiweb-tech.com`. L’accès direct à `public/index.php` atteint Laravel et présente les bons en-têtes CORS.

Le journal fourni identifie aussi l’erreur 500 : `DB_HOST=localhost` et base/utilisateur d’exemple `CPANELUSER_...`. La correction préparée comprend le routage racine vers `public`, le `.htaccess` original dans `public`, la saisie des vraies valeurs MySQL du panneau et le rechargement de la configuration. Le fichier racine prêt à copier est `infra/lws/api-root.htaccess`. Aucun secret ni correctif distant n’a été envoyé.

Les 3 tests CORS Laravel passent (10 assertions). Leur première exécution utilisait la configuration de production copiée dans l’environnement local ; une réexécution avec des variables de test explicites a réussi, sans réécrire le `.env`. Un essai complémentaire de serveur Apache temporaire a été refusé par l’outil d’exécution ; aucune validation Apache locale n’est revendiquée. Les contrôles finaux en ligne restent dépendants de l’application du correctif et des identifiants réels sur l’hébergement.

## Rechargement des routes React en ligne

À la demande de l’utilisateur, `frontend/public/.htaccess` a été ajouté. Il est copié automatiquement dans `frontend/dist/.htaccess` lors du build (compilation réussie et copie vérifiée). Le fichier doit être envoyé dans `/htdocs/hotel.banguiweb-tech.com`, au même niveau que `index.html` : les liens directs et rechargements des routes de l’application sont alors transmis à React, tout en préservant les fichiers et dossiers existants. Aucun fichier distant ni paramètre MySQL n’a été modifié. Le contrôle après mise en ligne reste à effectuer.

## Frontend LWS : 500 sur les routes après publication

La capture est confirmée par les contrôles HTTP : le frontend répond 200 sur la racine et index.html, mais 500 sur les routes React. Une variante simplifiée du `.htaccess` a été préparée avec une cible absolue et `[END]`, sans directives Options/DirectoryIndex. Le fichier distant doit être remplacé entièrement. La cause précise reste à confirmer par le journal Apache demandé ; aucune correction distante réussie n’est encore revendiquée.


## Frontend sur banguiweb-tech.com — 20 novembre 2026

À la demande de l’utilisateur, le frontend utilise désormais directement `https://banguiweb-tech.com` ; l’API reste sur `https://api.hotel.banguiweb-tech.com`. L’ancien diagnostic du sous-domaine frontend est abandonné. La page de connexion a été observée dans le navigateur, puis quatre routes directes ont renvoyé 200 avec l’index React : racine, connexion, réservations et choix du mot de passe. Cette publication distante a été constatée ; aucun fichier serveur n’a été modifié par l’agent.

Les modèles et la configuration locale déjà en mode production ont été adaptés pour l’origine CORS, les nouvelles invitations, le domaine Sanctum et le cookie `.banguiweb-tech.com`, sans modifier les identifiants ni la clé de chiffrement. Le guide actif indique la publication du contenu de `frontend/dist` directement dans `/htdocs`, avec son `.htaccess`. Un fichier local de production frontend a été préparé depuis le modèle public. Le build réussit, les 11 contrôles des domaines réussissent et le fichier de routage est bien inclus dans le build.

Il reste à reporter ces paramètres dans le `.env` distant du backend et à reconstruire son cache. Le précontrôle OPTIONS de l’API répond encore sans en-tête CORS : la migration du frontend ne résout pas le routage Laravel ni les paramètres MySQL de l’incident précédent. La connexion complète n’est pas déclarée fonctionnelle.


## Vérification du fichier CORS fourni

Le fichier local `backend/config/cors.php` est déjà valide. Les caractères de formatage du texte collé ne doivent pas être copiés dans le fichier PHP. La syntaxe PHP et les deux précontrôles locaux vers `/api/v1/auth/me` et `/sanctum/csrf-cookie` réussissent : 204, origine `https://banguiweb-tech.com` et `Access-Control-Allow-Credentials: true`. Aucune connexion à la base ni modification du serveur distant pendant ce contrôle. Une version propre est fournie avec le réglage `FRONTEND_URL` et les commandes de rechargement du cache.


## Demande de correction des headers

Les quatre en-têtes envoyés par le frontend sont déjà autorisés par Laravel. Les précontrôles locaux de connexion et CSRF le confirment (204, origine exacte et cookies). En revanche, les routes CSRF et santé de l’API distante renvoient maintenant exactement le même index React que le domaine principal : 573 octets et même empreinte SHA-256. Le défaut se situe dans le routage ou la racine servie avant Laravel.

Le repli React de `frontend/public/.htaccess` a été limité au domaine principal, sans ajouter d’en-têtes CORS dans Apache. Le build réussit et le fichier est copié à l’identique dans `dist`. Aucun fichier distant modifié ; publier ce fichier dans `/htdocs/.htaccess` puis confirmer le routage indépendant du sous-domaine API vers Laravel. La correction distante n’est pas encore déclarée réussie.


## API dans un dossier du domaine principal

À la demande de l’utilisateur, la nouvelle cible est `https://banguiweb-tech.com/backend`, donc les routes métier sont sous `/backend/api/v1`. Le client HTTP supprimait le dossier de sa racine configurée ; cette erreur est corrigée pour les appels, le cookie CSRF et les documents. Six tests client et trois tests de montage Laravel (13 assertions) passent. Les erreurs initiales de ces contrôles provenaient du cache de modules du test frontend et de la clé de chiffrement absente dans la configuration locale de production ; les variables de test sont maintenant isolées sans génération de clé de production.

L’entrée publique de `infra/lws/backend-public` charge le projet privé depuis `/home/jb-hotel-backend`, hors du dossier web. Le routage frontend laisse passer `/backend`. Les configurations locales de production et leurs modèles utilisent cette adresse, le cookie limité à l’hôte et le chemin `/`. La clé et les identifiants existants sont conservés.

Le build réussit. L’archive `output/lws/deploiement-dossier.zip` contient sept fichiers publics vérifiés, sans secret ; le guide `docs/DEPLOIEMENT_LWS_DOSSIER.md` décrit la copie du projet existant, la configuration et la bascule du cron. Aucun déplacement de fichiers ni changement de base sur LWS n’a été exécuté. Une première exécution élargie des tests backend a utilisé `APP_URL` de production avec le sous-dossier et a échoué sur des chemins de test sans dossier ; la réexécution isole aussi cette variable. La suite frontend élargie a passé 109 tests sur 110 ; le test Caisse ayant dépassé son délai repasse avec les quatre tests Caisse lors de la réexécution ciblée. Lint et build réussis. Les neuf tests d’authentification passent. Les deux échecs restants de facturation étaient dus à VERIFICATION_BASE_URL de production dans les tests ; les sept tests de vérification des factures passent après isolation de cette variable (56 assertions).


## 404 au login après publication dans /backend

Le build contenant le dossier backend est publié, mais les contrôles HTTP donnent une 404 Laravel sur toutes les routes de l’entrée publique, y compris santé et CSRF. Une reproduction locale exécutant le véritable index avec des métadonnées PHP sans le dossier reproduit exactement la 404. L’entrée publique normalise désormais le nom, le chemin et le fichier du script pour le montage `/backend`, sans modifier la méthode, le corps, les paramètres ni l’URI demandée. La reproduction donne ensuite 200 à la racine, 401 pour l’utilisateur non connecté et 204 pour CSRF ; syntaxe PHP valide.

L’archive `output/lws/correctif-login.zip` contient uniquement `backend/index.php`, à extraire dans `/htdocs`. L’archive complète a aussi été mise à jour et contrôlée. Aucun fichier distant ni donnée modifié pendant cette correction ; la confirmation sur LWS reste attendue après remplacement du fichier.


## 503 : projet privé absent à l’emplacement attendu

Les contrôles HTTP montrent maintenant le JSON 503 de la garde du point d’entrée public, avant Laravel. L’utilisateur confirme le projet complet dans `/htdocs/backend`, alors que l’entrée charge `/home/jb-hotel-backend`.

Un correctif CLI autonome est fourni : `output/lws/correctif-emplacement.zip`, à extraire dans `/htdocs`, puis `php ~/htdocs/reparer-emplacement-backend.php`. Le script vérifie les fichiers, refuse une destination privée existante, prépare l’entrée publique, déplace le projet complet hors du Web et remet les deux fichiers publics dans `/htdocs/backend`. Il ne supprime rien et conserve la configuration et les données. Le scénario a été vérifié sur fixture locale, ainsi que le refus d’une seconde exécution et la conservation du `.env`. Aucune exécution sur l’hébergement par l’agent ; la santé et la connexion restent à confirmer après exécution par l’utilisateur.


## Correction de la précondition du réparateur

Le premier réparateur exigeait à tort `index.php` et `.htaccess` à la racine du projet complet ; ces fichiers ne sont pas requis à cet endroit dans Laravel. L’arrêt signalé par l’utilisateur a eu lieu avant tout déplacement. La version 2 embarque les deux modèles publics et les génère sans dépendre de leur présence dans le projet source. Les contrôles sur `artisan`, l’autoloader, le bootstrap et `.env`, ainsi que le refus d’écrasement, restent actifs.

La syntaxe PHP et trois scénarios sur fixtures locales passent : projet sans fichiers publics déplacé en conservant la configuration et un document, projet incomplet refusé sans déplacement, destination existante conservée sans écrasement. Le contrôle des modèles a été refait en normalisant les fins de lignes Windows/Unix. L’archive `output/lws/correctif-emplacement-v2.zip` est vérifiée ; le script et l’ancienne archive ont également été mis à jour. Aucun déplacement sur LWS par l’agent.


## Variante sans commande

À la demande de l’utilisateur, une procédure entièrement réalisable dans le gestionnaire de fichiers LWS a été préparée. L’archive `output/lws/backend-public.zip` contient uniquement les deux fichiers publics, avec contenu vérifié. Le guide explique le déplacement du projet dans `/home/jb-hotel-backend`, l’édition du `.env` et la suppression des deux caches générés pour relire configuration et routes. Les noms des caches ont été vérifiés dans Laravel installé. Aucun fichier distant modifié pendant cette préparation.


## 503 persistant : vérification visuelle de l’arborescence LWS

La vue du gestionnaire de fichiers révèle le projet complet dans `/htdocs/jb-hotel-backend`, ainsi qu’un index PHP et le routage API à la racine `/htdocs`, sans index HTML frontend dans cette vue. Cela ne correspond pas aux chemins de l’entrée PHP, qui attend `/home/jb-hotel-backend` et doit être dans `/htdocs/backend`. Aucun fichier distant déplacé ou édité pendant l’observation.

La publication complète `output/lws/publication-complete-v3.zip` a été préparée et vérifiée avec sept fichiers publics, sans secret, et le routage frontend donne désormais priorité à index.html. La correction demandée à l’utilisateur est un déplacement précis du projet vers home, puis une extraction de cette archive dans htdocs en vérifiant les chemins finaux. La confirmation de la santé et de la connexion reste à effectuer après ces opérations.


## 419 au login : cookies de l’ancien sous-domaine

La santé distante répond maintenant 200 avec base OK et le point d’entrée CSRF 204. Les deux réponses émettent cependant les cookies XSRF et session avec `domain=.hotel.banguiweb-tech.com` depuis `banguiweb-tech.com`. Un client HTTP avec gestion normale des cookies les rejette et conserve un cookie jar vide ; une soumission vide de connexion reproduit alors 419 sans tentative de connexion réelle ni envoi d’e-mail.

La correction est limitée à la configuration distante active : `SESSION_DOMAIN=null` dans `/home/jb-hotel-backend/.env`, chemin `/`, puis retrait de `bootstrap/cache/config.php` pour relire le fichier et suppression des anciens cookies du navigateur. Les modèles locaux ont déjà la bonne valeur ; aucun changement de code ou fichier distant pendant ce contrôle.


## Vérification directe des mails automatiques

L’application de production connectée affiche dans Paramètres un SMTP réel, 5 messages en attente et aucun en échec. La page LWS Tâches cron indique 0 tâche utilisée sur 1 disponible. Le code confirme que le mail de test est envoyé immédiatement, tandis que les alertes de connexion, invitations et notifications clients passent par des listeners ShouldQueue. La file attend donc un traitement qui n’est pas planifié dans LWS.

La recommandation est un worker court périodique lancé sur `/home/jb-hotel-backend/artisan`, puis la vérification de la baisse du compteur et de la réception effective. Le chemin PHP explicite proposé vient de la documentation LWS ; son exécution n’a pas été validée sur cet hébergement. Aucune tâche créée, aucun secret modifié, aucun message envoyé par l’agent pendant cette demande de vérification.


## Format cron refusé

Vérification du formulaire LWS : Minute contient `*`, mais Heure, Jour du mois, Mois et Jour de la semaine sont vides. Le rejet de format est expliqué par ces quatre champs manquants ; renseigner les cinq champs séparément. Aucune tâche créée par l’agent.
