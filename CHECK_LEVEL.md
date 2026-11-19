# CHECK LEVEL — Suivi d'avancement JB Hôtel

> Tableau de bord de ce qui est **fait**, **en cours** et **à faire**. Mis à jour à chaque étape.
> Référence : `docs/06_PROMPT_AGENT_IA_IMPLEMENTATION.md` (phases 0 à 8) et `docs/08_plan_implementation.md`.

**Dernière mise à jour :** 19/11/2026 — phases 0 à 4 envoyées (CI verte) ; phase 5A (caisse) faite et testée, en local (envoi bloqué par les permissions, voir `RAPPORT.md`)

**Légende :**
- `[x]` fait et vérifié (testé ou exécuté) ;
- `[~]` en cours ou partiel ;
- `[ ]` à faire ;
- `[!]` bloqué, en attente d'une validation de l'hôtel.

## Vue d'ensemble

| Phase | Intitulé | Statut | Avancement |
|---|---|---|---|
| 0 | Audit et questions bloquantes | ✅ Fait | 100 % |
| 1 | Initialisation (dépôt, apps, CI, README) | ✅ Fait (CI GitHub verte) | 100 % |
| 2 | Base de données et identité | ✅ Fait (CI verte) | 100 % |
| 3 | Catalogue et tarifs | ✅ Fait (CI verte) | 100 % |
| 4 | Clients et réservations | ✅ Fait (CI verte) | 100 % |
| 5 | Caisse et factures | 🟡 5A fait (caisse) ; 5B à faire (factures) | ~55 % |
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
- [x] CI GitHub Actions : **verte au premier envoi** (backend sur MySQL 8.4 et frontend)
- [x] `README.md` : installation, commandes, test unique
- [x] Backend (`:8000`) et frontend (`:5173`) démarrés indépendamment ; l'API répond avec les bons en-têtes CORS
- [x] Premier commit `6f88c4e` envoyé sur `main` (github.com/Feindiro45/JB_h-tel)

## Phase 2 — Base de données et identité ✅

### Base de données
- [x] `spatie/laravel-permission` 6.25 installé, configuration publiée
- [x] 10 migrations : toutes les tables de 09, plus les compléments C-05 (horodatages, arrivée et départ effectifs, annulation, auteur de la remise, numéro de reçu, avoirs, `settings`, `document_sequences`, tables Spatie)
- [x] Intervalle bloqué `blocked_from` / `blocked_until`, indexé pour la détection des conflits (D-009)
- [x] Clés étrangères en `RESTRICT` (rien ne se supprime en cascade), index
- [x] 20 contraintes `CHECK` actives : montants, net = brut − remise, dates, statuts, capacité > 0
- [x] Rollback complet et réapplication testés sur MariaDB
- [x] Tests automatisés des contraintes (insertions invalides refusées, suppressions bloquées) : **6 tests verts**
- [x] `docs/SCHEMA.md` : schéma réel et écarts avec 09 et le MCD
- [ ] Redessiner `04_MCD_JB_Hotel.drawio` avec les compléments (en attendant, `SCHEMA.md` fait foi)

### Identité et droits
- [x] Catalogue de 27 permissions et 2 rôles (`admin`, `caissiere`) avec leurs libellés français
- [x] Modèle `User` déplacé dans le module Identity, avec le trait `HasRoles`
- [x] Connexion, déconnexion, utilisateur courant (Sanctum SPA, limite de 5 essais/min) : **9 tests verts**
- [x] Gestion des utilisateurs par l'administrateur (liste et recherche, création, modification, désactivation, protections « soi-même » et « dernier administrateur actif ») : **11 tests verts**
- [x] Modification des permissions d'un rôle (le rôle administrateur est verrouillé) : **7 tests verts**
- [x] Compte désactivé déconnecté immédiatement (middleware) : testé
- [x] Commande `php artisan jb:create-admin` (mot de passe masqué) : testée

### Audit
- [x] Service `AuditTrail` et modèle `AuditLog` (append-only, secrets filtrés, annulé avec la transaction) : **3 tests verts**

