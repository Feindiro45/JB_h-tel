# Audit du dépôt avant le logiciel Windows (Electron, hors ligne)

> Étape A du prompt `electron/PROMPT_IMPLEMENTATION_JB_HOTEL_ELECTRON_OFFLINE.md`, réalisée le 23/11/2026
> sur la branche `nouveautes-ticket-hors-ligne` (travail D-067/D-068 non commité inclus).
> Décision qui en découle : **D-069** (`docs/DECISIONS.md`). Architecture : `docs/ELECTRON_ARCHITECTURE.md`.

## 1. Organisation réelle

| Élément | Constat vérifié |
|---|---|
| Dépôt | Monorepo : `backend/` (Laravel), `frontend/` (React), `docs/`, `infra/`, et maintenant `electron/` |
| Node / npm (poste de développement) | Node 24.18.0, npm 11.16.0 |
| Frontend | React 19.3, React Router 8.5, TanStack Query 5.108, Vite 8.3 (rolldown), TypeScript 7.0, Vitest 5.1, Playwright 1.65 |
| Backend | Laravel 12, PHP 8.2 (XAMPP), Sanctum 4 (cookies SPA), spatie/laravel-permission 6.25, dompdf, php-qrcode 6, PhpSpreadsheet 5 |
| Base | MariaDB 10.4 en local, MySQL 8.4 en CI ; InnoDB utf8mb4 ; montants en FCFA entiers |
| Production | LWS mutualisé : interface sur `https://banguiweb-tech.com` (`htdocs`), API dans le dossier `https://banguiweb-tech.com/backend` (même domaine) ; aucun processus permanent (pas de WebSocket possible) — **À CONFIRMER** auprès de l'hébergeur |
| CI | `.github/workflows/ci.yml` : tests backend MySQL 8.4, Pint, Larastan, tests/lint/types/build frontend |
| Electron | Absent avant ce travail. Electron 45.4.1 (Node 24.22.3, SQLite 3.54.1 intégré via `node:sqlite`) vérifié sur ce poste |

## 2. Inventaire fonctionnel (présent dans le code)

### Écrans (frontend `app/routes.tsx`)

| Écran | Adresse | Droit | État |
|---|---|---|---|
| Connexion, mot de passe oublié, définir le mot de passe | `/connexion`, `/mot-de-passe-oublie`, `/mot-de-passe` | public | présent |
| Vue d'ensemble (tableau de bord) | `/tableau-de-bord` | `reports.view` | présent |
| Réservations (liste, fiche, création, confirmation, modification, prolongation, annulation, arrivée, départ, occupants, guide en 5 étapes) | `/reservations`, `/reservations/:id` | `reservations.*` | présent |
| Alertes de départ dépassé | `/alertes` | `reservations.view` | présent |
| Disponibilités / planning | `/disponibilites` | `reservations.view` | présent |
| Clients (liste, fiche, historique) | `/clients`, `/clients/:id` | `customers.*` | présent |
| Synchronisation et sauvegardes | `/synchronisation` | `reservations.view` | présent |
| Caisse (journal, reçus, encaissement, remboursement, annulation) | `/caisse` | `payments.*`, `refunds.create` | présent |
| Factures et reçus, tickets 80 mm, avoirs | `/documents`, `/documents/*/ticket` | `invoices.*` | présent |
| Rapports financiers (CSV, PDF, Excel) | `/rapports` | `reports.view` | présent |
| Admin : chambres et catégories, tarifs, utilisateurs et rôles, postes de caisse, mode hors ligne, paramètres, journal d'audit, état du système | `/admin/*` | droits admin | présent |
| Pages d'erreur (404, 403, sans accès, erreur de route) | — | — | présent |
| Page publique de vérification de facture (QR) | serveur `verification/factures/{uuid}` | public | présent (serveur) |

### API (`php artisan route:list`)
94 routes sous `/api/v1` réparties par module : Identity, RoomCatalog, Customers, Reservations,
Cashier, Billing, Reporting, Settings, Workstations (et Sync ajouté par D-069). Toutes les écritures
de réservation et de caisse passent par `main.workstation` (poste principal, D-062) et
`idempotent` (clé `Idempotency-Key`, D-063). Exports Excel par module (D-066).

