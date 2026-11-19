# Décisions et arbitrages — JB Hôtel

Ce fichier consigne les choix techniques et les arbitrages entre documents, comme l'exige `06_PROMPT_AGENT_IA_IMPLEMENTATION.md`.

Chaque décision porte l'un des statuts suivants :
- **Validé** : décision confirmée par l'hôtel ou par la section « Décisions confirmées V6 ».
- **Technique** : choix d'implémentation, sans impact métier.
- **Provisoire** : valeur configurable, utilisée pour avancer et pour les tests. Elle **n'est pas une règle validée** et doit être confirmée avant la mise en production (voir `QUESTIONS.md`).

## Règle de priorité entre documents

Chaque document se termine par les sections « Règles validées : demi-journée, validation et messages » et « Décisions confirmées V6 ». Ces sections sont les plus récentes : elles priment sur le texte plus ancien du même document. Pour toute autre contradiction, on privilégie l'intégrité des données, la traçabilité et les exigences explicitement validées.

## Contradictions relevées et arbitrage

| # | Contradiction | Arbitrage |
|---|---|---|
| C-01 | 02 et 06 : « MySQL ou PostgreSQL » ; V6 : MySQL 8+ seul | **MySQL 8+ InnoDB, utf8mb4** (V6) — voir D-002 |
| C-02 | 06 : « ne pas coder arbitrairement 12 heures » ; règles validées : demi-journée ≤ 12 h | **Demi-journée = forfait pour toute durée positive jusqu'à 12 h incluses** — voir D-007 |
| C-03 | 09 et MCD : colonne `users.role` ; V6 : `spatie/laravel-permission` | Rôles gérés **uniquement par Spatie**, colonne `users.role` supprimée — voir D-006 |
| C-04 | 02 : fiche client réduite (nom, téléphone) ; V6 : fiche détaillée | Fiche détaillée de V6 (déjà présente dans 09) |
| C-05 | 09 incomplet par rapport aux spécifications | **Résolu en phase 2.** Les migrations ajoutent les horodatages, les tables Spatie, `settings`, `document_sequences`, l'arrivée et le départ effectifs, l'annulation, l'auteur et le motif de la remise, le numéro de reçu et les avoirs. Le détail des écarts est dans [SCHEMA.md](SCHEMA.md). La maintenance planifiée reste ouverte (Q-12). |
| C-06 | 06 : documents dans `docs/` ; dossier livré à plat | Spécifications déplacées dans `docs/` ; ancienne version V2 archivée dans `docs/archive/` |

## Décisions

### D-001 — Organisation du dépôt (Technique)
Le dossier du projet est la racine du dépôt (`jb-hotel/` dans la fiche 06). Il contient deux applications indépendantes, `backend/` (API Laravel) et `frontend/` (React + TypeScript), ainsi que `docs/` et `infra/`. Le fichier `CHECK_LEVEL.md`, à la racine, suit l'avancement.

### D-002 — SGBD (Validé + Technique)
- **Cible : MySQL 8+ InnoDB, utf8mb4** (`utf8mb4_unicode_ci`).
- **Développement local : MariaDB 10.4 (XAMPP)**. Le poste de développement n'a ni MySQL 8 ni Docker. Le code doit donc fonctionner sur les deux moteurs :
  - éviter les fonctions propres à MariaDB ;
  - éviter les fonctions de MySQL 8 absentes de MariaDB 10.4 : `SKIP LOCKED`, index sur chemin JSON, colonnes générées sur JSON ;
  - ne pas dépendre du type JSON natif : MariaDB le stocke en `LONGTEXT`.
- La CI exécute les tests sur **MySQL 8.4**. La recette finale se fait sur MySQL 8.
- `infra/docker-compose.yml` fournit un service MySQL 8.4. Il n'a pas été testé localement, faute de Docker.

### D-003 — Version de Laravel (Technique)
**Laravel 12** sur PHP 8.2 : Laravel 13 exige PHP 8.3, absent du poste. Une montée de version reste possible plus tard.