### Seeders et tests
- [x] Seeder des rôles et permissions, idempotent (exécuté deux fois : administrateur 27 permissions, caissière 15)
- [x] Seeder des 8 paramètres provisoires (12 h, plafond de 10 %, politique sans heure…) : les valeurs modifiées ne sont jamais écrasées
- [x] Comptes de démonstration `admin@jbhotel.local` et `caissiere@jbhotel.local` (local uniquement, mot de passe généré ou lu dans `DEMO_USERS_PASSWORD`)
- [x] Tests backend : **60 sur 60 verts** (219 assertions)
- [x] Parcours réel vérifié avec curl sur le serveur : cookie CSRF, connexion refusée sans jeton (419), connexion (200), profil (200), accès refusé à la caissière (403), déconnexion puis 401
- [x] Pint et Larastan (niveau 6) sans erreur
- [x] Documentation : `SCHEMA.md`, décisions D-017 à D-025, QUESTIONS, CHANGELOG, README (comptes de test, connexion), CLAUDE.md
- [x] Commit `ead3b11` envoyé sur `main`
- [x] CI GitHub de la phase 2 **verte**, après correctif `2038984` (limite de téléchargement anonyme de GitHub : Composer authentifié et cache des dépendances)

## Transverse — Identifiants publics UUID (demande du 19/11/2026, D-026)

- [x] Trait `HasPublicUuid` (UUID v7) : liaison des routes sur l'UUID, clé entière jamais exposée
- [x] Migration : colonne `uuid` unique et obligatoire sur les 11 tables d'entités ; UUID attribué aux lignes existantes ; retour arrière testé
- [x] Modèles existants : `User`, `AuditLog`, `RoomType`, `Room`, `RoomRate`
- [x] API Identity : `id` = UUID ; `/api/v1/users/{uuid}` ; un entier ou un identifiant invalide donne 404
- [x] Tests : 4 tests dédiés, plus les tests de contraintes et d'administration adaptés (**66 sur 66 verts**)
- [x] Défaut corrigé au passage : attributs par défaut du modèle `User` (le mode strict renvoyait une erreur 500 sur un utilisateur tout juste créé)
- [x] RoomCatalog (phase 3) : types, chambres et tarifs en UUID, références par UUID dans les données envoyées
- [x] Customers et Reservations (phase 4) : clients, réservations et occupants en UUID ; chambre et client référencés par UUID
- [ ] À appliquer en phase 5 : Cashier et Billing (paiements, remboursements, factures)
- [ ] Frontend : routes `/…/:id` avec l'UUID (phase 6)

## Phase 3 — Catalogue et tarifs ✅

### Code
- [x] Module RoomCatalog : énumérations (unité de facturation, maintenance, statut de tarif), modèles avec UUID, factories
- [x] Index unique : deux versions d'un même tarif ne peuvent pas démarrer au même instant (migration `150000`)
- [x] Services `RoomTypeService`, `RoomService`, `RateService` et requête d'historique et de grille
- [x] Contrats publics `CurrentPriceProvider` et `RoomDirectory` et leurs implémentations
- [x] Couche HTTP : 12 routes (types, chambres, maintenance, historique, grille, publication, retrait), validations françaises, ressources avec UUID
- [x] Seeders : types VIP et Standard (tous environnements) ; catalogue de démonstration local (chambres 001, 002, 101, 102, 201 et 4 tarifs, dont VIP journée à 50 000 FCFA) ; exécutés sur la base locale
- [ ] Types de chambre VIP et Standard : liste, création, modification (seeder de référence, tous environnements)
- [ ] Chambres individuelles : numéro unique, type, capacité, notes ; liste avec recherche et filtres ; tri naturel (001, 002, 101)
- [ ] Maintenance : passage en maintenance ou retour en service, avec note et audit
- [!] Maintenance planifiée par période (Q-12) : statut courant seulement pour l'instant (D-019)
- [ ] Tarifs versionnés demi-journée et journée : publication immédiate ou programmée, sans chevauchement de versions, aucune modification de montant
- [ ] Retrait d'une version programmée qui n'est pas encore entrée en vigueur
- [ ] Historique : ancien tarif, nouveau tarif, auteur, date d'effet, motif ; grille des tarifs en vigueur
- [ ] Contrats publics pour le module Reservations : `CurrentPriceProvider` (tarif en vigueur au moment de la confirmation) et `RoomDirectory`
- [ ] Données de démonstration locales : chambres 101 VIP, 102 Standard… et tarifs de démonstration

