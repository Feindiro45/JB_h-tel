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

## Décisions de la phase 4 (clients et réservations)

### D-029 — Une réservation en attente bloque la chambre (Provisoire, Q-19)
Les statuts **en attente, confirmée et en cours** bloquent la chambre sur leur période ; les statuts terminée et annulée la libèrent. Une réservation en attente est donc protégée contre la double réservation. Le prix calculé à sa création n'est qu'une estimation : **à la confirmation**, c'est le tarif alors en vigueur qui est figé (invariant 3), et l'ancien et le nouveau montant sont journalisés. Il n'y a pas d'expiration automatique des réservations en attente (Q-07).

### D-030 — Prix d'une prolongation (Provisoire, Q-18)
Le supplément est calculé au **prix unitaire figé de la réservation** (le client conserve le prix de sa réservation) : brut = prix unitaire × nouvelle quantité. Une remise en pourcentage s'applique au nouveau brut, et son plafond n'est pas revérifié puisqu'il a été autorisé à la création ; une remise fixe reste inchangée. La prolongation se fait en deux temps :
1. `POST …/extension/preview` affiche, sans rien modifier, le supplément, le nouveau montant et les conflits ;
2. `POST …/extension` exige `confirm: true`. L'auteur, la date, l'ancien et le nouveau montant sont journalisés.

Pour une demi-journée, la règle des 12 h est revérifiée sur la nouvelle période. Il n'y a **aucune conversion automatique** en journée.

### D-031 — Règles de saisie et de cycle de vie (Provisoire, Q-14, Q-20)
- La date d'arrivée ne peut pas être passée (`after_or_equal:today`).
- L'arrivée (check-in) n'est possible que pour une réservation **confirmée**, à partir de son jour d'arrivée, dans une chambre qui n'est ni en maintenance ni encore occupée par un séjour non clôturé.
- Le départ (check-out) clôture le séjour et libère la chambre. **Aucun montant n'est recalculé** en cas de départ anticipé (Q-15).
- L'annulation, avec un motif obligatoire, est possible pour une réservation en attente ou confirmée. Elle est **impossible après l'arrivée** : il faut enregistrer le départ. Les paiements éventuels seront traités en caisse (phase 5).
- Les occupants peuvent être modifiés tant que la réservation est ouverte, avec contrôle de la capacité. Un seul occupant est principal : le premier marqué comme tel, sinon le premier saisi.

### D-032 — Anti double réservation (Validé, invariant 1)
Dans la transaction de création, de confirmation ou de prolongation :
1. la **ligne de la chambre est verrouillée** (`SELECT … FOR UPDATE`, contrat `RoomDirectory::lockForReservation`) ;
2. la maintenance et les conflits sont revalidés sur l'intervalle bloqué ;
3. la réservation est enregistrée.

Deux caissières sont ainsi servies l'une après l'autre, et la seconde voit la réservation de la première. Le test de concurrence lance **deux vrais processus PHP** et vérifie dans `information_schema.INNODB_TRX` que le second attend le verrou.

### D-033 — Détails des erreurs métier (Technique)
`BusinessRuleException` peut porter des `details`, une liste de phrases d'aide à la correction : réservations en conflit, durée, quantité nécessaire et supplément proposé pour une demi-journée, nouveau montant d'une prolongation. Le JSON d'erreur les renvoie dans `details`, que la modale du frontend affiche sous le message. Ces détails ne sont jamais renvoyés pour une erreur 5xx.

### D-034 — Frontières entre modules (Technique)
Reservations n'utilise que les contrats publics de RoomCatalog (`RoomDirectory`, `CurrentPriceProvider`, `BillingUnit`) et de Customers (`CustomerDirectory`), jamais leurs modèles. Pour valider l'existence d'un UUID, les requêtes HTTP utilisent toutefois la règle `exists` sur les tables concernées : c'est une lecture simple, acceptée par pragmatisme.

## Décisions de la phase 5A (caisse)

### D-035 — Encaissements, reçus et remboursements (Validé + Provisoire)
- **Un reçu par paiement :** numéro `REC-AAAA-NNNNNN`, continu et sans trou par année. Il est attribué par `DocumentNumberer` sous verrou, dans la transaction de l'encaissement : un encaissement refusé ne consomme pas de numéro. Le préfixe est paramétrable (`billing.receipt_number_prefix`).
- **Encaissé net** = paiements validés − remboursements. **Solde** = montant exigible − encaissé net. Les statuts affichés sont : Non payé, Partiellement payé, Soldé, Trop-perçu à rembourser. Une réservation **annulée** n'exige plus rien : ce qui a déjà été versé apparaît comme trop-perçu à rembourser, et le remboursement est une opération explicite. **Remplacé par D-053 (19/11/2026) :** l’annulation rembourse désormais l’encaissé dans la même opération ; le trop-perçu ne concerne plus que les annulations antérieures.
- **Pas de trop-perçu (D-014) :** un versement supérieur au solde est refusé, avec le détail du montant, de ce qui est déjà encaissé et du solde restant. Chaque encaissement verrouille la réservation (contrat `ReservationLedger::lockForPayment`), ce qui empêche deux versements simultanés de dépasser ensemble le montant dû.
- **Date de l'encaissement :** l'heure du serveur. Aucun antidatage n'est possible.
- **Annulation d'un encaissement :** motif obligatoire, statut `CANCELLED`, jamais de suppression. Impossible si le paiement a déjà été partiellement remboursé.
- **Remboursement :** une ligne distincte avec motif, auteur et date, dans la limite du montant encore remboursable sur le reçu. Le paiement initial reste intact.
- **Provisoire (Q-08) :** la caissière encaisse ; l'annulation d'un encaissement et le remboursement sont réservés à l'administrateur (permissions `payments.cancel` et `refunds.create`).
- **Moyens de paiement :** liste paramétrable `payments.methods` (provisoire, Q-11) : espèces, mobile money, carte, virement.

## Décisions de la phase 5B (factures) et 5C (QR code)