### D-004 — Pile frontend (Technique)
React 19, TypeScript, Vite 8, React Router, TanStack Query, React Hook Form + Zod, Vitest + Testing Library, oxlint + Prettier.

### D-005 — Authentification (Technique, à implémenter en phase 2)
**Laravel Sanctum en mode SPA** : session par cookie et protection CSRF, sans jeton bearer stocké dans `localStorage`, pour limiter le risque de vol par XSS.
- Le frontend et l'API doivent partager le même domaine enregistrable : `localhost` en développement, des sous-domaines du même domaine en production.
- CORS est configuré avec `supports_credentials`.

### D-006 — Rôles et permissions (Validé)
`spatie/laravel-permission`. Rôles initiaux : `admin` et `caissiere`. Les autorisations sont vérifiées par des policies et des permissions fines, côté serveur. La colonne `users.role` de 09 n'est pas créée : Spatie est l'unique source de vérité. Le champ `active` est conservé.

### D-007 — Demi-journée (Validé)
- Forfait pour toute durée positive **jusqu'à 12 h incluses**, sans facturation horaire.
- Au-delà de 12 h, l'application affiche une alerte. La caissière doit valider explicitement la prolongation et le supplément, après vérification des conflits et affichage du montant proposé.
- L'opération est journalisée : auteur, date, ancien et nouveau montant.
- **Aucune conversion automatique en journée.** La durée de 12 h est un paramètre de configuration.

### D-008 — Montants et arrondis (Validé + Provisoire)
- Montants en **entiers FCFA (XAF)**, colonnes `BIGINT`. Aucun flottant dans les calculs.
- **Provisoire :** la remise en pourcentage est arrondie au FCFA le plus proche, demi supérieur (arrondi commercial), sur le montant de la remise. La règle est paramétrable (Q-05).

### D-009 — Période bloquée sans heure (Provisoire, politique conservatrice)
Tant que l'hôtel n'a pas tranché (Q-02, Q-03) :
- heure d'arrivée absente : la chambre est bloquée **dès 00:00** de la date de début ;
- heure de départ absente : la chambre est bloquée **jusqu'à la fin** (24:00) de la date de fin ;
- deux réservations le même jour sans heure sont donc **toujours en conflit** ;
- l'interface signale une réservation dont la période est déduite (« période ambiguë »).

La politique est paramétrable et couverte par des tests.

### D-010 — Fuseau horaire (Provisoire, à confirmer Q-13)
Fuseau de l'application : **`Africa/Bangui`** (UTC+1, sans heure d'été), configurable par `APP_TIMEZONE`. Les dates et heures de séjour sont des heures locales de l'hôtel.

### D-011 — Langue et contrat d'erreur API (Validé + Technique)
- Langue de l'application : `fr`. Tous les messages destinés aux utilisateurs sont en français.
- Les erreurs de l'API sont renvoyées en JSON : `{ "title", "message", "errors"? }`. Aucune trace technique n'est exposée.
- Le frontend affiche ces erreurs dans une modale accessible et conserve les saisies.
- Les codes traités sont 401, 403, 404, 409, 419, 422, 429, 500 et 503. Pour une erreur réseau, le message est « Connexion impossible. Vérifiez votre connexion et réessayez. »

### D-012 — Versionnement de l'API (Technique)
Toutes les routes métier sont préfixées par `/api/v1`.

### D-013 — Base de test (Technique)
Les tests backend tournent sur une base MySQL ou MariaDB dédiée (`jb_hotel_test`), **pas sur SQLite**. Le verrouillage, la concurrence et les contraintes doivent être testés sur le moteur réel.

### D-014 — Trop-perçu (Provisoire)
Pas de procédure de trop-perçu en V1. La somme des paiements nets (paiements validés moins remboursements) ne peut pas dépasser le montant net dû.

