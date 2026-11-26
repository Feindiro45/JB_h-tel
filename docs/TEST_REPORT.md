# Rapport de tests — logiciel Windows JB Hôtel (D-069)

> Exécuté le 23/11/2026 sur le poste de développement (Windows 11 Pro, Node 24.18, PHP 8.2,
> MariaDB 10.4, Electron 45.4.1). Toutes les commandes ci-dessous ont réellement été lancées.

## 1. Résultats

| Commande | Portée | Résultat |
|---|---|---|
| `npm test` (`electron`) | base SQLite (migrations, transactions, chiffrement, journal, 100 opérations, redémarrage, sauvegarde, restauration avec opérations récentes, corruption simulée, rotation), relais de l'API (adresses, en-têtes, cookies), réglages du poste | ✅ **27/27** |
| `npm run typecheck` (`electron`) | types du processus principal, preload, recette | ✅ |
| `npm run test:e2e` (`electron`), sources | parcours réel Electron contre l'API locale (voir § 2) | ✅ 1/1 (28 s) |
| idem avec `JBH_E2E_EXECUTABLE=release\win-unpacked\JBHotel.exe` | même parcours sur la **version empaquetée** (asar, sans Vite ni Node) | ✅ 1/1 (22,6 s) |
| idem sur la version **installée par l'installateur** (`/S /D=…`), puis désinstallation silencieuse | installateur NSIS, exécution, désinstallation (exécutable et raccourcis retirés, données gardées) | ✅ 1/1 (22,1 s) ; désinstallation propre |
| `npm run dist` (`electron`) | construction de `JB-Hotel-Setup-1.0.0.exe` (122 Mo, x64, non signé) | ✅ |
| `php artisan test` (`backend`) | suite complète, dont 8 nouveaux tests `ChangeFeedTest` | ✅ **280/280** (2 268 assertions) |
| `vendor/bin/pint --test`, `phpstan analyse` (`backend`) | format, Larastan niveau 6 | ✅ / ✅ |
| `npm test` (`frontend`) | suite complète, dont 13 nouveaux tests (stockage du poste, changements serveur, copie après relecture échouée) | ✅ **219/219** |
| `npm run lint`, `format:check`, `typecheck` (`frontend`) | oxlint, Prettier, TypeScript | ✅ |
| `npm run test:e2e:offline` (`frontend`) | non-régression PWA hors ligne (parcours complet + conflit entre postes) | ✅ 2/2 |
| `npm run test:e2e` (`frontend`) | non-régression des 10 parcours navigateur de la PWA (connexion, réservation, facture, ticket 80/58 mm, postes, charte visuelle…) | ✅ 10/10 |

## 2. Parcours de bout en bout du logiciel (`electron/e2e/desktop.spec.ts`)

1. **Premier démarrage en ligne** : page servie depuis `app://jbhotel/` ; connexion de l'administrateur
   **à travers le relais** (cookies Sanctum, CSRF, origine) ; `window.require` et `window.process`
   absents ; chiffrement DPAPI actif ; schéma local 1.
2. Réservation créée en ligne (paiement différé) ; fiche et encaissements gardés ; « Mettre à jour
   en local » réussie ; écran « Poste Windows » et « Imprimante des tickets » présents ; panneau
   d'installation PWA absent. Fermeture.
3. Contrôle direct du fichier `jbhotel.sqlite` : écrans gardés par module (`reservations`, `payments`, `planning`).
4. **Redémarrage avec serveur injoignable** : application ouverte depuis les fichiers installés,
   « Hors ligne » ; encaissement de 5 000 FCFA → reçu provisoire `LOC-…-000001` ; la file SQLite
   contient `payment.record / pending` ; liste des imprimantes accessible. Fermeture.
5. **Second redémarrage sans serveur** : reçu provisoire et « En attente d'envoi » toujours affichés.
6. **Retour du serveur** : « En ligne », opération envoyée automatiquement au démarrage → `accepted` ;
   le serveur a **un seul** encaissement valide de 5 000 FCFA avec un reçu `REC-…` ; le curseur du
   journal des changements est enregistré ; le journal contient `payment`.