### D-037 — Factures et avoirs (Validé + Provisoire, Q-09)
- **Facture figée à l'émission :** l'instantané (`snapshot_json`) copie l'en-tête de l'hôtel, le client, la chambre, la période, la ligne d'hébergement, le brut, la remise et son motif, le net, ainsi que **les versements et le solde à la date d'émission**. Le PDF A4 est généré côté serveur (dompdf) **à partir de cet instantané seulement** : un changement ultérieur de tarif, de client ou de paiement ne modifie jamais une facture (critère « l'ancienne facture reste à 50 000 », testé).
- **Immuable :** le modèle refuse toute modification et toute suppression. La seule évolution permise est le passage de « émise » à « annulée par avoir ».
- **Une seule facture active** par réservation. Pas de facture pour une réservation en attente ou annulée.
- **Correction par avoir total** (`AV-AAAA-NNNNNN`), qui recopie les montants de la facture créditée, avec le motif et l'auteur. Une nouvelle facture peut ensuite être émise, par exemple après une prolongation. Les avoirs partiels ne sont pas gérés en V1.
- **Numérotation :** `FAC-AAAA-NNNNNN` et `AV-AAAA-NNNNNN`, continues et sans trou, attribuées sous verrou par `DocumentNumberer`. Les préfixes sont paramétrables.
- **Provisoire (Q-09, Q-16) :** en-tête « JB Hôtel », avec adresse, NIF et RCCM lus dans `HOTEL_*` (vides par défaut) ; aucune TVA calculée.
- **Droits (provisoire) :** la caissière émet les factures ; seul l'administrateur émet un avoir (`invoices.credit`).

### D-038 — QR code et vérification publique (Validé, demande du 19/11/2026)
- Chaque facture et chaque avoir reçoit à l'émission un **code de vérification aléatoire** de 24 caractères, enregistré en base. Il n'apparaît ni dans le journal d'audit ni dans les réponses publiques.
- Le PDF porte un **QR code** pointant vers `VERIFICATION_BASE_URL/verification/factures/{uuid}?code={code}`. En production, `VERIFICATION_BASE_URL` doit être l'adresse publique de l'hôtel.
- La **page publique**, sans connexion, et son équivalent JSON (`GET /api/v1/public/invoices/{uuid}/verification?code=`) n'affichent que le strict nécessaire : type, numéro, date, émetteur, montant net, statut (émise ou annulée par avoir, avec le numéro de l'avoir) et les **initiales** du client.
- Les deux exigent l'UUID **et** le code, avec une comparaison à temps constant. Une facture inconnue et un code faux reçoivent **la même réponse** (404 « Document introuvable »). Le débit est limité à 30 requêtes par minute et par adresse, et les pages ne sont pas indexées par les moteurs de recherche (`noindex`).

## Décisions de la phase 5D (notifications par e-mail)

### D-039 — E-mails au client à chaque opération sur son séjour (Validé, demande du 19/11/2026 ; Provisoire pour l'envoi, Q-22)
- **Qui :** un client qui a donné son e-mail est prévenu automatiquement, sauf s'il s'est désinscrit (`customers.email_notifications`, actif par défaut). Sans e-mail, rien n'est envoyé.
- **Quand :** confirmation de la réservation (message de bienvenue), arrivée, prolongation, annulation, départ, reçu de chaque paiement, remboursement, **facture en PDF joint** (avec le QR code et le lien de vérification), avoir.
- **Comment :**
  - les événements métier sont émis après validation de la transaction ;
  - l'écouteur `NotifyCustomer` est **en file d'attente** (3 essais, avec reprise après 1 puis 5 minutes) ;
  - un envoi lent ou en échec ne bloque jamais l'opération, et une opération refusée n'envoie rien.
- **Contenu :** modèles en français (`resources/views/mail/stay.blade.php`) : titre, message, tableau récapitulatif (chambre, dates, montant, déjà réglé, reste à régler), bouton de vérification pour les factures.
- **Données personnelles :** chaque e-mail contient un **lien de désinscription signé**, qui ne peut pas être fabriqué pour un autre client et ne demande pas de connexion. La désinscription est tracée dans l'audit. L'adresse e-mail n'est jamais écrite dans le journal d'audit (`notification.sent` ne garde que le type de message).
- **Provisoire (Q-22) :** en local, les e-mails sont écrits dans `storage/logs` (`MAIL_MAILER=log`). En production, il faut le serveur SMTP et l'adresse d'expédition de l'hôtel, ainsi qu'un traitement de la file actif (`php artisan queue:work`, sous supervision).

### D-040 — Interface de la phase 6 : design du prototype, droits et indicateurs (Validé, demande du 19/11/2026 ; Provisoire pour les indicateurs)
- **Design :** l'interface reprend la charte et la structure du prototype `JB_Hotel_Prototype` (vert profond et or, barre latérale par groupes, cartes, badges, photo de l'hôtel sur la connexion), améliorée : composants accessibles (modales avec piège de focus, champs reliés à leur aide et à leur erreur par `aria-describedby`, statuts jamais portés par la seule couleur) et branchement sur l'API réelle. Le dossier du prototype reste hors du dépôt (`.gitignore`).
- **Droits :** la barre latérale et les routes sont filtrées selon les **permissions renvoyées par `/auth/me`**. L'accueil est la première page autorisée. Le serveur reste l'autorité : un bouton masqué n'est qu'un confort (exemple : « Enregistrer l'arrivée » n'apparaît qu'à partir de la date d'arrivée prévue, le serveur refusant de toute façon une arrivée anticipée en 409).
- **Session expirée :** toute réponse 401 en cours de travail affiche la modale « Session expirée » et renvoie à la connexion ; après reconnexion, l'utilisateur retrouve la page demandée.
- **Nouvelle réservation guidée :** client existant ou nouveau, occupants, période, chambres **réellement libres** pour la capacité demandée, devis du serveur en direct, remise, puis règlement (différé, intégral ou avance). Si la réservation échoue après la création du nouveau client, la fiche créée est conservée pour la nouvelle tentative (pas de doublon). Si l'encaissement échoue après la réservation, la réservation reste enregistrée et l'écran invite à reprendre l'encaissement depuis la fiche.
- **Indicateurs du tableau de bord (provisoire, à compléter en phase 7) :** encaissé net = versements validés − remboursements, par date de mouvement ; facturé = factures émises − avoirs, par date d'émission ; soldes à recevoir = montant net − encaissé net des réservations non annulées ; occupation = état calculé à l'instant de chaque chambre.

### D-041 — Journal de caisse, listes de documents et reçu imprimé (Validé + Provisoire)
- **Journal de caisse (`GET /cash-journal`) :** mêmes définitions que le tableau de bord (D-040).
  - **Encaissé** = versements au statut « valide », comptés à leur date de réception.
  - **Remboursé** = remboursements, comptés à leur date de traitement.
  - **Net** = encaissé − remboursé.
  - Un versement **annulé** reste listé, avec son motif, pour la traçabilité, mais il n'entre dans aucun total ; le montant annulé est affiché à part, pour mémoire.
- **Ventilations :**
  - **par moyen de paiement** : un remboursement sans moyen précisé est rattaché au moyen du versement d'origine ;
  - **par agent** : les versements comptent pour l'agent qui les a reçus, les remboursements pour celui qui les a traités.
- **Période :** le jour même par défaut ; **92 jours au plus**, les analyses plus longues relevant des rapports (phase 7). Provisoire (Q-23) : la caissière voit le journal de tous les agents (droit `payments.view`).
- **Soldes à encaisser (`GET /receivables`) :** réservations non annulées dont le solde est positif, du séjour le plus ancien au plus récent. Le total est calculé par la même requête que celui du tableau de bord.
- **Listes des documents :**
  - **reçus (`GET /payments`)** : la réservation, le client et la chambre sont lus par les contrats publics, en une requête groupée par module ;
  - **factures et avoirs (`GET /invoices`)** : ces informations sont lues dans l'**instantané figé** de chaque document, c'est-à-dire ce qui a été facturé. Les totaux suivent la règle « factures − avoirs ».
  - La recherche porte sur le numéro, la référence pour un reçu et le client (complément de la phase 6D). Pour les factures, la recherche du nom porte sur l’instantané JSON à travers le générateur SQL de Laravel, vérifié localement sur MariaDB et couvert par la CI MySQL.