### Règles métier observées dans le code
- Montants entiers FCFA, remises en points de base, plafond caissière (D-016) ; aucun flottant.
- Tarifs versionnés (`room_rates`, jamais modifiés, D-027) ; prix figé à la confirmation ; prix par chambre.
- Demi-journée ≤ 12 h, supplément explicite au-delà ; journée = différence de dates (D-055).
- Période bloquée `[blocked_from, blocked_until[` ; statuts bloquants PENDING/CONFIRMED/IN_PROGRESS ;
  verrou de la chambre puis re-contrôle des conflits dans la transaction ; dépassement de départ bloquant (D-056).
- Encaissements multiples, jamais supprimés (annulés), remboursements séparés, net encaissé ≤ dû.
- Factures figées (`snapshot_json`), numérotation `FAC`/`REC` par séquence transactionnelle,
  avoirs et factures de remplacement ; ticket 80 mm seul (D-065) ; facture automatique (D-067).
- Audit en transaction (`AuditTrail::record`) ; suppression réservée à l'administrateur (D-058).

### Couche hors ligne existante (PWA, D-064 / D-067 / D-068)
- `shared/offline/storage.ts` : stockage clé → valeur IndexedDB, transaction stricte `storageMutate`.
- File des opérations (`outbox.ts`), rejeu idempotent dans l'ordre (`outboxSync.ts`), références
  `local-…` (`localRefs.ts`), numéros provisoires `LOC-<poste>-<n>` et `FAC-LOC-…`.
- Copie des données consultées (`persistence.ts`, sans expiration), « Tout télécharger ».
- Règles métier rejouées sur le poste (`features/reservations/offlineBooking.ts`) : chambres libres,
  prix, conflits, demi-journée, jours, dépassements.
- Session hors ligne PBKDF2 (150 000 itérations), verrou après 15 min d'inactivité.
- Sauvegarde chiffrée par mot de passe des opérations en attente (`backup.ts`).
- Service worker (`public/sw.js`) en production ; connectivité réelle (`connectivity.ts`, `/health`).
- Serveur : `X-Offline-Replay` journalisé dans `offline_operations`, prix du moment de la saisie (N-09).

## 3. Points de friction repérés pour Electron

| # | Constat | Conséquence | Traitement (D-069) |
|---|---|---|---|
| F-1 | Authentification Sanctum par cookie de session + `X-XSRF-TOKEN` lu dans `document.cookie`, origine contrôlée (`SANCTUM_STATEFUL_DOMAINS`) | Depuis `app://` ou `file://`, cookies tiers refusés (SameSite) et origine inconnue | Relais de l'API dans le processus principal : cookies dans la session Electron, `Origin` de l'application web, CSRF ajouté côté principal ; **aucun changement d'authentification serveur** |
| F-2 | Stockage IndexedDB, effaçable par le navigateur | Risque de perte (stockage « au mieux ») | Même interface, implémentation SQLite (`electron/src/main/storage`) |
| F-3 | Service worker nécessaire pour ouvrir l'application sans réseau | Inutile et fragile dans un exécutable | Interface servie depuis les fichiers installés (`app://jbhotel/`), service worker désactivé sur le poste |
| F-4 | `window.print()` du ticket 80 mm | Choix d'imprimante à chaque fois, pas de journal | Impression par le processus principal (imprimante choisie, mode direct, `print_jobs`) ; la PWA garde `window.print()` |
| F-5 | Aucun flux ordonné des changements serveur ; actualisation par rechargement complet ou à l'affichage | Le tableau de bord web n'est pas averti des opérations faites ailleurs | Journal `sync_changes` + `GET /sync/status` et `GET /sync/changes` (curseur), lu toutes les 30 s par le poste **et** par la PWA |
| F-6 | Pas de WebSocket (hébergement mutualisé) | Temps réel impossible sans autre infrastructure | Rafraîchissement par curseur toutes les 30 s (secours exigé par le prompt) ; Reverb laissé **À CONFIRMER** |
| F-7 | **Défaut trouvé pendant la recette** : quand le serveur est injoignable mais que le réseau local répond, la relecture de la session échoue et la copie n'enregistrait que les lectures réussies ; au redémarrage suivant, la session disparaissait (retour à la connexion) | Touche aussi la PWA (Internet coupé, Wi-Fi actif) | Corrigé dans `persistence.ts` : une relecture échouée garde les données déjà reçues (test `persistence.test.ts`) |
| F-8 | `ELECTRON_RUN_AS_NODE=1` présent dans l'environnement de VS Code | Electron démarre comme Node | Supprimé par les scripts de recette ; aucun effet sur le poste installé |
| F-9 | Dossier du projet avec espace et accent (`JB Hôtel`) | Commandes `npx` avec `shell: true` coupées | Chemins relatifs dans les scripts |