7. Journal local de la file : `queued:pending` puis `status:accepted` ; aucune erreur de page.

## 3. Correspondance avec les exigences du prompt (§ 11)

| Exigence | Preuve | État |
|---|---|---|
| Installation `.exe`, démarrage sans `npm run dev` | installateur + recette sur la version installée | ✅ (poste de développement ; **Windows vierge À FAIRE**) |
| Démarrage après arrêt complet sans Internet | redémarrages avec serveur injoignable (§ 2, étapes 4-5) | ✅ simulé (coupure réelle de la carte réseau et redémarrage de Windows : **À FAIRE à l'hôtel**) |
| Navigation sans CDN | CSP `default-src 'self'`, aucune ressource externe | ✅ |
| Création/modification hors ligne : clients, réservations, séjours, encaissements, factures | tests existants de la couche hors ligne (D-064/D-067, 219 tests, e2e PWA) + encaissement Electron | ✅ (mêmes règles, même code) |
| Impression 80 mm sans Internet, imprimante absente | code + liste des imprimantes testée ; message « imprimante introuvable » | 🟡 **impression papier À FAIRE** sur l'imprimante de l'hôtel |
| 100 opérations hors ligne, redémarrages, reprise sans perte | test « 100 opérations » + test redémarrage + e2e | ✅ |
| Crash entre commit SQLite et envoi ; accusé perdu ; même événement rejoué ; pas de doublon | transaction unique (test), clé d'idempotence (tests backend D-063/D-067), e2e : un seul encaissement | ✅ |
| Réception paginée, curseur, transactions atomiques, reprise | `ChangeFeedTest` (pagination, curseur sûr, transaction annulée, 410) + `serverChanges.test.ts` | ✅ |
| Deux réservations concurrentes, conflit visible | `ConcurrencyTest` (backend) + `conflict.spec.ts` (PWA hors ligne) | ✅ (existants) |
| Interface web actualisée après confirmation serveur | `serverChanges.test.ts` (écrans invalidés) ; WebSocket non disponible | 🟡 rafraîchissement 30 s au lieu du temps réel |
| Sauvegarde/restauration, corruption simulée, migration après mise à jour | tests SQLite (sauvegarde, restauration, corruption, refus d'une base plus récente) | ✅ ; mise à jour réelle par le canal **À FAIRE** (canal non créé) |
| Sécurité Electron/IPC | e2e (pas de Node), revue du code (`OFFLINE_SECURITY.md`) | ✅ |
| Non-régression PWA et API | 280 backend, 219 frontend, 2 e2e hors ligne, e2e en ligne | ✅ |

## 4. Défauts trouvés et corrigés pendant la recette

1. **Origine `"null"` de Node pour `app://`** : le processus principal refusait toutes les pages ;
   comparaison par protocole et hôte (`isAppLocation`, test ajouté).
2. **Session perdue au second redémarrage sans serveur** (aussi dans la PWA si Internet tombe mais
   le Wi-Fi reste) : la copie n'enregistrait que les lectures réussies ; corrigé (`persistence.ts`,
   `persistence.test.ts`).
3. Sauvegardes laissant des fichiers `-wal/-shm` : converties en fichier unique et vérifiées.
4. Taille de la base sous-estimée (WAL non compté) ; enregistrement de l'imprimante qui figeait une
   adresse de serveur passée en ligne de commande : corrigés (test ajouté).

## 5. Restes connus

- Pas de signature de code ni de canal de mise à jour en ligne : SmartScreen avertit ; mise à jour à tester une fois le canal créé.
- Impression papier, coupure réelle de la carte réseau, redémarrage de Windows et installation sur un
  Windows vierge : à faire sur le matériel de l'hôtel (fiche `docs/RECETTE_HORS_LIGNE.md` § 3).
- Pas de temps réel (WebSocket) sur l'hébergement actuel : actualisation toutes les 30 s.
- Pas de compteur d'essais pour le déverrouillage local (coût PBKDF2 seulement).