### D-015 — Numérotation des factures (Provisoire, à confirmer Q-09)
Format `FAC-AAAA-NNNNNN` : séquence annuelle continue, sans trou, attribuée dans la transaction d'émission. Le format reste à confirmer selon les obligations fiscales de la RCA.

### D-016 — Plafond de remise de la caissière (Provisoire, à confirmer Q-06)
Le plafond est enregistré dans les paramètres et modifiable par l'administrateur. Valeur provisoire par défaut : **10 %** du montant brut pour la caissière. L'administrateur n'a pas de plafond, mais le total net doit rester ≥ 0.

## Décisions de la phase 2 (base de données et identité)

### D-017 — Quantité entière (Provisoire, Q-04)
`reservations.quantity` est un entier strictement positif, et non le `NUMERIC(10,2)` du schéma 09. La demi-journée existe déjà comme unité : une quantité entière évite tout arrondi. Si l'hôtel valide des quantités fractionnaires, une migration changera le type et un test sur les arrondis sera ajouté.

### D-018 — Intervalle bloqué stocké (Technique)
Chaque réservation stocke l'intervalle réellement bloqué (`blocked_from`, `blocked_until`). Le service de réservation le calcule à partir des dates, des heures et de la politique D-009. La détection des conflits porte sur cet intervalle, indexé : deux réservations sont en conflit si `A.blocked_from < B.blocked_until` et `B.blocked_from < A.blocked_until`. Le drapeau `period_is_estimated` signale une période déduite faute d'heure. Si la politique change, une commande recalculera l'intervalle des réservations actives.

### D-019 — Maintenance par statut courant (Provisoire, Q-12)
`rooms.maintenance_status` prend la valeur `AVAILABLE` ou `MAINTENANCE`, comme dans le schéma 09. Une chambre en maintenance n'est réservable sur aucune période. Si l'hôtel valide des périodes planifiées, une table dédiée sera ajoutée.

### D-020 — Rôles et permissions (Validé + Provisoire)
- **27 permissions fines** (`PermissionName`). Le rôle `admin` les a **toutes** et ne peut pas être modifié.
- Les permissions du rôle `caissiere` sont modifiables par l'administrateur, avec trace dans l'audit. Les modifications sont conservées lors d'un nouveau seed.
- **Provisoire (Q-08, Q-14) :** sont réservés à l'administrateur la modification des tarifs, le dépassement du plafond de remise, l'annulation d'encaissement, les remboursements, les avoirs, l'export des rapports, les paramètres, l'audit et la gestion des utilisateurs.

### D-021 — Aucune suppression (Validé)
Toutes les clés étrangères sont en `RESTRICT`. On désactive les utilisateurs et on annule les réservations et les paiements ; un remboursement est une nouvelle ligne. Le modèle `AuditLog` refuse toute modification ou suppression.

### D-022 — Journal des modifications de réservation (Technique)
Il n'y a pas de table dédiée. Les prolongations, annulations, remises et changements de montant sont tracés dans `audit_logs`, avec l'état avant et après (`before_json`, `after_json`), dans la même transaction que l'opération.

### D-023 — Comptes de démonstration et premier administrateur (Validé, fiche 06)
- **Aucun identifiant n'est codé en dur.**
- `DemoUsersSeeder` crée `admin@jbhotel.local` et `caissiere@jbhotel.local` **uniquement en local et en test**. Le mot de passe vient de `DEMO_USERS_PASSWORD`, ou il est généré aléatoirement puis affiché.
- En production, le premier administrateur se crée avec `php artisan jb:create-admin` ; le mot de passe y est saisi de façon masquée.

### D-024 — `DATETIME` plutôt que `TIMESTAMP` (Technique)
Ce choix évite la limite de 2038 et les conversions de fuseau de MySQL. Les valeurs sont des heures locales de l'hôtel (D-010).