Aucune dépendance CDN dans l'interface (polices et icônes intégrées) ; ExcelJS est chargé à la
demande depuis les fichiers de l'application.

## 4. Matrice de parité (fonction → comportement)

Légende : ✅ identique ; 🟡 hors ligne avec numéro/état provisoire, validé par le serveur au retour ;
⛔ refusé hors ligne avec message clair (le serveur est seul juge) ; 🖨️ local.

| Fonction | PWA en ligne | PWA hors ligne | Windows en ligne | Windows hors ligne |
|---|---|---|---|---|
| Connexion | ✅ | session gardée (PBKDF2) | ✅ (relais) | session gardée, base SQLite |
| Consultation tableau de bord, réservations, planning, clients, caisse, documents | ✅ | copie locale | ✅ | copie SQLite (par écran) |
| Création client | ✅ | 🟡 | ✅ | 🟡 |
| Réservation (création, confirmation, modification, prolongation, annulation, occupants) | ✅ | 🟡 (règles rejouées sur le poste) | ✅ | 🟡 |
| Arrivée / départ | ✅ | 🟡 | ✅ | 🟡 |
| Encaissement | ✅ | 🟡 reçu `LOC-…` | ✅ | 🟡 reçu `LOC-…` |
| Facture (automatique) | ✅ | 🟡 `FAC-LOC-…` | ✅ | 🟡 `FAC-LOC-…` |
| Remboursement, annulation d'encaissement, avoir | ✅ | ⛔ | ✅ | ⛔ |
| Ticket 80 mm (aperçu, impression, réimpression) | navigateur | navigateur | 🖨️ imprimante du poste, journal | 🖨️ |
| Exports Excel | ✅ | classeur simplifié local | ✅ (téléchargement) | classeur simplifié local |
| Rapport financier PDF/CSV | ✅ | ⛔ | ✅ (fenêtre dédiée) | ⛔ |
| Administration (chambres, tarifs, utilisateurs, rôles, postes, paramètres, audit) | ✅ | ⛔ (non gardée, sauf tarifs en lecture) | ✅ | ⛔ (idem) |
| E-mails, QR de vérification publique | serveur | au retour | serveur | au retour |
| Sauvegarde | chiffrée par mot de passe (opérations) | idem | + sauvegardes SQLite quotidiennes, export clé USB, restauration | idem |
| Changements faits ailleurs | actualisés toutes les 30 s (journal) | — | idem | — |

Limitations justifiées à faire approuver : les opérations ⛔ restent réservées au serveur (règles
financières et d'administration non rejouables sans risque) ; c'était déjà la règle validée de la PWA (D-064).

## 5. Points À CONFIRMER

1. **Hébergement temps réel** : un serveur WebSocket (Laravel Reverb) n'est pas possible sur l'offre
   mutualisée actuelle ; le rafraîchissement toutes les 30 s le remplace. Confirmer si un VPS est prévu.
2. **Signature du code** : aucun certificat de signature Windows ; SmartScreen avertira à l'installation.
3. **Canal de mise à jour** : adresse HTTPS où déposer `latest.yml` et l'installateur (proposé :
   `https://banguiweb-tech.com/desktop/`), à créer sur l'hébergement.
4. **Imprimante thermique réelle** : modèle et pilote Windows du poste de caisse (impression non testée sur papier).
5. **Origine Sanctum en production** : le relais envoie `Origin: https://banguiweb-tech.com` ; vérifier
   que `SANCTUM_STATEFUL_DOMAINS` du serveur contient bien `banguiweb-tech.com`.
6. Validations métier encore ouvertes (`docs/QUESTIONS.md`) : inchangées par ce travail.
