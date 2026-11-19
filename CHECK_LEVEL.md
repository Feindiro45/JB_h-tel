# CHECK LEVEL — Suivi d'avancement JB Hôtel

> Tableau de bord de ce qui est **fait**, **en cours** et **à faire**. Mis à jour à chaque étape.
> Référence : `docs/06_PROMPT_AGENT_IA_IMPLEMENTATION.md` (phases 0 à 8) et `docs/08_plan_implementation.md`.

**Dernière mise à jour :** 19/11/2026 — phase 1 terminée ; premier envoi sur GitHub en attente

**Légende :**
- `[x]` fait et vérifié (testé ou exécuté) ;
- `[~]` en cours ou partiel ;
- `[ ]` à faire ;
- `[!]` bloqué, en attente d'une validation de l'hôtel.

## Vue d'ensemble

| Phase | Intitulé | Statut | Avancement |
|---|---|---|---|
| 0 | Audit et questions bloquantes | ✅ Fait | 100 % |
| 1 | Initialisation (dépôt, apps, CI, README) | ✅ Fait (envoi GitHub en attente) | 95 % |
| 2 | Base de données et identité | ⬜ À faire | 0 % |
| 3 | Catalogue et tarifs | ⬜ À faire | 0 % |
| 4 | Réservations | ⬜ À faire | 0 % |
| 5 | Caisse et factures | ⬜ À faire | 0 % |
| 6 | Frontend (écrans métier) | ⬜ À faire | 0 % |
| 7 | Reporting | ⬜ À faire | 0 % |
| 8 | Qualité et livraison | ⬜ À faire | 0 % |

## Phase 0 — Audit et questions bloquantes ✅

- [x] Lecture de tous les documents de conception
- [x] Spécifications déplacées dans `docs/` ; ancienne version V2 archivée dans `docs/archive/`
- [x] `docs/DECISIONS.md` : 6 contradictions arbitrées et 16 décisions
- [x] `docs/QUESTIONS.md` : 17 questions métier à faire valider par l'hôtel
- [x] `docs/CHANGELOG.md`
- [x] `CLAUDE.md` (guide pour l'agent IA)
- [!] **Validation par l'hôtel des questions P1** (Q-01, Q-02, Q-03, Q-07, Q-08, Q-09) : obligatoire avant la mise en production

## Phase 1 — Initialisation ✅

### Environnement
- [x] Outils vérifiés : PHP 8.2, Composer 2.10, Node 24, npm 11, git
- [x] Bases `jb_hotel` et `jb_hotel_test` créées (MariaDB 10.4 locale, utf8mb4)
- [!] MySQL 8 et Docker absents du poste : développement sur MariaDB 10.4, cible MySQL 8 (D-002)

### Backend (`backend/`)
- [x] Laravel 12.73 installé, configuré pour MySQL, locale `fr` et fuseau `Africa/Bangui`
- [x] Sanctum installé, routes `/api/v1`
- [x] Traductions françaises (laravel-lang) : messages de validation en français
- [x] Contrat d'erreur JSON en français, sans trace technique, même en mode debug (401, 403, 404, 405, 409, 419, 422, 429, 500, 503)
- [x] `BusinessRuleException` : base des erreurs métier
- [x] Endpoint de santé `GET /api/v1/health`, qui signale une base inaccessible
- [x] Limitation de débit (120 requêtes/min) ; mode strict d'Eloquent ; commandes destructives bloquées en production
- [x] CORS avec cookies vers le frontend (`localhost:5173` et `127.0.0.1:5173`)
- [x] Pint sans erreur ; Larastan niveau 6 sans erreur
- [x] **Tests : 18 sur 18 passent** (51 assertions)

### Frontend (`frontend/`)
- [x] React 19 + TypeScript 7 + Vite 8, avec React Router 8, TanStack Query 5, React Hook Form et Zod 4
- [x] Client API typé (cookies Sanctum, en-tête CSRF, normalisation des erreurs)
- [x] Modale d'erreur accessible (`alertdialog`, focus piégé, Échap, retour du focus, saisies conservées)
- [x] Messages d'erreur français, dont « Connexion impossible. Vérifiez votre connexion et réessayez. »
- [x] Formatage FCFA (milliers espacés) et dates en français, fuseau de l'hôtel
- [x] Page « État du système » reliée à l'API
- [x] Thème CSS de la charte 05, impression A4 de base
- [x] **Tests : 27 sur 27 passent** (Vitest)
- [x] Lint (oxlint), Prettier, TypeScript et build de production sans erreur

### Dépôt et outillage
- [x] Dépôt git initialisé (branche `main`), `.gitignore`, `.gitattributes`, `.editorconfig`
- [x] Dépôt distant ajouté : `origin` → github.com/Feindiro45/JB_h-tel
- [x] `.env.example` (racine, backend, frontend) sans secrets ; vérifié qu'aucun `.env` n'est suivi
- [~] `infra/docker-compose.yml` (MySQL 8.4) écrit, **non testé** (Docker absent du poste)
- [~] CI GitHub Actions écrite, **pas encore exécutée** (le sera au premier envoi)
- [x] `README.md` : installation, commandes, test unique
- [x] Backend (`:8000`) et frontend (`:5173`) démarrés indépendamment ; l'API répond avec les bons en-têtes CORS
- [ ] **Premier commit et envoi sur GitHub** : en attente de l'identité git (nom et e-mail de l'auteur)