- **Reçu imprimé :**
  - il est imprimé en A4 par le navigateur (CSS d'impression), avec l'en-tête de l'hôtel (`jbhotel.hotel`, provisoire, Q-09) ;
  - la « situation du séjour » indiquée sur le reçu est celle **du moment de l'impression**, datée sur le reçu : elle n'est pas figée au jour du versement ;
  - un reçu annulé porte la mention « Encaissement annulé », avec son motif.


### D-042 — Administration et paramètres
- Écrans chambres/catégories, versions tarifaires, comptes, droits, paramètres et audit branchés sur les API existantes. Les droits serveur restent obligatoires ; l’administrateur et le dernier compte actif restent protégés.
- Seuls le plafond de remise caissière et les moyens de paiement sont réglables. Les autres règles affichent leur statut et leur référence. Aucun écran ne transforme une politique provisoire en règle validée.
- Les moyens acceptés sont chargés par `/payment-methods` pour les nouveaux règlements. L’historique conserve les anciens moyens.

### D-043 — Rapports financiers : périmètres explicites, provisoires avant validation comptable
- Période inclusive, de 1 à 366 jours, en heure de Bangui ; montants entiers FCFA.
- Encaissé net : paiements valides par `received_at`, moins remboursements par `processed_at`. Le filtre agent désigne le caissier pour un versement et l’auteur pour un remboursement.
- Facturé net : toutes les factures moins tous les avoirs par `issued_at`, filtre agent sur l’émetteur. Une facture créditée reste comptée dans les factures, puis son avoir est déduit une seule fois.
- Réservations, montants réservés et remises : séjours confirmés/en cours/terminés débutant dans la période ; agent = créateur. Le montant réservé n’est pas un chiffre d’affaires comptable.
- Soldes : situation actuelle de ces séjours, tous mouvements compris, même hors période. Occupation : instantané actuel, priorité occupée → maintenance → réservée → libre, tous agents confondus. Aucun historique d’occupation n’est inventé.
- Chambre et catégorie : catalogue actuel ; montants des factures : instantanés figés. Cette distinction figure dans le rapport et ses exports.
- Les séries quotidiennes et catégories doivent se rapprocher de l’encaissé net. Exports réservés à `reports.export`, distinct de `reports.view`. CSV UTF-8 avec BOM et neutralisation des libellés pouvant être interprétés comme formules.

### D-044 — Pagination et recette isolée
- Listes paginées par le serveur : choix 10/25/50/100, 25 par défaut ; valeurs non autorisées ramenées au défaut. Petits catalogues, historique client et journal borné déjà chargés intégralement : filtrage puis pagination locale sans tronquer les données reçues. Les totaux restent calculés sur l’ensemble filtré.
- Recette navigateur sur `jb_hotel_e2e`, ports 8011/5174 et cookie dédié, sans modification de la base de travail. Réinitialisation limitée à cette base nommée explicitement.
- Sauvegarde SQL et restauration de contrôle dans `jb_hotel_restore_test`, uniquement si vide ; empreinte et comparaison des nombres de lignes. La restauration en production reste une opération d’exploitation distincte.


### D-045 — Référence visuelle du contenu et conservation de l’aside (demande du 19/11/2026)
- L’image « Tableau de bord financier de l’hôtel.webp » guide les surfaces claires, les icônes de titre, les indicateurs pastel, les onglets, les filtres et les tableaux.
- L’utilisateur a explicitement demandé de ne pas toucher l’aside : son JSX, ses liens et ses styles sont conservés. Le nouveau thème est limité à la zone de contenu, aux dialogues et à la connexion ; il ne s’applique qu’à l’écran pour préserver les documents imprimés.
- Les éléments de démonstration de l’image ne sont pas des données métier : aucun pourcentage de variation, notification, classement étoilé ou compteur n’est inventé. Les indicateurs restent ceux que l’API calcule réellement.

### D-046 — Boutons et icônes (demande du 19/11/2026)
- Une famille commune de boutons principaux, secondaires, actions compactes et actions sensibles, avec survol, appui, focus visible, état désactivé et chargement.
- Les icônes expriment l’action et complètent un libellé accessible : plus/création, crayon/modification, outil/maintenance, œil/consultation, entonnoir/filtre, imprimante, téléchargement, portefeuille/encaissement, retour/remboursement et croix/annulation.
- Les confirmations et les autorisations restent en place. Les icônes sont décoratives pour les lecteurs d’écran et les animations respectent le mouvement réduit. L’aside reste exclu.


### D-047 — Facture inspirée de la référence (19/11/2026)
- La référence « Facture élégante du JB Hôtel.webp » guide le PDF A4 : vert profond et or, en-tête illustré, sections client et séjour, tableau, montants et QR. L’image existante du projet est réutilisée en JPEG compressé sous `backend/resources/images/`.
- Les données proviennent uniquement du snapshot d’émission ; les versements, remboursements, remises et mentions de correction restent visibles. Les factures existantes ne sont pas recalculées.
- Les coordonnées de démonstration, la TVA à 0 %, l’échéance, les services inclus, les étoiles, le cachet et la signature de la référence ne constituent pas des règles ou données réelles. Ils ne sont pas ajoutés. Les règles fiscales de Q-09 restent à valider.
- Les avoirs partagent la charte et indiquent la facture corrigée et le motif. En-têtes répétés, numéros de page et bloc de clôture groupé pour les documents longs.

### D-048 — Application automatique des filtres (19/11/2026)
- Saisie textuelle pour une recherche serveur : délai de 300 ms, remplacé à chaque frappe. Choix et dates valides : application immédiate ; pas de bouton de validation.
- Chaque changement de filtre revient à la première page ; un changement explicite de page reste possible. Effacer annule également une recherche différée et conserve la taille de page choisie.
- Pendant une période incomplète/inversée, ou dépassant les bornes existantes de la caisse (92 jours) et des rapports (366 jours), conserver la dernière requête valide et annoncer l’état. Les filtres facultatifs des listes acceptent une seule borne.
- Les clés et signaux d’annulation de TanStack Query continuent de distinguer les requêtes ; une remise à zéro peut utiliser des résultats frais déjà en cache. Les filtres locaux restent immédiats.


### D-049 — Synthèses sur chaque page métier (19/11/2026)
- Le modèle de cartes de la caisse est généralisé aux listes, détails et pages d’administration. Les comptes sont calculés exclusivement sur les données retournées.
- Distinguer le total filtré de l’API des nombres calculés sur la page courante. Les indications « sur la page affichée », « ensemble du catalogue » ou « premier jour du planning » restent visibles. Aucun total global n’est déduit d’une page partielle.
- En attente des données : tiret ; absence de permission : accès limité. Les nouvelles synthèses ne sont pas ajoutées au document papier du reçu.

### D-050 — Boutons voisins et champs (19/11/2026)
- Actions en vert et bleu ; le bleu est la deuxième couleur demandée. Dans les groupes d’actions du contenu, alterner les couleurs des boutons/liens voisins selon les éléments effectivement présents ; les dialogues conservent un bouton de validation et un bouton de retour distincts.
- Actions destructives signalées en rouge, focus et état actif conservés. L’alternance n’affecte ni l’aside ni les commandes de pagination qui portent leurs propres états de navigation.
- Espacements renforcés entre cartes, formulaires et actions. Icônes décoratives par sens du champ, libellés et descriptions accessibles conservés ; une icône explicite peut être précisée dans le formulaire.

### D-051 — Chaque tableau dispose de ses contrôles (19/11/2026)
- Les listes distantes conservent le filtrage/pagination serveur. Les tableaux secondaires entièrement chargés utilisent `LocalTable` : recherche immédiate, pagination indépendante et retour en première page après une recherche.
- Une recherche locale ne recalcule pas les indicateurs comptables de la page, qui gardent leur périmètre annoncé. Les données quotidiennes des graphiques sont consultables avec leurs propres contrôles.
- À l’impression : masquer les commandes et rendre toutes les lignes déjà chargées du tableau local, puis restaurer filtre et page. Cela ne remplace pas les exports serveur pour une liste distante.

### D-052 — Occupation rouge et source de vérité (19/11/2026)
- Une chambre occupée est rouge dans la pastille, le planning, les cartes d’occupation et le graphique. Libre : vert ; réservée : bleu ; maintenance : ambre. Les libellés restent indispensables.
- La liste administrative reprend l’occupation courante calculée par l’API existante et propose un filtre. Charger cette information uniquement avec `reservations.view` ; aucune absence de donnée ne signifie « libre ».
- L’état d’occupation reste calculé ; aucune colonne d’occupation n’est ajoutée en base.

### D-053 — Annulation et prolongation sans écart avec la caisse ni la facture (Validé par l’utilisateur le 19/11/2026 ; Provisoire pour les frais, Q-08, Q-14)
- **Constat de l’utilisateur :** une réservation annulée restait comptée dans la caisse (250 000 FCFA encaissés, aucun remboursement) ; après une prolongation, la facture ne couvrait que le séjour initial. « Pareil pour une réservation non payée » : une annulation ne doit plus rien laisser dans les montants.
- **Annulation (choix « rembourser en même temps ») :** dans la transaction de l’annulation, l’encaissé net est remboursé intégralement (une ligne de remboursement par reçu, moyen choisi ou celui du versement, motif « Annulation de la réservation : … ») et la facture active est annulée par un avoir. Le montant à rembourser est confirmé par l’utilisateur (`refund_fcfa`, 409 `cancellation_refund_mismatch` s’il diffère) ; s’il est positif, le droit `refunds.create` est exigé (403 `cancellation_requires_refund`). Une réservation non payée reste annulable par la caissière ; sa facture éventuelle est créditée. Aucuns frais d’annulation ne sont retenus (Q-14 ouverte).
- **Montant dû :** la réservation et les listes exposent `amount_due_fcfa`, égal à 0 pour une réservation annulée ; le prix initial reste affiché pour mémoire. Les annulations antérieures encore payées sont listées à part dans la caisse (« Annulations à rembourser », `to_refund` de `GET /receivables`), jamais dans les soldes.
- **Prolongation (choix « automatiquement ») :** chaque prolongation est enregistrée dans `reservation_extensions` (période ajoutée, quantité, prix unitaire figé, ancien et nouveau net, auteur). Si le séjour est facturé, la facture active est annulée par un avoir et une nouvelle facture est émise dans la même transaction ; elle détaille le séjour initial et chaque prolongation et porte la mention « Facture remplaçant la facture n° … ». La somme des lignes est égale au sous-total ; la remise et le net restent ceux de la réservation. Sans facture, rien n’est émis : la facture suivante est détaillée.
- **Avoirs automatiques :** ils découlent d’une opération autorisée sur le séjour (annuler, prolonger) et ne demandent pas le droit d’émettre un avoir libre (`invoices.credit`), qui reste réservé à l’administrateur pour les corrections manuelles.
- **Architecture :** le module Reservations définit deux ports, `Contracts\CancellationRefunds` (implémenté par Cashier) et `Contracts\StayInvoicing` (implémenté par Billing), appelés dans sa transaction après le verrouillage. Aucune dépendance de Reservations vers Cashier ou Billing ; si la caisse ou la facturation échoue, toute l’opération est annulée (tests de panne simulée).

### D-054 — Envoi réel des e-mails, alerte de connexion et invitation du personnel (Validé par l’utilisateur le 20/11/2026)
- **SMTP de l’hébergeur** (choix de l’utilisateur) : réglages dans `backend/.env` uniquement, jamais dans Git ni dans l’interface. L’interface n’affiche que le mode, le serveur, le port, le chiffrement, l’expéditeur et la file d’attente ; jamais l’identifiant ni le mot de passe. L’e-mail de test part immédiatement (hors file) pour un retour instantané ; l’audit ne retient que le domaine du destinataire.
- **Alerte de connexion** : à chaque connexion réussie, un e-mail au membre du personnel (date et heure de Bangui, adresse IP, navigateur et système), en file d’attente. Un échec de connexion n’envoie rien.
- **Création de compte** : le mot de passe devient facultatif. Sans mot de passe, le compte reçoit un mot de passe aléatoire inconnu et un e-mail d’invitation avec un lien à usage unique valable 72 h (`auth.passwords.invitations`, table `password_reset_tokens`), vers l’écran public `/mot-de-passe`. Avec mot de passe, un e-mail de bienvenue sans lien. L’administrateur peut renvoyer un lien (« Inviter »), ce qui sert aussi en cas d’oubli. Le jeton n’est jamais journalisé.
- **Domaines réservés** (`.local`, `.test`, `.example`, `.invalid`, `.localhost`, RFC 2606 et 6761) : aucun e-mail n’y est envoyé, clients compris ; les comptes de démonstration `@jbhotel.local` n’en reçoivent donc pas.
- **PDF à la demande** : le PDF joint à une facture n’est produit qu’au moment d’un envoi réel (il était rendu même sans destinataire, ~4 s par facture).

### D-055 — Nombre de jours calculé depuis les dates (Validé par l’utilisateur le 20/11/2026)
- **Choix confirmé :** du 20 au 23 novembre = **3 jours**, soit la différence entre les dates civiles. Le forfait Journée affiche automatiquement cette quantité en lecture seule ; une modification de l’arrivée ou du départ actualise le devis et le montant. Le minimum existant d’une unité est conservé pour un séjour le même jour (D-017) et annoncé dans le formulaire.
- Dates absentes ou inversées : aucun nombre de jours ni devis ; quantité limitée à 365 pour une nouvelle réservation. Calcul sur les dates civiles, indépendant du fuseau du navigateur, des heures et des changements d’heure. Les heures gardent leur rôle pour la disponibilité (D-009) ; aucune nouvelle heure d’arrivée/départ ni règle d’arrondi horaire n’est imposée.
- **Prolongation Journée :** différence entre l’ancien et le nouveau départ, ajoutée à la quantité déjà enregistrée ; la première proposition est le lendemain du départ actuel. Un simple décalage horaire le même jour ajoute zéro journée. Le prix figé du séjour initial et l’historique ne sont pas recalculés (D-053). Aperçu du supplément et confirmation explicite conservés.
- **Serveur :** le devis et la création refusent une quantité Journée incohérente (422 sur `quantity`) ; aperçu et validation de prolongation contrôlent aussi la quantité ajoutée (422 `day_quantity_mismatch`). Les réservations existantes ne sont pas modifiées rétroactivement.
- **Demi-journée :** quantité manuelle distincte, règle des 12 h et supplément explicite conservés (D-007). Q-01 est partiellement résolue pour le comptage des dates ; les éventuelles règles horaires restent à préciser.

### D-056 — Départs dépassés, disponibilité et menu Alertes (Validé par l’utilisateur le 20/11/2026)
- Un séjour **en cours** dont la fin bloquée est atteinte (`blocked_until <= maintenant`) ne libère plus la chambre : sa présence reste bloquante tant que le départ n’est pas enregistré. Cette règle commune s’applique aux disponibilités, au planning, au devis et à la création/confirmation d’une réservation, ainsi qu’aux conflits de prolongation. Une occupation dépassée bloque aussi une période future, sa nouvelle fin étant inconnue ; la prolongation reporte explicitement cette fin et rétablit le fonctionnement par période.
- Les séjours en attente ou confirmés sans arrivée enregistrée ne deviennent pas des alertes de dépassement. Les séjours terminés ou annulés ne bloquent pas. Les montants, quantités et factures ne changent jamais au simple passage de l’échéance. Sans heure, la fin conservatrice D-009 reste la référence : minuit après la date de départ.
- **Menu Alertes** dans Exploitation et accès par une cloche dans la barre du haut, avec un compteur réel. Écran avec vue d’ensemble globale, recherche client/chambre automatique, filtre par forfait, pagination serveur et accès au séjour par UUID. Le dépassement est présenté en jours, heures et minutes. Les filtres ne modifient pas les totaux globaux, dont le périmètre est annoncé. L’aside conserve son style et sa structure ; seule l’entrée demandée est ajoutée.
- Alertes calculées à la lecture, sans table ni acquittement artificiel. Un départ enregistré ou une prolongation qui repousse l’échéance résout l’alerte ; le cache du compteur et des listes est invalidé immédiatement après ces opérations. Les écrans visibles d’alertes, de planning, d’occupation, de chambres disponibles et de séjour en cours s’actualisent toutes les 30 secondes et au retour sur la fenêtre.
- **API et droits :** `GET /api/v1/alerts` et `/api/v1/alerts/summary`, réservés à `reservations.view`. Les actions restent soumises à leurs propres permissions. Aucun nouvel e-mail ni frais automatique. Le départ verrouille la chambre avant le séjour, comme les réservations et prolongations, pour garder un ordre cohérent entre opérations concurrentes.

### D-057 — Réduction du menu latéral sur PC (Validé par l’utilisateur le 20/11/2026)
- Demande explicite de l’utilisateur : ajouter un bouton pour réduire l’aside sur PC et adapter le contenu central. Cette évolution ciblée complète la consigne antérieure de préserver son design : l’état déployé conserve sa présentation, les droits et la navigation restent identiques.
- Bouton « Réduire le menu latéral » / « Déployer le menu latéral » dans la barre du haut, disponible au-dessus du point de bascule mobile existant (680 px). En mode compact, rail de **80 px** avec logo, icônes, état actif et déconnexion. La grille réattribue l’espace libéré au contenu (`minmax(0, 1fr)`) ; le contenu compact utilise aussi toute la largeur disponible sur les grands moniteurs, sans le plafond de 1 600 px de l’état déployé.
- Libellés visuellement masqués en mode compact mais conservés pour les lecteurs d’écran ; infobulles natives sur les liens. Bouton accessible au clavier, `aria-expanded` et `aria-controls`. Le fil d’Ariane s’adapte aux largeurs intermédiaires.
- Préférence locale au navigateur, clé `jb-hotel.sidebar-collapsed`, conservée lors de la navigation et du rechargement. Si le stockage local est refusé, le bouton continue de fonctionner pour la session affichée.
- Sur mobile, le tiroir existant reste complet, même si le choix PC est « réduit » ; le bouton PC est masqué. Styles de repli limités à l’écran : l’impression n’est pas affectée. Aucun changement serveur ni de base de données.

### D-058 — Corrections de la caissière et suppression définitive par l’administrateur (Validé par l’utilisateur le 20/11/2026)
- **Ce qui ne se supprime jamais :** encaissements, remboursements, factures et avoirs (obligation comptable). Ils se corrigent par une annulation tracée, un remboursement ou un avoir.
- **Caissière, ses saisies du jour :** elle annule, avec un motif, un encaissement qu’elle a saisi aujourd’hui (heure de Bangui) et qui n’a pas été remboursé, puis le ressaisit. Les encaissements d’une collègue ou des jours précédents, et tout remboursement, restent à l’administrateur (Q-08).
- **Modifier une réservation** (chambre, dates, heures, forfait, quantité) tant qu’elle est en attente ou confirmée, non prolongée et non commencée. Ce sont les mêmes contrôles qu’à la création : disponibilité sous verrou, maintenance, capacité, durée et journées calendaires. Le prix est recalculé au tarif en vigueur, avec la même remise. Le motif est obligatoire, l’audit `reservation.modified` conserve l’avant et l’après, et le client reçoit un e-mail. Le nouveau montant ne descend jamais sous l’encaissé (D-014). Une réservation facturée n’est modifiable que par l’administrateur : la facture est alors remplacée (avoir et nouvelle facture, comme D-053).
- **Suppression définitive :** réservée au droit `records.delete`, toujours attribué au rôle administrateur et jamais attribuable à un autre rôle (refus 409 `permission_admin_only`). Elle passe par une fenêtre d’avertissement, avec motif obligatoire et confirmation explicite. Le journal d’audit garde une copie complète (`*.deleted`, avant, motif, auteur). Elle est permise seulement pour :
  - un client sans aucune réservation ;
  - une réservation sans aucun encaissement, même annulé, ni aucune facture ou avoir (ses occupants et prolongations partent avec elle) ;
  - une chambre jamais réservée ;
  - une catégorie sans chambre ni tarif publié ;
  - un compte jamais utilisé : aucune connexion, aucune opération, ni le sien propre, ni le dernier administrateur actif.
- **Filet de sécurité :** les clés étrangères en RESTRICT refusent toute suppression d’une saisie encore référencée ; la réponse est alors un 409 `record_in_use` en français, et rien n’est supprimé (copie au journal comprise).

### D-059 — Pages d’accès, mot de passe oublié et vérification de facture (Validé par l’utilisateur le 20/11/2026)
- **Pages d’accès harmonisées** (connexion, mot de passe oublié, choix du mot de passe) autour d’une mise en page commune (`features/auth/AuthLayout`). Elles respectent la demande précédente : carte centrée, sans image, fond uni.
  - *Habillage :* bandeau vert et or, monogramme JB, note de sécurité en pied de carte.
  - *Règles du mot de passe :* vérifiées en direct, avec un texte pour les lecteurs d’écran en plus de la couleur.
- **Mot de passe oublié :** lien sur la connexion, puis page de demande. Le compte est **vérifié avant l’envoi**, à la demande de l’utilisateur ; la réponse distingue « Compte introuvable » (404), « Compte désactivé » (403) et une adresse qui ne peut rien recevoir (422).
  - *Le lien :* à usage unique, valable 60 minutes, il mène au même écran que l’invitation (`motif=oubli`).
  - *Limite :* 5 demandes par minute, pour freiner les essais d’adresses.
  - *Audit :* `user.password_reset_requested`, `user.password_reset_sent` et `user.password_reset`, sans le jeton.
- **Jetons séparés :** les invitations ont leur propre table (`invitation_tokens`, 72 h). Un lien « mot de passe oublié » ne peut donc jamais servir d’invitation, ni l’inverse (défaut trouvé par les tests).
- **Vérification de facture** (page publique du QR code) :
  - *Présentation :* en-tête de l’hôtel, verdict clair (authentique en vert, annulée en ambre, introuvable en rouge) et montant mis en avant.
  - *Contenu :* seulement les données nécessaires (initiales du client), avec l’heure de la vérification.
  - *Aide :* si le document est introuvable, une aide pas à pas et le contact de l’hôtel (configuration).
  - *Format :* adaptée au mobile et à l’impression, sans ressource externe.

### D-060 — Pages d’erreur et page Paramètres (Validé par l’utilisateur le 20/11/2026)
- **Pages d’erreur de l’application** (React) sur un composant commun `shared/ui/ErrorState` : code en grand, pastille « Erreur … », titre, message, aide et actions. Ton ambre pour 404, rouge pour 403 et 500, bleu pour « Accès à configurer ».
  - *404 :* « Page introuvable », boutons « Retour à l’accueil » et « Page précédente ».
  - *403 :* « Accès refusé » quand le rôle n’a pas le droit de la page (`RequirePermission`) ; le serveur reste l’autorité.
  - *500 :* page de secours du routeur (« Erreur inattendue »), avec « Recharger la page » ; aucun détail technique affiché.
- **Pages d’erreur du serveur** (liens ouverts hors de l’application, par exemple le QR code d’une facture) : vues Blade autonomes dans `resources/views/errors` (403, 404, 419, 429, 500, 503, puis 4xx et 5xx génériques qui affichent le code reçu, par exemple 505). Elles sont en français, sans ressource externe, avec le contact de l’hôtel.
  - *Pas de lien vers l’application :* ces pages peuvent être vues par un client, qui ne doit pas être envoyé vers l’écran de connexion du personnel. Seuls « Revenir en arrière » et, pour les erreurs passagères (419, 429, 5xx), « Réessayer » sont proposés.
  - *API :* les routes `/api/*` gardent le contrat d’erreur JSON (`ApiExceptionRenderer`) ; aucune trace, même avec `APP_DEBUG=true` côté API. Les pages web ne montrent jamais le message de l’exception quand `APP_DEBUG=false` (production).
- **Page Paramètres** :
  - *Regroupement :* règles rangées par domaine d’après le préfixe de leur clé (Remises, Encaissements, Réservations, Facturation et caisse, puis « Autres règles » pour une clé nouvelle).
  - *Lecture :* chaque règle montre sa valeur en grand (pastilles pour une liste, Oui/Non, unité), son statut Validé ou Provisoire, sa référence (D-xx, Q-xx) et la date de dernière modification.
  - *Actions :* « Modifier » seulement pour les règles modifiables ; les autres affichent « Fixé par décision ». Une légende explique les trois états. Le panneau « Envoi des e-mails » reste en bas de page.
  - Aucune règle, valeur ou droit n’a changé : présentation uniquement.

### D-061 — Ticket thermique 80 mm en complément de l’A4 (Validé par l’utilisateur le 21/11/2026, N-01)
- Le ticket 80 mm **s’ajoute** aux impressions existantes : il ne les remplace pas. La facture PDF A4, générée par le serveur depuis l’instantané figé et munie du QR de vérification, reste le document de référence.
- Deux tickets : le **reçu d’un versement** (données de `GET /payments/{id}`) et la **copie d’une facture ou d’un avoir**, construite uniquement depuis `snapshot_json` (`GET /invoices/{id}`), jamais depuis les tarifs actuels.
- Jamais « PAYÉ » tant que le reste dû n’est pas nul ; un encaissement annulé porte la mention « ANNULÉ ». Aucune taxe n’est inventée : la ligne n’apparaît que si l’instantané en contient (règles fiscales en Centrafrique non validées).
- Impression par le navigateur (`window.print()`) sur une page nommée 80 mm, sans effet sur les impressions A4. Réimprimer ne crée aucune opération. Impression silencieuse, découpe et tiroir-caisse : hors du navigateur, non traités.
- Source : `new/JB_Hotel_Facture_Thermique_80mm.md`. Suivi : `SUIVI_NEW.md`, lot 1.

### D-062 — Poste principal unique pour les écritures (Validé par l’utilisateur le 21/11/2026, N-04, option A)
- Pour le futur mode hors ligne, l’administrateur désigne depuis l’application **un seul poste principal** (par exemple `CAISSE-01`). Lui seul enregistre les **réservations et encaissements**, en ligne comme hors ligne. Les autres appareils servent à la consultation et aux réglages (tarifs, chambres, utilisateurs) ; sans réseau, ils passent en consultation seule.
- But : aucun conflit possible sur les chambres et l’argent, puisqu’il n’y a qu’un seul écrivain. Les conflits résiduels (chambre mise en maintenance pendant une coupure, fiche client modifiée des deux côtés) sont signalés au centre de synchronisation, jamais résolus en silence.
- Transfert du rôle : autorisé seulement quand le poste actuel n’a plus d’opération en attente, sinon transfert forcé avec avertissement et journal d’audit. Chaque attribution porte un numéro : le serveur refuse les envois d’un ancien poste mais les conserve pour examen, sans les effacer.
- Rejeté pour la V1 : le verrou automatique (option B), où les autres appareils écrivent tant que le poste principal répond. Il pourra être réétudié si l’hôtel ouvre un deuxième point d’encaissement.
- Mise en œuvre au lot 4 de `SUIVI_NEW.md`.
- **Mise en œuvre de l’écran « Postes de caisse » (21/11/2026, lot 4A.3)** :
  - *Identification :* chaque navigateur connecté s’enregistre et reçoit un jeton secret aléatoire (48 caractères), envoyé dans l’en-tête `X-Workstation-Token` ; seule son empreinte SHA-256 est stockée. Le poste désigne l’appareil, pas la personne : toute caissière autorisée travaille sur le poste principal.
  - *Désignation :* première, planifiée (l’ancien poste a donné signe de vie dans le délai) ou forcée (motif d’au moins 5 caractères et confirmation explicite). Numéro unique et croissant ; une désignation simultanée est refusée (409).
  - *Règle :* paramètre provisoire `workstations.enforce_main_post`, **désactivé par défaut**, activable seulement après désignation ; quand il est actif, création, confirmation, modification, prolongation, occupants, annulation, arrivée et départ d’une réservation, ainsi qu’encaissement, annulation d’encaissement et remboursement, sont refusés hors du poste principal (403 `workstation_not_main`). Consultation, devis, fiches clients, factures et suppressions par l’administrateur restent permis.
  - *Délai :* poste principal « silencieux » après `workstations.silent_after_minutes` (provisoire, 5 min) sans signal ; signal toutes les 30 s, onglet visible.
  - *Droit :* `workstations.manage`, réservé à l’administrateur (jamais attribuable à un autre rôle).

### D-063 — Écritures idempotentes (21/11/2026, lot 3 de SUIVI_NEW.md, sans décision métier)
- **Principe :** une écriture envoyée avec l’en-tête `Idempotency-Key` (UUID) et rejouée avec la même clé renvoie la réponse déjà enregistrée (en-tête `Idempotent-Replayed: true`) au lieu de recommencer. But : aucun double encaissement, double séjour ou double fiche client après un double clic, une réponse perdue ou, plus tard, une synchronisation répétée.
- **Atomicité :** la clé est écrite dans la même transaction que l’opération (les transactions des services deviennent des points de sauvegarde). Deux envois simultanés : le second attend le premier sur l’index unique, puis rejoue sa réponse (testé avec de vrais processus).
- **Erreurs :** jamais mémorisées ; la même clé sert au nouvel essai corrigé. Même clé avec d’autres valeurs : refus 422 `idempotency_key_reused`, en français.
- **Portée :** clé propre à chaque utilisateur ; middleware `idempotent` sur 14 routes d’écriture (réservations, caisse, factures et avoirs, création de client). Sans en-tête, fonctionnement inchangé.
- **Frontend :** une clé par dialogue ouvert (encaissement, remboursement, annulation, nouvelle réservation avec ses trois écritures, fiche client), gardée pour les nouveaux essais ; repli sans HTTPS.
- **Conservation :** 30 jours, purge quotidienne `model:prune` (nécessite le cron `php artisan schedule:run`).

### D-064 — Règles du mode hors ligne (validé par l’utilisateur le 21/11/2026 : N-02, N-03, N-05, N-06)
- **N-05, accès hors ligne (révisée le 22/11/2026, voir plus bas : sans limite de durée) :** la dernière session connectée reste utilisable **12 h au plus** sans réseau ; après **15 min d’inactivité**, l’écran se verrouille et le mot de passe est redemandé, vérifié localement (empreinte dérivée, jamais le mot de passe en clair). Au-delà de 12 h, une reconnexion en ligne est obligatoire. Les droits utilisés hors ligne sont ceux du dernier `/auth/me`.
- **N-02, opérations hors ligne : toutes, comme en ligne**, sur le poste principal (D-062). Chaque opération est enregistrée localement avec sa clé d’idempotence (D-063) et **revalidée par le serveur** au retour du réseau : elle peut être acceptée, rejouée sans doublon, ou **refusée après coup** (remise hors plafond, chambre en maintenance ou prise, droit retiré…). Un refus n’efface jamais l’opération : elle passe au centre de synchronisation, avec le motif en français, pour correction ou ressaisie. Une réservation faite hors ligne reste marquée « en attente de synchronisation » jusqu’à l’accusé du serveur.
- **N-03, numérotation :** un ticket émis hors ligne porte un **numéro provisoire** `LOC-<poste>-<séquence>` ; le serveur attribue le numéro définitif (REC, FAC) à la synchronisation, visible à la réimpression, le provisoire restant rattaché. **À faire valider par l’hôtel sur le plan fiscal** (Q-09).
- **N-06, sauvegarde :** bouton « Exporter les opérations en attente » (fichier chiffré à garder sur une clé USB) et rappel quand des opérations attendent depuis plus d’une heure.
- Encore ouvert : N-07 (modèle et largeur de l’imprimante, essais réels).
- **Mise en œuvre du lot 2 (21/11/2026)** :
  - *Application :* service worker écrit à la main (`public/sw.js`, actif en production seulement) : page en réseau d’abord, fichiers `/assets/` en cache, API jamais interceptée. Manifeste et icônes : l’application est **installable** (bouton « Installer l’application » dans « Synchronisation »).
  - *Réseau :* l’accès est vérifié (`GET /health`), pas seulement le signal du navigateur ; hors ligne, une seule fenêtre « Connexion impossible » par coupure, puis une pastille « Hors ligne » et un bandeau. Les écritures ne sont **jamais** mises en attente en silence : elles échouent avec le message réseau jusqu’au lot 4.
  - *Copie locale :* lectures réussies gardées dans IndexedDB (hors écrans d’administration), enregistrées 0,5 s après chaque lecture et à la sortie de page ; restaurées au démarrage ; ignorées après 12 h ; effacées à la déconnexion, au changement d’utilisateur et quand le serveur répond 401. **Limite :** la copie n’est pas chiffrée sur le disque ; la protection repose sur le verrou, la durée de 12 h et la session Windows du poste.
  - *Verrou :* empreinte PBKDF2-SHA-256 (150 000 itérations, sel aléatoire) calculée à la connexion. Sans HTTPS (WebCrypto absent), le déverrouillage hors ligne est impossible : reconnexion au retour du réseau.
  - *Menu « Synchronisation et sauvegardes »* (demandes de l’utilisateur) : « Mettre à jour en local » (données déjà consultées + écrans essentiels déclarés par chaque feature : chambres, catégories, tableau de bord, occupation, planning), historique des 50 dernières synchronisations sur le poste (sens, origine, résultat, éléments, durée, auteur, cause de chaque échec), dernière copie automatique, contenu détaillé, effacement de la copie. Le sens « en ligne » et l’export arrivent au lot 4.
- **Mise en œuvre du lot 4, première étape (22/11/2026)** :
  - *File d’attente :* une écriture faite sans serveur (ou coupée pendant l’envoi) est gardée sur le poste avec sa clé d’idempotence (D-063) et rejouée telle quelle vers la route habituelle ; le serveur revalide tout (droits, poste principal D-062, règles de caisse).
  - *Auteur :* une opération n’est envoyée qu’avec la session de son auteur ; celles d’un autre utilisateur attendent sa prochaine connexion sur le poste.
  - *Refus :* gardé avec sa cause, « Réessayer » ou « Abandonner » avec motif ; rien n’est effacé. Coupure, 401, 429 et 5xx : l’envoi s’arrête et l’opération reste en attente.
  - *Copie :* en ligne, toute donnée restaurée de la copie est rechargée à l’affichage ; une opération hors ligne enregistre la copie aussitôt.
  - *Opérations couvertes :* encaissement, arrivée, départ. Suivent : création de réservation (prix et disponibilité calculés sur le poste), export chiffré et rappel (N-06), signalement au tableau de bord.
- **N-05 révisée par l’utilisateur (22/11/2026) : aucune durée maximale hors ligne.** L’hôtel peut rester un mois sans Internet : la session gardée sur le poste et la copie locale restent valables sans limite de durée ; le verrou après 15 min d’inactivité, déverrouillé par le mot de passe vérifié localement, est conservé. Seule une session absente du poste bloque l’accès hors ligne. **Conséquences acceptées :** un compte désactivé ou un droit retiré pendant la coupure n’est connu qu’au retour du réseau, où le serveur refuse ses opérations (cause gardée) ; au retour, la session serveur peut avoir expiré : les opérations attendent la reconnexion de leur auteur, sans perte.
- **Mise en œuvre du lot 4, suite (22/11/2026)** :
  - *Sauvegarde (N-06) :* export manuel chiffré (AES-GCM 256, clé PBKDF2-SHA256 à 600 000 itérations, sel et vecteur aléatoires) des opérations en attente ou refusées ; restauration qui n’ajoute que les opérations absentes ; rappel quand une opération attend depuis plus d’une heure sans figurer dans la dernière sauvegarde.
  - *Téléchargement complet :* chaque feature déclare ses étapes (`registerOfflinePreparation`) ; les fiches sont prises dans les listes quand le serveur les présente de la même façon (réservations, clients), sinon une requête par fiche ; 90 requêtes par minute au plus, reprise après un 429. Les séjours couverts sont en cours, à venir et terminés depuis 30 jours.
  - *Envoi après une longue coupure :* opérations envoyées une par une dans l’ordre, au même rythme, avec reprise après un 429.
  - *Stockage :* demande de stockage persistant au navigateur ; écritures IndexedDB en durabilité stricte ; cache de requêtes sans expiration (`gcTime` infini), car la copie du poste en est tirée.
  - *Comparaison poste / serveur :* éléments distincts gardés (par identifiant) face au total de chaque liste du serveur ; hors ligne, dernier relevé daté.
- **Mise en œuvre du lot 4, point 4.5 (22/11/2026)** :
  - *Calcul sur le poste :* chambres libres, devis et aperçu de prolongation reprennent les règles du serveur (intervalle bloqué D-009, départ dépassé D-056, demi-journée de 12 h D-007, arrondi des remises D-008, jours entre dates D-055), à partir des chambres, de la grille des tarifs (version en vigueur, puis la suivante à sa date) et des réservations gardées, y compris celles créées hors ligne. Une chambre déjà prise d’après le poste est refusée tout de suite.
  - *Limite assumée :* le plafond de remise de la caissière (paramètre, non gardé hors ligne) n’est vérifié qu’à l’envoi ; une réservation d’un autre poste pendant la coupure n’est connue qu’au retour du réseau. Dans les deux cas le serveur refuse, la cause est gardée et les opérations qui en dépendent sont refusées en chaîne (D-064).
  - *Éléments créés hors ligne :* identifiant `local-<clé de l’opération>` ; à l’envoi, l’identifiant donné par le serveur remplace la référence dans les opérations suivantes ; une opération sur un élément encore local attend son tour, même en ligne. Les éléments provisoires envoyés sont retirés du poste au passage suivant.
- **N-08, décidé par l’utilisateur (22/11/2026) : facture provisoire puis définitive.** Hors ligne, une facture s’émet comme les reçus (N-03) : « FACTURE PROVISOIRE » numérotée `FAC-LOC-<poste>-<séquence>`, construite comme l’instantané du serveur (en-tête de l’hôtel, ligne d’hébergement, remise, versements à la date d’émission), imprimable en ticket 80 mm. Au retour du réseau, le serveur émet la facture avec son numéro FAC et son instantané figé ; seule la facture définitive fait foi et doit être réimprimée. Pas de PDF A4, de QR de vérification ni d’avoir sur une facture provisoire. **À faire valider par l’hôtel sur le plan fiscal** (Q-09, Q-16).
- **Mise en œuvre du lot 4, point 4.13 (22/11/2026)** : confirmation (chambre revérifiée sur le poste), occupants (capacité ; écriture PUT dans la file), modification (mêmes règles que `ReservationModificationService` : statut, prolongation déjà faite, facture active réservée à l’administrateur, tarif en vigueur et même remise, jamais sous l’encaissé) et facture provisoire. Le serveur revérifie tout à l’envoi.
- **Mise en œuvre du lot 4A (22/11/2026)** :
  - *État des postes :* le signal de présence (30 s) porte l’état hors ligne du poste (compteurs et dates, jamais le contenu des opérations) ; l’administrateur suit le poste principal depuis n’importe quel appareil.
  - *Journal du serveur :* une opération rejouée porte l’en-tête `X-Offline-Replay` (base64 de l’opération, de son libellé et de sa date sur le poste) ; le serveur note acceptée, doublon évité ou refusée, avec la cause. Les refus s’examinent dans « Mode hors ligne » (ressaisie ou rejet confirmé, motif, audit). Droit `offline.manage`, réservé à l’administrateur.
  - *Règles :* opérations permises, verrouillage, rappel de sauvegarde et préfixe des numéros provisoires sont des paramètres provisoires ; le poste les reçoit avec son signal et les applique aussi sans réseau.
  - *Hors ligne, écran par écran :* tous les écrans métier s’ouvrent sans réseau après « Tout télécharger » ; planning et occupation sont calculés sur le poste pour toute période (réservations faites hors ligne comprises). Les écrans de gestion (utilisateurs, postes, mode hors ligne, paramètres, audit) restent réservés au serveur et le disent ; leurs données ne sont jamais copiées sur le poste. **Limite :** le journal de caisse et les rapports d’une période jamais ouverte en ligne ne sont pas recalculés hors ligne (chiffres incomplets plutôt que faux).
