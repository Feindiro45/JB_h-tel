# Schéma de base de données — JB Hôtel

Ce document décrit le schéma réellement implémenté par les migrations (`backend/database/migrations/`). Il recense aussi les écarts avec la référence `09_schema_reference.sql` et le MCD `04_MCD_JB_Hotel.drawio`.

- **Moteur :** MySQL 8+ InnoDB, en `utf8mb4_unicode_ci` (D-002). Le développement local se fait sur MariaDB 10.4 ; le code est compatible avec les deux moteurs.
- **Montants :** entiers FCFA en `BIGINT UNSIGNED`, colonnes suffixées `_fcfa`.
- **Identifiants publics :** chaque table d’entité possède une colonne `uuid` (UUID v7, unique, obligatoire). C’est le seul identifiant exposé par l’API et dans les URL ; la clé `id` entière reste interne (D-026).
- **Dates et heures :** `DATETIME`, pas `TIMESTAMP`, pour éviter la limite de 2038 et les conversions de fuseau. Elles sont en heure locale de l'hôtel, `Africa/Bangui`.

## Principes d'intégrité

| Principe | Mise en œuvre |
|---|---|
| Aucune suppression silencieuse | Toutes les clés étrangères sont en `ON DELETE RESTRICT`. Un utilisateur se **désactive**, une réservation s'**annule**, un paiement s'**annule** et un remboursement est une ligne distincte. Le journal d'audit refuse toute modification ou suppression. |
| Prix figés | La réservation stocke `rate_id`, `billing_unit`, `quantity`, `applied_unit_price_fcfa`, `gross_fcfa`, la remise et `net_fcfa`. Les tarifs sont versionnés (`effective_from` / `effective_to`). La facture est figée dans `snapshot_json`. |
| Calculs vérifiés par la base | Des contraintes `CHECK` imposent `net + remise = brut`, une remise ≤ brut, un pourcentage ≤ 100, une quantité > 0 et une capacité > 0. Elles valident aussi les dates de fin, les statuts et les unités. |
| Occupation calculée | Aucun booléen `is_occupied`. L'état d'une chambre se déduit des réservations actives sur l'intervalle `blocked_from` / `blocked_until`. |

## Tables

### Identity
| Table | Rôle | Points notables |
|---|---|---|
| `users` | Administrateurs et caissières | `active`, `last_login_at`. **Pas de colonne `role`** (D-006). |
| `roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions` | Tables Spatie | Garde `web` ; 27 permissions et 2 rôles (`admin`, `caissiere`). |
| `sessions` | Sessions Sanctum (SPA) | Pilote `database`. |
| `personal_access_tokens` | Installée par Sanctum | Non utilisée : authentification par session (D-005). |

### Customers
| Table | Colonnes notables |
|---|---|
| `customers` | `name` (nom), `first_name` (prénoms), `phone`, `email`, `origin_city`, `origin_country`, `address`, `identification_type`, `identification_number`, `notes`, `created_by`. Index sur le nom, le téléphone et la pièce d'identité. |

### RoomCatalog
| Table | Colonnes notables |
|---|---|
| `room_types` | `code` unique (`VIP`, `STANDARD`), `label`, `description` |
| `rooms` | `number` unique, `room_type_id`, `capacity` (> 0), `maintenance_status` ∈ {`AVAILABLE`, `MAINTENANCE`}, `maintenance_note` |
| `room_rates` | `room_type_id`, `billing_unit` ∈ {`HALF_DAY`, `DAY`}, `amount_fcfa`, `effective_from`, `effective_to` (> début ou nul), `reason`, `created_by`. Index **unique** (`room_type_id`, `billing_unit`, `effective_from`) : deux versions ne démarrent pas au même instant (D-027). |