## Phase 2 — Base de données et identité ⬜

- [ ] Migrations alignées sur `09_schema_reference.sql` et le MCD, compléments listés en C-05
- [ ] Clés étrangères, index, contraintes `CHECK`
- [ ] `spatie/laravel-permission` ; rôles `admin` et `caissiere`, permissions fines
- [ ] Authentification Sanctum SPA : connexion, déconnexion, utilisateur courant
- [ ] Gestion des utilisateurs (administrateur), comptes actifs ou inactifs
- [ ] Journal d'audit (table et service)
- [ ] Seeders de démonstration, sans identifiants réels codés en dur
- [ ] Tests : authentification, autorisations, rôles

## Phase 3 — Catalogue et tarifs ⬜

- [ ] Types de chambre VIP et Standard
- [ ] Chambres individuelles : numéro unique, type, capacité, maintenance
- [!] Maintenance planifiée par période (Q-12)
- [ ] Tarifs versionnés demi-journée et journée, date d'effet, historique (ancien, nouveau, auteur, motif)
- [ ] Test : les anciens prix restent intacts après une modification de tarif

## Phase 4 — Réservations ⬜

- [ ] Contrats `RoomAvailability` et `CurrentPriceProvider`, DTO, services
- [ ] Réservation immédiate ou future, heures facultatives, occupants, contrôle de capacité
- [ ] Prix figé à la confirmation (tarif appliqué, unité, quantité, brut, remise, net)
- [ ] Demi-journée jusqu'à 12 h incluses, alerte et validation de la caissière au-delà (D-007)
- [!] Définition de la journée (Q-01) et période bloquée sans heure (Q-02, Q-03) : politique provisoire D-009
- [ ] Remises en pourcentage ou montant fixe, motif, auteur, plafond (D-016)
- [ ] Statuts, arrivée, départ, annulation, prolongation avec journal
- [ ] Anti double réservation : transaction, verrou, revalidation ; **test de concurrence**
- [ ] États calculés par période (libre, réservé, occupé, maintenance)

## Phase 5 — Caisse et factures ⬜

- [ ] Paiements intégraux, partiels et différés ; versements multiples ; solde
- [ ] Reçu par paiement
- [ ] Remboursements tracés, sans suppression du paiement initial
- [ ] Paiements nets ≤ montant dû (D-014)
- [!] Factures numérotées et figées, PDF A4 côté serveur ; règles fiscales RCA (Q-09)
- [ ] Avoirs (document rectificatif)
- [ ] Tests : totaux, soldes, montants historiques

## Phase 6 — Frontend (écrans) ⬜

- [ ] Connexion et garde des routes par rôle
- [ ] Navigation latérale et mise en page (charte 05)
- [ ] Tableau de bord caisse
- [ ] Chambres et occupation des chambres
- [ ] Clients : recherche, fiche, historique
- [ ] Réservation guidée : client → occupants → période → chambre → prix et remise → paiement → confirmation
- [ ] Encaissements et remboursements
- [ ] Factures et reçus : aperçu et impression A4
- [ ] Administration : utilisateurs, rôles, tarifs, plafonds, paramètres, audit
- [ ] Responsive (poste de caisse puis tablette) et WCAG 2.2 AA

## Phase 7 — Reporting ⬜

- [ ] API d'agrégation, indicateurs définis (facturé ≠ encaissé ≠ chiffre d'affaires)
- [ ] Filtres par période, type, chambre et caissière
- [ ] Graphiques, ventilation VIP et Standard, journal de caisse
- [ ] Export CSV et PDF
- [ ] Rapprochement des encaissements, paiements et remboursements

## Phase 8 — Qualité et livraison ⬜

- [ ] Migrations propres sur MySQL 8
- [ ] Tests unitaires, d'intégration et de bout en bout
- [ ] Sécurité et contrôle d'accès
- [ ] Impression et restauration de sauvegarde
- [ ] Matrice exigences → tests → résultats

## Critères d'acceptation (fiche 06)

- [ ] Deux caissières ne peuvent pas confirmer la même chambre pour des périodes incompatibles
- [ ] Une chambre en maintenance ne peut pas être réservée
- [ ] Un client avec 2 occupants paie le même tarif qu'avec 1, si la capacité est respectée
- [ ] Tarif passé de 50 000 à 60 000 FCFA : l'ancienne facture reste à 50 000, la nouvelle réservation est à 60 000
- [ ] Une avance de 20 000 sur 50 000 laisse un solde de 30 000, avec un reçu par versement
- [ ] Une réduction de 10 % sur 50 000 donne 45 000, utilisateur et motif enregistrés
- [ ] Les remboursements diminuent les encaissements nets sans effacer le paiement initial
- [ ] Les indicateurs de caisse se rapprochent des transactions enregistrées
- [ ] Une caissière sans le droit nécessaire ne peut pas modifier un tarif
- [ ] Factures imprimables en A4 ; données conservées après redémarrage

## Questions en attente de l'hôtel

Voir `docs/QUESTIONS.md`. Questions **P1**, qui bloquent la mise en production :
- Q-01 : définition de la journée ;
- Q-02 et Q-03 : période bloquée sans heure ;
- Q-07 : réservations non payées ;
- Q-08 : remboursements ;
- Q-09 : facturation en RCA.