### D-025 — Protections de l'authentification (Technique)
- 5 tentatives de connexion par minute pour un même couple e-mail + adresse IP.
- Un compte désactivé est refusé à la connexion, et une session déjà ouverte est fermée dès sa requête suivante.
- Un administrateur ne peut ni se désactiver ni se retirer son propre rôle.
- Le dernier administrateur actif ne peut pas être désactivé ni rétrogradé.
- La connexion n'est possible que depuis l'application frontend, avec session et CSRF ; sinon elle est refusée avec une erreur 400.

## Décisions transverses

### D-026 — Identifiants publics UUID dans toutes les routes et tous les liens (Validé, demande du 19/11/2026)
- Chaque entité exposée (utilisateurs, clients, types de chambre, chambres, tarifs, réservations, occupants, paiements, remboursements, factures, journal d'audit) possède une colonne **`uuid`** (UUID v7, ordonné dans le temps), unique et obligatoire.
- **Seul l'UUID apparaît** dans les URL de l'API (`/api/v1/users/{uuid}`), dans le champ `id` des réponses JSON, dans les références envoyées par le frontend (`room_type_id` = UUID) et dans les routes du frontend (`/reservations/:id`).
- La clé primaire entière reste **interne** : clés étrangères, jointures, journal d'audit. Elle n'est jamais exposée.
- Une route appelée avec un entier ou un identifiant mal formé répond 404 « Élément introuvable ».
- Exception : les rôles sont désignés par leur **code** (`admin`, `caissiere`), qui est une référence stable et non séquentielle, et non par un identifiant.
- Mise en œuvre : trait `App\Shared\Models\HasPublicUuid` sur chaque modèle, migration `2026_11_19_160000_add_public_uuids` (UUID attribué aux lignes existantes).

## Décisions de la phase 3 (catalogue et tarifs)

### D-027 — Chaîne des versions tarifaires (Validé + Technique)
- Pour chaque couple (type de chambre, unité), les versions se suivent **sans trou ni chevauchement**. Publier une version donne pour date de fin à la version précédente la date d'effet de la nouvelle. Une version insérée avant une version déjà programmée se termine au début de celle-ci.
- **Aucun montant n'est jamais modifié.** Seule la date de fin de la version précédente est renseignée. Les réservations et factures existantes gardent leur prix (recette 5, testée).
- Une date d'effet **passée** est refusée (`rate_in_past`), avec une tolérance d'une minute. Deux versions ne peuvent pas commencer au même instant : refus côté service (`rate_version_conflict`) et index unique en base.
- Une version **programmée** (pas encore entrée en vigueur) peut être **retirée** par l'administrateur : la version précédente est alors prolongée d'autant, et l'opération est tracée dans l'audit. Une telle version n'a jamais été appliquée, puisque le tarif est figé à la confirmation (invariant 3 de 02). Une version en vigueur ou expirée ne se retire pas (`rate_already_effective`) : il faut publier une nouvelle version.
- Le motif est **obligatoire** à chaque publication (historique : ancien tarif, nouveau tarif, auteur, date d'effet, motif).
- Les publications sur un même type de chambre sont sérialisées par un verrou sur la ligne du type.

### D-028 — Catalogue (Technique)
- Le **code** d'un type de chambre (`VIP`, `STANDARD`) est une référence stable : il ne se modifie pas ; seuls le libellé et la description le peuvent. Les types VIP et Standard sont créés dans tous les environnements (`RoomTypesSeeder`).
- Les chambres et les types **ne se suppriment pas**. Une chambre hors service passe en maintenance (D-019). La liste des chambres n'est pas paginée (quelques dizaines de chambres) et suit un tri naturel par numéro.
- Le filtre « disponibilité sur une période » de la page Chambres dépend des réservations : il arrive en phase 4.
- Les autres modules n'utilisent que l'API publique `App\Modules\RoomCatalog\Contracts` (`CurrentPriceProvider`, `RoomDirectory`, `BillingUnit` et les DTO).
- Le catalogue de démonstration (chambres 001, 002, 101, 102, 201 ; VIP journée à 50 000 FCFA…) est **local uniquement**. Ses montants ne sont pas les tarifs de l'hôtel.
