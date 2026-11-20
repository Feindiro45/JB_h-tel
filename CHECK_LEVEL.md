# CHECK LEVEL — Suivi d'avancement JB Hôtel

> Tableau de bord de ce qui est **fait**, **en cours** et **à faire**. Mis à jour à chaque étape.
> Référence : `docs/06_PROMPT_AGENT_IA_IMPLEMENTATION.md` (phases 0 à 8) et `docs/08_plan_implementation.md`.

**Dernière mise à jour :** 20/11/2026 — 6S (D-060) : pages d’erreur de l’application (404, 403, accès à configurer, 500) et du serveur pour les liens publics (403, 404, 419, 429, 500, 503, 4xx/5xx génériques comme 505) ; page Paramètres redessinée par domaine ; **234 tests backend, 109 frontend, 8 parcours navigateur verts ; CI GitHub verte (MySQL 8.4)**. 6R (D-059) : connexion, mot de passe oublié (compte vérifié avant l’envoi) et vérification de facture redessinés. 6Q (D-058) : la caissière corrige ses saisies du jour (encaissement, réservation avant le séjour) ; l’administrateur seul supprime définitivement, avec avertissement, motif et copie au journal ; 229 tests backend, 103 frontend, 7 parcours navigateur. 6P (D-057) : menu latéral réductible sur PC, contenu adaptable et préférence mémorisée. 6O (D-056) : blocage des chambres en dépassement et menu Alertes avec compteur, filtres/pagination et actualisation automatique. 6N (D-055) : calcul automatique des jours depuis les dates, choix confirmé du 20 au 23 = 3 jours ; contrôles création et prolongation. 6L (D-053, signalé par l’utilisateur) : l’annulation rembourse l’encaissé et crédite la facture, payée ou non ; la prolongation d’un séjour facturé remplace la facture par une facture détaillée (séjour initial + prolongation). 6M (D-054) : envoi réel des e-mails par le SMTP de l’hébergeur, alerte de connexion et invitation du personnel ; **authentification SMTP rétablie et invitation réelle du nouveau compte administrateur envoyée** ; base métier remise à zéro sur demande, 42 anciens envois supprimés et worker propre à l’application démarré. Livraison locale vérifiée : **222 tests backend, 99 tests frontend, 6 scénarios navigateur (2 rejoués pour le menu PC) (2 parcours réels, alertes, pagination et charte visuelle), 60 contrôles de contrats réels pour l’administration et les filtres**. Relecture finale : modification de catégorie corrigée (le code figé était renvoyé, 422). Sauvegarde restaurée (27 tables), PDF A4 et affichages bureau/tablette/mobile contrôlés. Charte de contenu, vues d’ensemble généralisées, boutons voisins verts/bleus, champs avec icônes, filtres/pagination par tableau et facture vert/or appliqués ; chambres occupées en rouge et aside conservé. Facture, avoir et document long rendus et inspectés, QR décodés. Six scénarios navigateur au catalogue ; repli PC et recette visuelle globale rejoués pour la dernière évolution. Incident de page blanche du serveur actif corrigé : cache Vite régénéré, contrôle `check:dev` vert sur quatre routes et rechargement. Validation hôtel et nouvelle CI MySQL 8.4 encore attendues.

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
| 5 | Caisse, factures, QR code, notifications | ✅ Fait (5A à 5E) | 100 % |
| 6 | Frontend (écrans métier) | ✅ 6A à 6P terminées ; SMTP authentifié, invitation réelle envoyée | 100 % |
| 7 | Reporting | ✅ Implémenté, tests API verts | 100 % |
| 8 | Qualité et livraison | 🟡 Livraison locale vérifiée ; recette hôtel et CI distante restantes | 90 % |

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
- [x] `04_MCD_JB_Hotel.drawio` redessiné depuis le schéma réel : 27 tables, 27 relations, UUID, Spatie, paramètres et audits ; `SCHEMA.md` mis à jour

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
- [x] Cashier et Billing (phase 5) : paiements, remboursements, factures et avoirs en UUID (tests des phases 5A à 5C)
- [x] Frontend : routes `/…/:id` avec l'UUID (`/reservations/:id`, `/clients/:id`, `/documents/recus/:id`), phase 6

## Phase 3 — Catalogue et tarifs ✅

### Code
- [x] Module RoomCatalog : énumérations (unité de facturation, maintenance, statut de tarif), modèles avec UUID, factories
- [x] Index unique : deux versions d'un même tarif ne peuvent pas démarrer au même instant (migration `150000`)
- [x] Services `RoomTypeService`, `RoomService`, `RateService` et requête d'historique et de grille
- [x] Contrats publics `CurrentPriceProvider` et `RoomDirectory` et leurs implémentations
- [x] Couche HTTP : 12 routes (types, chambres, maintenance, historique, grille, publication, retrait), validations françaises, ressources avec UUID
- [x] Seeders : types VIP et Standard (tous environnements) ; catalogue de démonstration local (chambres 001, 002, 101, 102, 201 et 4 tarifs, dont VIP journée à 50 000 FCFA) ; exécutés sur la base locale
- [x] Types de chambre VIP et Standard : liste, création, modification (seeder de référence, tous environnements)
- [x] Chambres individuelles : numéro unique, type, capacité, notes ; liste avec recherche et filtres ; tri naturel (001, 002, 101)
- [x] Maintenance : passage en maintenance ou retour en service, avec note et audit
- [!] Maintenance planifiée par période (Q-12) : statut courant seulement pour l'instant (D-019)
- [x] Tarifs versionnés demi-journée et journée : publication immédiate ou programmée, sans chevauchement de versions, aucune modification de montant
- [x] Retrait d'une version programmée qui n'est pas encore entrée en vigueur
- [x] Historique : ancien tarif, nouveau tarif, auteur, date d'effet, motif ; grille des tarifs en vigueur
- [x] Contrats publics pour le module Reservations : `CurrentPriceProvider` (tarif en vigueur au moment de la confirmation) et `RoomDirectory`
- [x] Données de démonstration locales : chambres 101 VIP, 102 Standard… et tarifs de démonstration

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