### Tests (20 tests RoomCatalog, 140 assertions)
- [x] Recette 1 : chambres 101 VIP et 102 Standard, numéro unique (message français « Une chambre porte déjà ce numéro. »)
- [x] Recette 5 : tarif VIP passé de 50 000 à 60 000 FCFA ; l'ancienne version et la réservation existante restent à 50 000, le nouveau tarif applicable est 60 000
- [x] La caissière ne peut pas modifier un tarif (403) mais peut le consulter
- [x] Tarif programmé : appliqué seulement à partir de sa date d'effet (avance dans le temps simulée)
- [x] Chaîne de versions continue, sans trou ni chevauchement ; date passée refusée ; doublon de date refusé
- [x] Retrait d'une version programmée ; retrait d'une version en vigueur refusé (409)
- [x] Tri naturel des chambres (9, 10, 001, 002, 101), recherche, filtres par type (UUID) et par maintenance
- [x] Routes en UUID uniquement : un entier donne 404
- [x] Contrats `CurrentPriceProvider` et `RoomDirectory`
- [x] Pint et Larastan (niveau 6) sans erreur ; **suite backend : 86 sur 86 verts** (374 assertions)
- [x] Parcours réel vérifié avec curl :
  - liste des chambres en UUID ;
  - tarif VIP à 60 000 programmé pour demain, la grille affichant 50 000 en vigueur et 60 000 programmé ;
  - publication par la caissière refusée (403) ;
  - retrait de la version programmée (204) ;
  - route avec un entier en 404.
- [x] Documentation : D-026 à D-028, SCHEMA.md (UUID, index unique), CHANGELOG, README (identifiants, routes du catalogue), CLAUDE.md
- [x] Commit `3f91816` envoyé sur `main`
- [x] CI GitHub de la phase 3 **verte** (backend sur MySQL 8.4 et frontend)

## Phase 4 — Clients et réservations ✅