### Reservations
| Table | Colonnes notables |
|---|---|
| `reservations` | **Période :** `start_date`, `end_date`, `start_time?`, `end_time?`, ainsi que `blocked_from`, `blocked_until` et `period_is_estimated`.<br>**Prix figé :** `rate_id`, `billing_unit`, `quantity`, `applied_unit_price_fcfa`, `gross_fcfa`, `discount_type` (`PERCENT` ou `FIXED`), `discount_value`, `discount_fcfa`, `discount_reason`, `discount_by`, `net_fcfa`.<br>**Statut :** `status` ∈ {`PENDING`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`}.<br>**Arrivée et départ effectifs :** `checked_in_at/by`, `checked_out_at/by`.<br>**Annulation :** `cancelled_at/by`, `cancellation_reason`.<br>**Auteur :** `created_by`. |
| `reservation_occupants` | `reservation_id`, `name`, `is_primary` |
| `reservation_extensions` | Une ligne par prolongation (D-053), jamais modifiée ni supprimée : `previous_end_date`, `previous_end_time?`, `previous_blocked_until`, `end_date`, `end_time?`, `blocked_until`, `added_quantity` (≥ 0), `unit_price_fcfa`, `amount_fcfa` (= quantité × prix, contrainte `CHECK`), `previous_net_fcfa`, `net_fcfa`, `extended_by`, `extended_at`. Sert à détailler la facture (séjour initial puis chaque prolongation). Ligne interne sans UUID : elle n’est jamais adressée par une route. |

Index : `(room_id, blocked_from, blocked_until)` pour la détection des conflits et `(room_id, start_date, end_date)`, repris de 09.

### Cashier et Billing
| Table | Colonnes notables |
|---|---|
| `payments` | `receipt_number` unique, `amount_fcfa` (> 0), `method`, `received_at`, `cashier_id`, `status` ∈ {`VALID`, `CANCELLED`}, `reference`, `cancelled_at/by`, `cancellation_reason` |
| `refunds` | `payment_id`, `amount_fcfa` (> 0), `method`, `reason`, `processed_by`, `processed_at` |
| `invoices` | `invoice_number` unique, `type` ∈ {`INVOICE`, `CREDIT_NOTE`}, `credited_invoice_id` (avoir), `issued_at`, `issued_by`, montants (net + remise = brut), `snapshot_json`, `status` ∈ {`ISSUED`, `CREDITED`} |
| `document_sequences` | `name` (par exemple `invoice:2026`), `last_number` : numérotation continue attribuée sous verrou |

### Workstations (postes de caisse, D-062)
| Table | Colonnes notables |
|---|---|
| `workstations` | `uuid`, `name` unique (≤ 40), `token_hash` unique (SHA-256 du jeton du navigateur, jamais le jeton), `user_agent`, `registered_by`, `last_seen_at/by` (signal de présence), `revoked_at/by`, `revocation_reason`. Jamais supprimé : révoqué. |
| `workstation_assignments` | `uuid`, `number` unique (≥ 1, croissant), `workstation_id`, `previous_workstation_id`, `mode` ∈ {`FIRST`, `PLANNED`, `FORCED`}, `reason`, `previous_last_seen_at`, `assigned_by`, `assigned_at`. Le poste principal courant est la dernière attribution ; lignes figées (ni modifiées ni supprimées). Migration `2026_11_21_100000`. |

### Transverse
| Table | Rôle |
|---|---|
| `audit_logs` | `actor_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `ip_address`, `occurred_at`. Append-only. **Sert aussi de journal des modifications des réservations** (D-022). |
| `settings` | `key`, `value` (JSON), `description`, `updated_by` : paramètres modifiables par l'administrateur (11 valeurs par défaut, dont plusieurs provisoires ; `workstations.*` ajoutés par la migration `2026_11_21_100100`, D-062). |
| `cache`, `jobs`, `password_reset_tokens` | Tables techniques de Laravel (`password_reset_tokens` : liens « mot de passe oublié », 60 min) |
| `invitation_tokens` | Liens d’invitation d’un nouveau compte (72 h), séparés des liens « mot de passe oublié » pour qu’aucun ne puisse servir à la place de l’autre (D-059, migration `2026_11_20_110000`) |

## Écarts avec `09_schema_reference.sql` et le MCD

| Élément | Référence 09 | Implémentation | Raison |
|---|---|---|---|
| `users.role` | Colonne `VARCHAR(30)` | Supprimée | Spatie est la seule source des rôles (C-03, D-006) |
| `reservations.quantity` | `NUMERIC(10,2)` | `INT UNSIGNED` > 0 | Pas de quantité fractionnaire tant que Q-04 n'est pas tranchée (D-017) |
| Intervalle bloqué | — | `blocked_from`, `blocked_until`, `period_is_estimated` | Détection des conflits indexée, politique sans heure (D-009, D-018) |
| Arrivée, départ, annulation | — | Colonnes `*_at` et `*_by`, motif | Traçabilité (cahier des charges) |
| Remise | `discount_type`, `discount_value`, `discount_fcfa` | Ajout de `discount_reason` et `discount_by` | Motif et auteur obligatoires (cahier des charges) |
| Paiements | — | `receipt_number`, annulation tracée | Un reçu par paiement, aucune suppression |
| Factures | — | `type`, `credited_invoice_id`, `issued_by` | Avoirs, sous réserve de Q-09 |
| Auteurs | Clés étrangères nullables | `NOT NULL` pour `reservations.created_by`, `payments.cashier_id`, `refunds.processed_by` et `invoices.issued_by` | Chaque opération financière a un auteur |
| Horodatages | Absents | `created_at`, `updated_at` (`DATETIME`) | Traçabilité |
| Nouvelles tables | — | `settings`, `document_sequences`, tables Spatie, `sessions`, `workstations`, `workstation_assignments` | Paramètres, numérotation, droits, sessions, poste principal unique (D-062) |
| Maintenance | `maintenance_status` | Statut courant seulement | Périodes planifiées en attente de Q-12 (D-019) |
| Identifiants publics | Absents | Colonne `uuid` sur 11 tables | Les routes et les liens n’exposent jamais la clé entière (D-026) |
| Prolongations | Absentes (historique dans l’audit seulement) | Table `reservation_extensions` (migration `190000`) | Facture détaillée séjour initial + prolongation (D-053, demande du 19/11/2026) |

> Le fichier `04_MCD_JB_Hotel.drawio` a été régénéré le 19/11/2026 depuis le schéma réel : 27 tables et 27 relations de clés étrangères ; complété le 20/11/2026 avec `reservation_extensions` (28 tables, 29 relations), puis `invitation_tokens` (29 tables), y compris UUID, Spatie, paramètres, audits et tables techniques. Les associations polymorphes de Spatie restent documentées par leurs colonnes, sans fausse clé étrangère.