## Phase 5 — Caisse et factures ✅

### 5A — Caisse (module Cashier) ✅ (commit `2a7c32e` envoyé sur GitHub)
- [x] Numérotation continue des documents (reçus `REC-AAAA-NNNNNN`) sous verrou : un échec ne consomme pas de numéro (testé)
- [x] Contrat public `ReservationLedger` : montant dû, statut, verrou de la réservation
- [x] Paiements intégraux, partiels et différés ; versements multiples ; solde (non payé, partiellement payé, soldé, trop-perçu à rembourser)
- [x] Reçu par paiement (numéro unique), consultable : client, chambre, solde
- [x] Paiements nets ≤ montant dû (D-014) : trop-perçu refusé, avec le solde restant
- [x] Annulation d'un encaissement tracée (administrateur), jamais de suppression ; impossible après un remboursement
- [x] Remboursements tracés, sans suppression du paiement initial (administrateur, Q-08)
- [x] Tests : **10 tests Cashier** (avance de 20 000 sur 50 000 → solde de 30 000 et un reçu par versement ; remboursement qui corrige l'encaissement net ; droits) ; **suite backend 139 sur 139**, Larastan OK
- [x] Vérification réelle sur le serveur : avance, refus du trop-perçu, solde, reçu, remboursement refusé à la caissière

### 5B — Factures (module Billing) ✅ (commit `f520504`, CI verte)
- [x] Contrats publics : détail de facturation d'une réservation (`ReservationLedger::invoiceData`) et historique des paiements (`PaymentHistory`)
- [x] Facture numérotée `FAC-AAAA-NNNNNN` et **figée** (instantané complet : client, chambre, période, prix, remise, versements, solde), une seule facture active par réservation
- [x] Facture immuable : ni modification ni suppression ; seule la mention « annulée par avoir » est possible
- [x] Avoir (document rectificatif `AV-AAAA-NNNNNN`) qui crédite une facture ; nouvelle facture possible ensuite
- [x] PDF A4 généré côté serveur à partir de l'instantané (dompdf, environ 30 Ko grâce au sous-ensemble de police)
- [!] Mentions légales et TVA en RCA (Q-09) : en attente ; en-tête provisoire « JB Hôtel »
- [x] Tests : l'ancienne facture reste à 50 000 après un changement de tarif ; immuabilité ; avoir ; droits ; PDF (**7 tests verts**)

### 5C — QR code de vérification sur la facture (demande du 19/11/2026) ✅ (commit `f520504`, CI verte)
- [x] Code de vérification aléatoire (24 caractères) enregistré à l'émission de chaque facture ou avoir ; jamais journalisé
- [x] QR code imprimé sur le PDF A4, pointant vers la page publique de vérification
- [x] Route publique (sans connexion) : page HTML en français et API JSON, limitée à 30 requêtes par minute ; réponse identique si la facture est inconnue ou le code faux ; non indexée
- [x] Données publiées minimales : type, numéro, date, émetteur, montant net, statut (émise ou annulée par avoir), initiales du client
- [x] Tests : **7 tests** ; vérifié sur le serveur (facture réelle, page « Document authentique », code faux → « Document introuvable »)

### 5D — Notifications par e-mail au client (demande du 19/11/2026) ✅
- [x] Si le client a donné son e-mail : message à chaque opération sur son séjour (confirmation et bienvenue, arrivée, prolongation, annulation, départ, reçu de paiement, remboursement, **facture en PDF joint**, avoir)
- [x] Envoi en file d'attente, après validation de la transaction ; échec d'envoi sans blocage de l'opération (3 essais) ; journalisé sans l'adresse e-mail
- [x] Modèles d'e-mail en français ; **lien de désinscription signé** ; préférence modifiable sur la fiche client
- [x] SMTP de l’hébergeur et expéditeur configurés localement (20/11/2026) ; authentification et invitation réelle vérifiées. La réception dans la boîte du destinataire reste à confirmer ; configuration de production à valider selon Q-22.
- [x] Tests : **8 tests** (parcours complet de 10 e-mails, PDF joint, reçu, désinscription, aucun envoi sans e-mail ni en cas d'échec) ; vérifié en réel (file d'attente traitée, e-mail produit)

### 5E — Design du PDF de facture depuis la référence (19/11/2026) ✅

- [x] Palette vert profond/or, monogramme, image déjà présente dans le projet, blocs client/séjour, icônes, tableau, totaux, versements, QR et pied de page.
- [x] Coordonnées, lignes, remises, versements et montants issus de l’instantané figé ; aucun ajout de TVA, échéance, prestation incluse, cachet ou signature fictifs.
- [x] Facture et avoir de démonstration sur une page A4 ; cas long de 36 lignes et noms longs sur trois pages, en-têtes répétés et pages numérotées. Les cinq pages de contrôle ont été inspectées.
- [x] QR des trois documents décodés depuis leurs pages PDF rendues ; image compressée et polices sous-ensemblées, exemple de facture d’environ 168 Ko.
- [x] Suite backend : 183 tests / 1 281 assertions ; immuabilité, génération PDF, avoirs, QR et pièces jointes vérifiés. Facture du parcours réel : une page, avance de 20 000 FCFA et solde de 30 000 FCFA contrôlés ; QR décodé et comparé à son adresse exacte.

## Phase 6 — Frontend (écrans) ✅

> Design repris du prototype `JB_Hotel_Prototype` (charte vert profond et or, barre latérale, cartes, badges), puis amélioré et branché sur l'API réelle.

### 6A — Fondations, connexion, exploitation ✅
- [x] Système de design : jetons de la charte et du prototype, composants (boutons, badges, panneaux, tableaux, champs, modales, notifications brèves, états vides et de chargement)
- [x] Connexion réelle (Sanctum : cookie CSRF puis session), page illustrée par la photo de l'hôtel, déconnexion
- [x] Structure : barre latérale par groupes, filtrée selon les **permissions du serveur** ; barre du haut ; tiroir sur mobile ; garde des routes
- [x] Endpoints `/dashboard` et `/planning` (3 tests)
- [x] Tableau de bord : indicateurs, encaissements des 7 derniers jours, occupation, arrivées et départs du jour, réservations récentes (nouvel endpoint `/dashboard`)
- [x] Réservations : liste filtrable, fiche détaillée et ses actions (confirmer, arrivée, départ, prolonger avec aperçu, occupants, annuler, encaisser, facturer)
- [x] Nouvelle réservation guidée : client existant ou nouveau, occupants, période, chambres compatibles, devis en direct, remise, paiement intégral, avance ou différé
- [x] Disponibilités : planning par chambre et par jour (nouvel endpoint `/planning`)
- [x] Clients : répertoire, fiche, création et modification (préférence e-mail)
- [x] Routes en UUID (`/reservations/:id`, `/clients/:id`)
- [x] Tests : **47 tests frontend** (connexion et retour à la page demandée, menu filtré par rôle, accès refusé, session expirée, fiche réservation et ses actions, encaissement sans trop-perçu, prolongation en deux temps, nouvelle réservation dans l'ordre client → réservation → avance, pas de doublon de client après un conflit, clients et erreur 422 sur le champ) ; lint, types, format et build verts
- [x] Contrats d'API vérifiés contre le serveur réel : 32 appels du frontend rejoués avec une vraie session Sanctum, réponses conformes aux types TypeScript
- [ ] Revue visuelle dans le navigateur par l'utilisateur (http://localhost:5173)

### 6B — Caisse et documents ✅
- [x] API : journal de caisse `GET /cash-journal` (totaux, ventilation par moyen et par caissière, mouvements ; 92 jours au plus) ; reçu enrichi (en-tête de l’hôtel)
- [x] API : liste des reçus `GET /payments` et des factures et avoirs `GET /invoices` (filtres, pagination, totaux facturés)
- [x] API : soldes à encaisser `GET /receivables` (même total que le tableau de bord) — **7 tests backend**
- [x] Écran Caisse : période (raccourcis aujourd’hui, hier, 7 jours, mois), indicateurs, ventilations par moyen et par agent, mouvements, soldes à encaisser avec bouton « Encaisser », impression du journal
- [x] Annulation d'un encaissement et remboursement (administrateur), depuis la caisse, la liste des reçus et la fiche réservation ; avoir depuis la fiche réservation
- [x] Écran Factures et reçus : onglets accessibles au clavier, filtres, totaux factures − avoirs, PDF, vérification, avoir motivé
- [x] Reçu imprimable A4 (`/documents/recus/:id`) : en-tête de l’hôtel, versement, remboursements, reste à payer
- [x] Tests : 7 tests backend ; **55 tests frontend** (+8 : caisse, raccourcis de période, remboursement plafonné et motivé, factures et totaux, avoir réservé à l'administrateur, onglets au clavier, reçu imprimable, reçu annulé)
- [x] Contrats des nouveaux appels vérifiés contre le serveur réel (caissière puis administrateur) : net du jour, soldes, remboursement refusé à la caissière (403), annulation refusée après remboursement (409), avoir

### 6C — Administration
- [x] API : paramètres `GET /settings`, `PUT /settings/{clé}` (seuls les paramètres réglables, avec contrôle et audit) ; `GET /payment-methods` pour les listes de moyens — 4 tests
- [x] API : journal d'audit `GET /audit-logs` (filtres, libellés français, liens en UUID, sans identifiant interne) — 2 tests
- [x] Chambres et catégories : création, modification, maintenance avec note
- [x] Tarifs : grille en vigueur et programmée, publication (immédiate ou datée, motif), retrait d'un tarif programmé, historique
- [x] Utilisateurs et accès : liste, création, modification, activation et désactivation, droits de la caissière
- [x] Paramètres : lecture de toutes les règles (validées ou provisoires), modification des règles réglables
- [x] Journal d'audit : consultation filtrée, détail avant et après
- [x] Tests backend et frontend verts ; parcours réel Playwright : connexion, chambre, client, réservation, avance, facture, consultation des écrans et exports ; 2 E2E réussis
- [x] Responsive : captures bureau, tablette 768 px et mobile 390 px, sans débordement global ; Axe sans violation sur les nouveaux écrans (tags WCAG 2 A/AA, 2.1 AA, 2.2 AA). Recette humaine complète et certification non présumées
- [x] Relecture finale : la modification d'une catégorie renvoyait son code, refusé par le serveur (422 à chaque enregistrement). Le code n'est plus envoyé en modification et il est contrôlé au format du serveur à la création ; test ajouté
- [x] Contrats réels de l'administration et des filtres, rejoués avec une vraie session Sanctum sur un serveur branché sur `jb_hotel_e2e` (jamais la base de travail) : **60 contrôles verts**. Couverts : catégories (modification sans code, code refusé en 422), chambres, maintenance, tarifs immédiat et daté au format du navigateur, grille, historique filtré avec ancien tarif, retrait (204), utilisateurs (filtres, création, désactivation sans mot de passe), droits de la caissière, paramètres (réglable modifié, non réglable 409), audit sans identifiant interne, recherche par client sur réservations, reçus, factures et clients, lignes par page (10 respecté, valeur hors liste ramenée à 25), refus de la caissière (403). Limiteur de débit observé (429) en relançant trop vite

### 6D — Filtres complets et pagination dans chaque module (demande du 19/11/2026)
- [x] API : recherche par client sur les réservations, les reçus et les factures ; catégorie et forfait sur les réservations ; e-mail, ville et pays sur les clients
- [x] API : nombre de lignes par page (10, 25, 50, 100) sur toutes les listes paginées ; liste des agents de caisse pour les filtres
- [x] Pagination commune : page précédente et suivante, nombre de résultats, lignes par page
- [x] Filtres et pagination : réservations, clients, séjours d'un client, caisse (mouvements, soldes), reçus, factures, chambres, catégories, tarifs, utilisateurs, journal d'audit
- [x] Tests backend et frontend

### 6E — Design des paginations (demande du 19/11/2026) ✅

- [x] Pied de liste commun assorti à la charte : fond discret, séparation du tableau, page active vert profond avec accent doré, boutons et sélecteur harmonisés.
- [x] Navigation directe par numéros, premières/dernières pages et points de suspension sur les grandes listes ; boutons précédent/suivant avec états désactivés.
- [x] Compteur de plage (« 31–40 sur 217 résultats »), état vide, sélection 10/25/50/100 et retour à la première page après changement de taille.
- [x] Adaptation à la largeur du composant : une ligne sur grand écran, disposition compacte sur tablette/mobile ; captures inspectées à 1440, 768, 390 et 320 px.
- [x] Accessibilité : noms explicites, page courante annoncée, compteur dynamique, focus visible ; Axe sans violation sur les quatre formats.
- [x] Correction d’un débordement des libellés masqués des tableaux sur mobile ; pagination masquée à l’impression.
- [x] Contrôles : 63 tests frontend, lint, TypeScript et build verts ; suite navigateur complète : **3 tests réussis**, dont le test dédié de pagination (navigation, dernière page, taille, état vide et responsive).

### 6F — Design commun du contenu depuis la référence fournie (19/11/2026) ✅

- [x] Référence : « Tableau de bord financier de l’hôtel.webp ». Application à la zone de contenu uniquement, conformément à la demande de conserver l’aside.
- [x] Aside conservé : même JSX, navigation, marque, largeur, couleurs et espacements ; thème CSS limité à `.workspace`, aux modales et au panneau de connexion.
- [x] Fil d’Ariane, titres avec icône sur fond menthe, cartes d’indicateurs pastel, surfaces claires, filtres encadrés et tableaux à en-tête vert pâle.
- [x] Factures et reçus : indicateurs au-dessus des onglets, filtres séparés, type de document, icônes de lignes, actions compactes et impression. Les montants et les compteurs proviennent de l’API ; aucune variation fictive n’a été ajoutée.
- [x] Application aux pages métier, à l’administration, aux fiches, à la connexion et aux formulaires ; styles d’impression conservés.
- [x] Navigation au clavier des onglets conservée après changement de leur disposition ; aucun « −0 FCFA » à l’affichage.
- [x] Recette : **63 tests frontend et 4 tests navigateur verts** ; Axe sans violation sur les 17 pages principales/fiches contrôlées et le formulaire de chambre ; 31 captures de connexion, pages, fiches et formulaire, dont des contrôles à 1752/768/390/320 px.

### 6G — Design et icônes des boutons (19/11/2026) ✅

- [x] Boutons principaux, secondaires, actions de tableau et boutons de dialogue harmonisés : bordures, relief discret, survol, appui, focus et états désactivés.
- [x] Icônes adaptées : création, modification, maintenance, consultation, filtres, impression, PDF, exports, encaissement, remboursement, retrait, annulation et vérification.
- [x] Icônes décoratives masquées aux lecteurs d’écran ; libellés et permissions conservés, actions sensibles distinctes et confirmations maintenues.
- [x] Icône de chargement sur la connexion et les confirmations, fermeture explicite des modales et respect des préférences de mouvement réduit.
- [x] Contrôle des boutons des 17 pages/fiches et du formulaire : présence d’icônes, Axe, navigation clavier et opérations existantes vérifiés ; aside exclu et comparé à son JSX d’origine (identique), dimensions/couleurs contrôlées en navigateur.

### 6H — Filtres automatiques (19/11/2026) ✅

- [x] Réservations, clients, factures, reçus, utilisateurs, caisse, rapports et audit : filtres sans bouton de validation ; les catalogues, disponibilités et recherches locales étaient déjà automatiques.
- [x] Recherche serveur après 300 ms de pause ; choix et dates valides appliqués immédiatement. Annulation des délais remplacés et retour en page 1 après changement de filtre.
- [x] Effacement de tous les filtres clients/réservations en conservant le nombre de lignes par page ; les résultats déjà disponibles peuvent être repris du cache.
- [x] Périodes incomplètes, inversées ou trop longues : derniers critères valides conservés, indication accessible ; bornes de 92 jours pour la caisse et 366 pour les rapports.
- [x] Cinq tests du comportement partagé : dernière saisie, choix immédiat, pagination, effacement, période invalide et borne facultative ; 68 tests frontend, lint, format et build verts.
- [x] Suite navigateur finale : quatre tests réussis, avec recherche et effacement automatiques, responsive et Axe. Aucun changement de l’aside, contrôlé en JSX et en navigateur.

### Incident — Page blanche du serveur local (19/11/2026) ✅

- [x] Erreur reproduite sur le serveur réellement utilisé, `http://localhost:5173` : export `ReservationDetailPage` absent du module servi.
- [x] Cause vérifiée : fichier source complet avec export présent, mais transformation vide conservée dans la mémoire du processus Vite. Contrôle de 83 modules : un seul module vide.
- [x] Serveur Vite redémarré avec `--force`, dépendances réoptimisées ; aucun changement nécessaire au composant.
- [x] `npm run check:dev` ajouté : navigateur anonyme sur le serveur actif, quatre routes et rechargement sans erreur JavaScript ni page blanche ; aucune réinitialisation de base.
- [x] Commande exécutée avec succès et lint vert. Les tests métier de la session précédente restent à 183 backend / 68 frontend / 4 navigateur ; ils n’ont pas été rejoués pour cette réparation de serveur.

### 6I — Vues d’ensemble, espacement et champs illustrés (19/11/2026) ✅

- [x] Synthèses sur les listes, fiches et pages d’administration ; les pages caisse, factures, tableau de bord et rapports conservent leurs indicateurs réels.
- [x] Indicateurs issus des données reçues, avec périmètre explicite : catalogue complet, résultats filtrés, page affichée ou premier jour du planning. Aucune extrapolation ni variation fictive.
- [x] Espacement augmenté entre cartes, panneaux, champs et boutons ; icônes adaptées dans les champs texte, dates, heures, mots de passe, montants, listes et commentaires.
- [x] Deux couleurs d’action, vert et bleu, avec alternance entre voisins ; la couleur secondaire demandée est le bleu. Cartes voisines différenciées, états désactivés/focus/chargement conservés et actions destructives distinctes.
- [x] Aside conservé : JSX identique à la référence Git et styles limités au contenu/dialogues/connexion.

### 6J — Filtres et pagination par tableau (19/11/2026) ✅

- [x] Recherche automatique et pagination indépendantes sur les tableaux secondaires : arrivées, départs, réservations récentes, données des graphiques, grille tarifaire, catégories, ventilations de caisse, historique/documents/encaissements d’un séjour et tableaux du reçu.
- [x] Planning : recherche dans les chambres et pagination en complément de la période/catégorie. Rapports : contrôles propres aux données quotidiennes et à la ventilation par catégorie.
- [x] Les listes distantes conservent leurs filtres et leur pagination serveur. Les petits tableaux utilisent les lignes intégralement fournies par l’API, sans nouvelle requête ni recalcul des totaux métier.
- [x] Recherche locale insensible aux accents et à la casse, retour en page 1, plage de résultats et choix du nombre de lignes.
- [x] Impression des tableaux locaux sur toutes les lignes reçues, avec rétablissement du filtre et de la page ensuite ; commandes masquées à l’impression.
- [x] Contrôles finaux : 73 tests frontend, lint, format, TypeScript et build verts ; parcours métier et pagination validés (3 tests), puis contrôle visuel final (1 test) sur 17 pages/fiches et le formulaire. Axe, icônes, espacement, boutons voisins, filtres/pagination de chaque tableau et responsive contrôlés. Serveur actif vérifié avec `check:dev`.

### 6K — Chambres occupées en rouge (19/11/2026) ✅

- [x] Occupée en rouge dans les pastilles, cartes concernées, planning et graphique d’occupation ; libre en vert, réservée en bleu, maintenance en ambre.
- [x] Liste des chambres : colonne et filtre d’occupation actuelle à partir de l’API d’occupation existante, sans stocker un état dérivé.
- [x] Consultation d’occupation conditionnée au droit `reservations.view` ; droits serveur conservés, aucun résultat supposé libre en l’absence de données.
- [x] Test d’intégration de l’affichage rouge et du filtre d’occupation ; tests du tableau local (recherche, pagination, impression) et distinction total/page dans la synthèse clients.

### 6L — Annulation payée et prolongation facturée (demande du 19/11/2026)
> Constaté par l’utilisateur : une réservation annulée restait comptée dans la caisse (250 000 FCFA encaissés, aucun remboursement) ; après une prolongation, la facture ne couvrait que le séjour initial. Choix de l’utilisateur : rembourser dans la même opération que l’annulation ; remplacer automatiquement la facture à la prolongation.
- [x] Annulation, payée ou non (« pareil pour une réservation non payée ») : encaissé remboursé intégralement dans la même transaction (montant confirmé, moyen, motif ; droit de rembourser exigé, 403 sinon) et facture active annulée par un avoir. Montant dû 0 exposé sur la réservation et les listes. Tout ou rien prouvé (panne simulée de la facturation)
- [x] Prolongations enregistrées, non modifiables (table `reservation_extensions` : période ajoutée, quantité, prix, ancien et nouveau net, auteur)
- [x] Prolongation d’un séjour facturé : avoir sur l’ancienne facture et nouvelle facture détaillée (séjour initial + prolongation, mention « remplace la facture n° … »), dans la même transaction ; facturé du mois sans double compte
- [x] Caisse : « Annulations à rembourser » (annulations antérieures encore payées, API `to_refund`), jamais comptées dans les soldes ; lien vers le séjour pour rembourser
- [x] Écrans : fenêtre d’annulation (montant remboursé, moyen, blocage expliqué pour la caissière, avoir annoncé), prolongation (facture remplacée annoncée puis numéro de la nouvelle), fiche du séjour (montant dû 0, prix initial pour mémoire, trop-perçu antérieur signalé), tableau de bord et séjours du client
- [x] Tests : **193 backend** (+10 : annulation payée, refus caissière, montant non conforme, non payée facturée, tout ou rien ×2, prolongation enregistrée, facture remplacée, facture détaillée sans facture préalable, trop-perçu antérieur), **79 frontend** (+5) ; Pint, Larastan, lint, Prettier, TypeScript et build verts
- [x] Contrats réels sur `jb_hotel_e2e` : **21 contrôles verts** (refus caissière 403, montant 409, annulation remboursée, caisse du jour, avoir de la non payée, facture de remplacement à deux lignes, PDF) ; rendu de la facture de remplacement inspecté
- [x] Base de travail : migration additive `reservation_extensions` appliquée sans réinitialisation (retour arrière vérifié en simulation)
- [x] Documentation : D-053 (D-035 marquée remplacée), Q-14, SCHEMA, MCD (28 tables), CHANGELOG, CLAUDE.md
- [~] CI (20/11/2026) : les deux parcours réels et la pagination passent désormais sur GitHub ; le test visuel ouvrait une fenêtre d’erreur sur Rapports, car il enchaîne les pages plus vite que la limite de 120 requêtes/min. Limite rendue réglable (`API_RATE_LIMIT_PER_MINUTE`, 120 par défaut, 1 000 en recette). Historique : échecs navigateur publiés en annotations (journal GitHub illisible sans droits d’administrateur) ; causes trouvées : PDF de chaque facture rendu pour rien quand le client n’a pas d’e-mail (~4 s par facture, désormais produit seulement à l’envoi), parcours complet trop long pour 60 s (2 min), serveur PHP de recette à un seul processus (4 processus sous Linux) ; erreurs serveur publiées en annotations ; nouvelle CI à confirmer

### 6M — Envoi réel des e-mails (demande du 20/11/2026)
> Choix de l’utilisateur : vrai envoi par le SMTP de l’hébergeur de l’hôtel, alerte à chaque connexion, e-mail de bienvenue à la création d’un compte.
- [x] SMTP de l’hébergeur : réglages documentés dans `.env.example` et EXPLOITATION, sans secret dans Git ; identifiants fournis par l’utilisateur placés dans `backend/.env` (ignoré par Git)
- [x] SMTP de l’hébergeur vérifié : nouveau mot de passe local, authentification SMTPS réussie puis invitation réelle du nouveau compte administrateur envoyée le 20/11/2026. Confirmation dans l’audit `user.invitation_sent`, lien de mot de passe créé et file sans échec. La réception en boîte reste à confirmer par le destinataire.
- [x] Test d’envoi : commande `jb:mail-test` et panneau « Envoi des e-mails » dans Paramètres (mode, serveur, expéditeur, file d’attente, e-mail de test), sans aucun secret exposé ; causes d’échec expliquées en français
- [x] Alerte de connexion au membre du personnel (date, heure de Bangui, adresse IP, navigateur et système), en file d’attente ; jamais vers un domaine réservé (`@jbhotel.local`)
- [x] Création de compte : mot de passe facultatif ; sans mot de passe, invitation avec un lien à usage unique valable 72 h ; avec mot de passe, e-mail de bienvenue ; bouton « Inviter » pour renvoyer un lien
- [x] Écran public « Choisir mon mot de passe » (`/mot-de-passe`), lien expiré ou déjà utilisé expliqué
- [x] Tests : 12 backend (alerte, invitation, lien à usage unique et expiré, renvoi, droits, domaines réservés, état sans secret, serveur injoignable, commande), 5 frontend ; **12 contrôles verts par un vrai échange SMTP** (serveur de capture local) : test d’envoi, invitation, mot de passe choisi depuis le lien reçu, connexion et alerte
- [x] Corrigé au passage : le PDF de la facture était rendu même quand aucun e-mail ne partait (~4 s par facture)
- [x] « Corrige tout, le client doit recevoir les e-mails s’il a communiqué » (20/11/2026) : la règle est déjà respectée (e-mail demandé à la réservation et sur la fiche, accord coché par défaut, envoi si adresse et accord). Ajouts : chaque envoi est retenté pendant 24 h, avec une pause commune de 10 min après 3 refus du serveur pour ne pas faire bloquer le compte ; bouton « Relancer les envois en échec » ; 2 tests backend, 1 frontend
- [x] Incident SMTP résolu le 20/11/2026 : après les refus initiaux 535, authentification rétablie avec le secret corrigé ; invitation réelle acceptée par le serveur et worker de l’application démarré (détails ci-dessous).
- [x] À la demande de remise à zéro du 20/11/2026 : **42 anciens envois supprimés sans transmission**. Après création du compte réel demandé, sa seule invitation a été traitée dans une file dédiée ; un worker propre à `jb_hotel` traite maintenant les nouveaux envois. L’ancien worker identifié appartenait à une autre base et n’a pas été touché.

### 6N — Nombre de jours automatique (demande du 20/11/2026, D-055)

- [x] Choix confirmé par l’utilisateur : différence entre les dates, **du 20 au 23 = 3 jours**.
- [x] Création : nombre de jours en lecture seule, recalcul immédiat et devis actualisé ; minimum existant d’une unité le même jour.
- [x] Prolongation : jours ajoutés calculés depuis le départ actuel, montant historique conservé, aperçu et confirmation explicite.
- [x] Serveur : quantité incohérente refusée au devis, à la création et à la prolongation ; demi-journée et contrôle des 12 h conservés.
- [x] Tests ciblés : 48 backend (436 assertions) et 16 frontend, dates absentes/inversées, changement de mois/année, année bissextile, modification des deux dates, transmission au devis et à la création.
- [x] Vérification générale : **216 tests backend (1 539 assertions), 90 tests frontend**, Pint, Larastan niveau 6, lint, Prettier, TypeScript et build réussis ; quatre routes du serveur actif et rechargement sans erreur JavaScript. Base de développement préservée, tests sur `jb_hotel_test` avec e-mails simulés.

### 6O — Départs dépassés et menu Alertes (demande du 20/11/2026, D-056)

- [x] Une chambre en cours de séjour après sa fin prévue reste occupée dans le planning et les disponibilités ; devis et création/confirmation vérifient la même règle, jusqu’au départ réel ou à la prolongation.
- [x] Menu « Alertes » et cloche avec compteur réel, vue d’ensemble, recherche client/chambre automatique, filtre par forfait, pagination et liens vers les séjours (UUID). Style de l’aside conservé.
- [x] Dépassement présenté en jours/heures/minutes, fiche signalée, actualisation toutes les 30 secondes et au retour sur la fenêtre. Départ/prolongation : invalidation du cache immédiate.
- [x] Autorisation `reservations.view` ; actions de départ/prolongation gardent leurs droits et confirmations. Aucun frais ni clôture automatique, aucune migration, données métier conservées.
- [x] Tests ciblés : 24 backend (218 assertions) et 16 frontend ; limites temporelles, disponibilité, réservation, conflits, départ, prolongation, droits, filtres, pagination, mise à jour automatique et résolution du compteur.
- [x] Vérification générale : **222 tests backend, 96 tests frontend et 5 tests navigateur réussis**. Régression départs dépassés rejouée : 6 tests, 80 assertions. Pint, Larastan, lint, Prettier, TypeScript, build et contrôle du serveur actif verts ; affichage et accessibilité des alertes contrôlés sur bureau/mobile. Débordement de 4 px à 320 px corrigé dans le fil d’Ariane, recette visuelle globale verte.

### 6P — Menu latéral réductible sur PC (demande du 20/11/2026, D-057)

- [x] Bouton réduire/déployer dans la barre du haut ; rail compact de 80 px, grille centrale qui récupère l’espace, y compris au-delà de 1 600 px de contenu.
- [x] Préférence conservée à la navigation et au rechargement ; bouton utilisable même si le stockage local est refusé.
- [x] Icônes, état actif, infobulles, libellés accessibles et déconnexion conservés ; tiroir mobile complet, impression indépendante.
- [x] Contrôles ciblés : 3 tests frontend et 1 test navigateur (clavier, largeurs réelles, rechargement, PC/mobile, accessibilité).
- [x] Vérification générale : **99 tests frontend réussis**, lint, Prettier, TypeScript, build et serveur actif verts. Deux tests navigateur rejoués : repli PC et recette visuelle globale. Largeurs 1 024, 1 440 et 1 920 px, retour au tiroir mobile, rechargement et audit d’accessibilité vérifiés. Aucun changement backend ni remise à zéro de base pour cette évolution.

### 6Q — Corrections de la caissière et suppression par l’administrateur (demande du 20/11/2026, D-058)
> Choix de l’utilisateur : la caissière corrige ses saisies du jour ; suppression définitive réservée à l’administrateur (clients sans séjour, réservations sans argent ni facture, chambres et catégories inutilisées, comptes sans activité), avec fenêtre d’avertissement et copie complète dans le journal. Encaissements et factures émises : jamais supprimés (annulation tracée, avoir).
- [x] Caissière : annuler un encaissement qu’elle a saisi aujourd’hui (non remboursé), avec motif, puis le ressaisir ; collègue ou veille : 403 `payment_cancel_not_allowed`, l’administrateur garde la main
- [x] Modifier une réservation (dates, heures, chambre, forfait, quantité) tant qu’elle n’est ni commencée ni facturée : disponibilité sous verrou, capacité, journées calendaires, nouveau prix (même remise), motif, audit, e-mail au client ; jamais sous l’encaissé ; facturée : administrateur seulement, facture remplacée
- [x] Droit `records.delete` (administrateur, jamais attribuable à un autre rôle, migration pour les bases existantes) et suppressions contrôlées : clients sans séjour, réservations sans argent ni document, chambres jamais réservées, catégories vides, comptes jamais utilisés ; copie complète au journal ; clés étrangères en filet de sécurité
- [x] Écrans : « Supprimer » (administrateur) sur les fiches client et réservation, les chambres, catégories et comptes ; fenêtre d’avertissement (alertdialog) avec motif et case de confirmation ; « Modifier la réservation » en deux temps ; « Annuler » proposé à la caissière sur ses encaissements du jour
- [x] Tests : 8 backend nouveaux ou réécrits (229 au total), 4 frontend (103 au total) ; documentation D-058, CHANGELOG, CLAUDE.md

### 6R — Design : vérification de facture, mot de passe oublié, connexion (demande du 20/11/2026, D-059)
- [x] Page publique de vérification de facture : en-tête de l’hôtel, verdict clair (authentique, annulée, introuvable), montant mis en avant, aide et contact, mobile et impression ; tests de vérification verts
- [x] Mot de passe oublié : lien sur la connexion, page de demande ; **compte vérifié avant l’envoi** (introuvable 404, désactivé 403, adresse non joignable 422), e-mail avec lien valable 60 min à usage unique, nouveau mot de passe ; jetons d’invitation séparés (table `invitation_tokens`)
- [x] Pages d’accès harmonisées (connexion, mot de passe oublié, choix du mot de passe) : carte centrée sans image, bandeau vert et or, règles du mot de passe vérifiées en direct
- [x] Tests : 231 backend, 107 frontend, 7 parcours navigateur (dont centrage et accessibilité de la connexion) ; captures PC et mobile inspectées

### 6S — Pages d’erreur et page Paramètres (demande du 20/11/2026, D-060)
- [x] Pages d’erreur de l’application : 404, accès refusé (403), accès à configurer, erreur inattendue (500), avec code, message, aide et actions (composant commun `ErrorState`)
- [x] Pages d’erreur du serveur (liens publics) : 403, 404, 419, 429, 500, 503, et génériques 4xx et 5xx (ex. 505), en français, sans détail technique ni lien vers l’espace du personnel ; l’API garde ses erreurs JSON
- [x] Page Paramètres redessinée : vue d’ensemble, légende, règles regroupées par domaine, valeur et statut lisibles, référence et date de modification, envoi des e-mails ; aucune valeur changée
- [x] Tests : 3 backend (234 au total, Pint et Larastan verts), 2 frontend nouveaux et test Paramètres réécrit (109 au total), 1 parcours navigateur nouveau (8 au total, tous verts) avec audit d’accessibilité des pages 404 ; contraste du gris des règles corrigé (4,41 → 5,56) après l’audit Axe ; captures PC et mobile inspectées ; D-060, CHANGELOG, CLAUDE.md et RAPPORT à jour

## Phase 7 — Reporting ✅

- [x] API d'agrégation, indicateurs définis (facturé ≠ encaissé ≠ chiffre d'affaires)
- [x] Filtres par période, type, chambre et caissière
- [x] Graphiques, ventilation VIP et Standard, journal de caisse
- [x] Export CSV et PDF
- [x] Rapprochement des encaissements, paiements et remboursements

- [x] Création d’utilisateur sans mot de passe confirmée (20/11/2026) : libellé « Mot de passe (facultatif) », aide sur le lien envoyé et confirmation laissée vide. Le serveur accepte déjà l’absence de mot de passe et envoie l’invitation pour le choisir. Contrôles ciblés : 12 tests frontend d’administration et 1 test backend complet (15 assertions), TypeScript, lint, build et serveur actif verts.

- [x] Invitation du compte administrateur réel renvoyée sur demande (20/11/2026) : nouveau lien valable 72 h, ancien lien remplacé, confirmation d’envoi dans l’audit et aucune tâche restante dans la file dédiée.

### Remise à zéro et nouvel administrateur réel — 20/11/2026 ✅

- [x] Cible contrôlée : `jb_hotel`, 28 tables ; maintenance temporaire et sauvegarde SQL complète avec SHA-256 avant toute suppression (`backups/jb-hotel-20261120-001448-2d5a69.sql`, hors Git).
- [x] Suppression transactionnelle des données métier et techniques transitoires : clients, chambres, catégories, tarifs, réservations/occupants/prolongations, caisse, factures/avoirs, historiques, séquences documentaires et anciennes files. Compte administrateur de référence, rôles, droits, réglages et schéma conservés.
- [x] Contrôles après suppression : zéro donnée métier et zéro ancien envoi ; API/base opérationnelles, maintenance levée, serveur frontend actif vérifié sans page blanche.
- [x] Compte administrateur réel demandé créé via le service métier, actif et doté des 27 permissions ; mot de passe choisi par son titulaire depuis un lien d’invitation, sans réutiliser le secret SMTP.
- [x] Invitation autorisée envoyée via une file dédiée, audit confirmé, lien valable 72 h ; worker local correctement rattaché à `jb_hotel` démarré pour les prochaines notifications. File finale vide et aucun échec définitif.
- [x] L’ancien administrateur reste disponible pendant la prise en main du compte réel ; les catalogues et opérations restent vides pour les nouveaux enregistrements.

## Phase 8 — Qualité et livraison 🟡 (livraison locale vérifiée)

- [~] Migrations propres : suites locales sur MariaDB ; MySQL 8.4 prévu dans la CI (Docker absent du poste, nouvelle exécution distante non réalisée)
- [x] Tests : **222 backend / 99 frontend / 6 scénarios navigateur** vérifiés le 20/11/2026 ; Pint, Larastan niveau 6, lint, Prettier, TypeScript, build et contrôle du serveur actif verts. Recette navigateur complète rejouée ; 60 + 21 + 12 contrats réels antérieurs (administration, filtres, D-053, SMTP)
- [x] Contrôle d’accès : permissions API et routes frontend, CSRF réel, UUID des annuaires, export réservé à `reports.export`, données d’audit sans secrets et erreurs françaises ; tests verts
- [x] Sauvegarde et restauration réelle vérifiées : `php infra/database-backup.php --verify`, 27 tables avec nombres de lignes identiques et empreinte SHA-256 ; cible de contrôle distincte et refus d’une base déjà remplie
- [x] PDF A4 : export navigateur téléchargé, deux pages rendues et inspectées ; journal imprimé complet même si la liste est paginée à l’écran
- [!] Impression sur l’imprimante de l’hôtel et validation visuelle humaine finale à réaliser sur place
- [x] Matrice exigences → tests → résultats : `docs/RECETTE.md` ; guide de configuration, livraison et sauvegarde : `docs/EXPLOITATION.md`
- [x] CI étendue : MySQL 8.4, Playwright/Chromium et Axe ; diagnostics conservés en cas d’échec
- [~] Nouvelle exécution GitHub Actions à vérifier après envoi des changements ; aucune CI distante ni aucun déploiement déclenché pendant cette session

## Critères d'acceptation (fiche 06)

- [x] Deux caissières ne peuvent pas confirmer la même chambre pour des périodes incompatibles (test de concurrence réel, deux processus)
- [x] Une chambre en maintenance ne peut pas être réservée (409, testé)
- [x] Un client avec 2 occupants paie le même tarif qu'avec 1, si la capacité est respectée ; au-delà, refus (testé)
- [x] Tarif passé de 50 000 à 60 000 FCFA : l'ancienne facture reste à 50 000, la nouvelle réservation est à 60 000 (testé : réservations et factures)
- [x] Une avance de 20 000 sur 50 000 laisse un solde de 30 000, avec un reçu par versement (testé)
- [x] Une réduction de 10 % sur 50 000 donne 45 000, utilisateur et motif enregistrés (testé ; au-delà de 10 %, refus pour la caissière)
- [x] Les remboursements diminuent les encaissements nets sans effacer le paiement initial (testé)
- [x] Les indicateurs de caisse se rapprochent des transactions enregistrées (FinancialReportTest : journal, série quotidienne et catégories ; remboursements, annulations et avoirs)
- [x] Une caissière sans le droit nécessaire ne peut pas modifier un tarif : permission absente du rôle et API des tarifs en 403 (testé en phases 2 et 3)
- [~] Factures imprimables en A4 ; données conservées après redémarrage. PDF A4 généré côté serveur (testé) et données en base MySQL/MariaDB ; recette d'impression papier à faire en phase 8

## Questions en attente de l'hôtel

Voir `docs/QUESTIONS.md`. Questions **P1**, qui bloquent la mise en production :
- Q-01 : règles horaires de la journée restantes ; comptage des dates confirmé (D-055) ;
- Q-02 et Q-03 : période bloquée sans heure ;
- Q-07 : réservations non payées ;
- Q-08 : remboursements ;
- Q-09 : facturation en RCA.


## Livraison de cette session

- Administration et rapports accessibles dans l’application locale : `http://localhost:5173`.
- Phases 6C, 6D et 7 envoyées sur `main` (commit `eabbbbf`) ; 6L (D-053) envoyée ensuite. Aucun déploiement.
- Les données de travail n’ont pas été réinitialisées. Les E2E utilisent exclusivement `jb_hotel_e2e` ; la restauration de contrôle utilise `jb_hotel_restore_test`.
- Restent externes à la livraison locale : validation P1 par l’hôtel, SMTP réel (Q-22), mentions légales, impression papier et confirmation de la nouvelle CI sur MySQL 8.4.