### Module Customers
- [x] Fiche client détaillée (nom, prénoms, téléphone, e-mail, ville et pays de provenance, adresse, pièce d'identité, notes), en UUID
- [x] Recherche (nom, prénoms, téléphone, e-mail, pièce), création, modification ; aucune suppression (historique)
- [x] Historique des réservations d'un client (`GET /customers/{id}/reservations`)
- [x] Contrat public `CustomerDirectory`

### Module Reservations : création et prix
- [x] Période bloquée calculée (D-009 : heure absente = journée entière), indicateur « période déduite »
- [x] Demi-journée jusqu'à 12 h incluses ; au-delà, refus avec la quantité nécessaire et le supplément proposés ; aucune conversion automatique (D-007)
- [x] Prix figé : tarif en vigueur à la confirmation, unité, quantité, brut, remise, net
- [x] Prix par chambre, indépendant du nombre d'occupants ; capacité contrôlée
- [x] Remise en pourcentage (arrondi au FCFA) ou en montant fixe, motif obligatoire, auteur, plafond de la caissière (10 %, provisoire)
- [x] Devis sans enregistrement (`quote`) pour l'écran de réservation

### Disponibilité et concurrence
- [x] Verrou sur la chambre et revalidation des conflits dans la transaction
- [x] Chambre en maintenance non réservable
- [x] **Test de concurrence réel** avec deux processus PHP distincts :
  - la seconde caissière attend le verrou de la chambre (vérifié dans `information_schema.INNODB_TRX`), puis voit le conflit ;
  - une course simultanée ne donne qu'une seule confirmation.
- [x] Disponibilités par période (`/availability`) et occupation à un instant (`/occupancy` : libre, réservée, occupée, maintenance, réservée plus tard)

### Cycle de vie
- [x] Statuts : en attente → confirmée → en cours → terminée, ou annulée
- [x] Confirmation d'une réservation en attente (tarif du moment, montant tracé)
- [x] Arrivée (check-in) et départ (check-out) : la chambre est libérée au départ
- [x] Annulation motivée, impossible après l'arrivée
- [x] Prolongation : aperçu du supplément, conflits vérifiés, validation explicite, ancien et nouveau montant dans l'audit
- [x] Occupants modifiables (capacité revérifiée)
- [x] Journal des modifications de la réservation (`GET /reservations/{id}/history`)
- [ ] **Reste à faire :** modifier une réservation (changement de chambre ou de dates, autre qu'une prolongation), avec revalidation des conflits et du prix ; à traiter avec la phase 5 ou 6
- [x] Paiements déjà reçus lors d'une annulation : la réservation annulée n'exige plus rien, le versé apparaît « à rembourser » et le remboursement est explicite (phase 5A)

### Qualité
- [x] Recettes 2, 3, 4, 6, 8 et 10 et critères d'acceptation de la fiche 06 : **63 nouveaux tests** (Customers 4, réservation 14, cycle de vie 8, prolongation 5, disponibilités 5, concurrence 2, calcul du prix 5, plus les tests existants adaptés)
- [x] Pint et Larastan (niveau 6) sans erreur ; **suite backend : 129 sur 129 verts** (689 assertions)
- [x] Parcours réel vérifié sur le serveur (session et CSRF) :
  - client avec accents ;
  - devis de 45 000 FCFA (2 occupants, −10 %) ;
  - réservation confirmée ;
  - doublon refusé (409, avec détail) ;
  - disponibilités sans la 101 ;
  - arrivée anticipée refusée ;
  - annulation ;
  - historique ;
  - route avec un entier en 404.
- [x] Frontend : modale d'erreur avec les `details` métier (2 tests de plus, **29 sur 29 verts**)
- [x] Documentation : D-029 à D-034, Q-18 à Q-21, CHANGELOG, README (routes et exemple), CLAUDE.md
- [x] Commit `bd175ec` envoyé ; **CI verte** sur MySQL 8.4 (test de concurrence à deux processus compris)

## Phase 5 — Caisse et factures 🟡

### 5A — Caisse (module Cashier) ✅ (code et tests ; **envoi GitHub en attente**, voir RAPPORT.md)
- [x] Numérotation continue des documents (reçus `REC-AAAA-NNNNNN`) sous verrou : un échec ne consomme pas de numéro (testé)
- [x] Contrat public `ReservationLedger` : montant dû, statut, verrou de la réservation
- [x] Paiements intégraux, partiels et différés ; versements multiples ; solde (non payé, partiellement payé, soldé, trop-perçu à rembourser)
- [x] Reçu par paiement (numéro unique), consultable : client, chambre, solde
- [x] Paiements nets ≤ montant dû (D-014) : trop-perçu refusé, avec le solde restant
- [x] Annulation d'un encaissement tracée (administrateur), jamais de suppression ; impossible après un remboursement
- [x] Remboursements tracés, sans suppression du paiement initial (administrateur, Q-08)
- [x] Tests : **10 tests Cashier** (avance de 20 000 sur 50 000 → solde de 30 000 et un reçu par versement ; remboursement qui corrige l'encaissement net ; droits) ; **suite backend 139 sur 139**, Larastan OK
- [x] Vérification réelle sur le serveur : avance, refus du trop-perçu, solde, reçu, remboursement refusé à la caissière

### 5B — Factures (module Billing), à faire
- [!] Factures numérotées et figées, PDF A4 côté serveur ; règles fiscales de la RCA (Q-09)
- [ ] Avoirs (document rectificatif)
- [ ] Tests : l'ancienne facture reste à 50 000 après un changement de tarif

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

- [x] Deux caissières ne peuvent pas confirmer la même chambre pour des périodes incompatibles (test de concurrence réel, deux processus)
- [x] Une chambre en maintenance ne peut pas être réservée (409, testé)
- [x] Un client avec 2 occupants paie le même tarif qu'avec 1, si la capacité est respectée ; au-delà, refus (testé)
- [~] Tarif passé de 50 000 à 60 000 FCFA : l'ancienne facture reste à 50 000, la nouvelle réservation est à 60 000. Côté réservations, c'est testé (l'ancienne reste à 50 000, la nouvelle passe à 60 000) ; la facture vient en phase 5
- [x] Une avance de 20 000 sur 50 000 laisse un solde de 30 000, avec un reçu par versement (testé)
- [x] Une réduction de 10 % sur 50 000 donne 45 000, utilisateur et motif enregistrés (testé ; au-delà de 10 %, refus pour la caissière)
- [x] Les remboursements diminuent les encaissements nets sans effacer le paiement initial (testé)
- [ ] Les indicateurs de caisse se rapprochent des transactions enregistrées
- [x] Une caissière sans le droit nécessaire ne peut pas modifier un tarif : permission absente du rôle et API des tarifs en 403 (testé en phases 2 et 3)
- [ ] Factures imprimables en A4 ; données conservées après redémarrage

## Questions en attente de l'hôtel

Voir `docs/QUESTIONS.md`. Questions **P1**, qui bloquent la mise en production :
- Q-01 : définition de la journée ;
- Q-02 et Q-03 : période bloquée sans heure ;
- Q-07 : réservations non payées ;
- Q-08 : remboursements ;
- Q-09 : facturation en RCA.
