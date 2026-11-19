# JB Hôtel — Architecture backend Laravel V3
## Décision d'architecture
**Monolithe modulaire Laravel, API REST, DTO, services applicatifs, SOLID.** Déploiement unique, modules découplés. MySQL ou PostgreSQL à choisir. Pas de microservices dans la V1.

## Arborescence cible
```text
app/
  Modules/
    Identity/
    Customers/
    RoomCatalog/
    Reservations/
    Cashier/
    Billing/
    Reporting/
  Shared/
    Contracts/
    Exceptions/
    ValueObjects/
```
Chaque module contient selon ses besoins :
```text
Http/Controllers/
Http/Requests/
DTO/
Application/Services/
Domain/Contracts/
Domain/Entities/ (si utile)
Infrastructure/Repositories/
Models/
Policies/
Events/
Listeners/
```
Ne pas créer artificiellement toutes les couches si elles n'apportent rien. Les contrôleurs valident et délèguent ; les DTO transportent des données typées ; les services orchestrent les cas d'usage ; les repositories abstraient les requêtes complexes. Les modèles Eloquent restent dans la couche de persistance.

## Principes SOLID
- SRP : un service par cas d'usage, sans mélanger facturation et réservation.
- OCP : stratégies de calcul pour demi-journée et journée, extensibles.
- LSP : implémentations interchangeables des contrats.
- ISP : interfaces réduites (AvailabilityChecker, PaymentRecorder, PriceProvider).
- DIP : dépendances sur interfaces, résolues par service providers Laravel.

## Contrats entre modules
- Reservations dépend de `RoomAvailability` et `CurrentPriceProvider` (contrats), pas des tables internes de Cashier.
- Cashier reçoit un identifiant de réservation et un montant dû via un contrat de lecture ; enregistre ses propres paiements.
- Billing fige des lignes et montants issus des réservations et paiements.
- Reporting lit des projections ou requêtes dédiées, sans modifier les transactions.
- Événements métier après commit : `ReservationConfirmed`, `PaymentRecorded`, `InvoiceIssued`. Éviter les dépendances circulaires.

## Entités / tables principales
- users (id, name, email, password_hash, role, active)
- customers (id, name, phone, identification_type?, identification_number?)
- room_types (id, code VIP|STANDARD, label)
- room_rates (id, room_type_id, billing_unit HALF_DAY|DAY, amount_fcfa, effective_from, effective_to?, created_by)
- rooms (id, number UNIQUE, room_type_id, capacity, maintenance_status)
- reservations (id, customer_id, room_id, start_date, end_date, start_time?, end_time?, billing_unit, quantity, applied_unit_price_fcfa, rate_id, gross_fcfa, discount_type?, discount_value, discount_fcfa, net_fcfa, status, created_by)
- reservation_occupants (id, reservation_id, name, is_primary)
- payments (id, reservation_id, amount_fcfa, method, received_at, cashier_id, status, reference?)
- refunds (id, payment_id, amount_fcfa, reason, processed_by, processed_at)
- invoices (id, reservation_id, invoice_number UNIQUE, issued_at, gross_fcfa, discount_fcfa, net_fcfa, snapshot_json, status)
- audit_logs (id, actor_id, action, entity_type, entity_id, before_json?, after_json?, occurred_at)

Les montants sont des entiers FCFA. Les factures et réservations conservent des snapshots tarifaires. Les taux et montants de remise doivent être validés côté serveur.

## API REST indicative
- `POST /api/v1/auth/login`
- `GET|POST /api/v1/customers`
- `GET|POST|PATCH /api/v1/room-types`
- `GET|POST /api/v1/room-rates` (ajout de version, jamais modification destructive)
- `GET|POST|PATCH /api/v1/rooms`
- `GET /api/v1/availability?from=&to=`
- `GET|POST /api/v1/reservations`
- `POST /api/v1/reservations/{id}/extend`
- `POST /api/v1/reservations/{id}/cancel`
- `POST /api/v1/reservations/{id}/payments`
- `POST /api/v1/payments/{id}/refunds`
- `POST /api/v1/reservations/{id}/invoices`
- `GET /api/v1/invoices/{id}/print`
- `GET /api/v1/reports/cashier`

## Invariants transactionnels
1. Bloquer la double réservation via transaction + verrouillage/concurrence et revalidation de disponibilité avant commit.
2. Définir précisément l'intervalle occupé avant d'accepter deux réservations dans une journée.
3. Tarif appliqué = version active au moment de la confirmation, conservé sur la réservation.
4. Paiements nets (validés moins remboursements) <= montant dû, sauf procédure de trop-perçu explicitement prévue.
5. Facture émise immuable ; audit des changements et droits de modification.
6. Tests unitaires : tarifs, remises, durée, capacité, soldes ; tests d'intégration : concurrence, facture historique, autorisations.

## Sécurité / exploitation
Laravel Sanctum ou mécanisme adapté, RBAC via policies, validation FormRequest, rate limiting, journal d'audit, sauvegardes et restauration testée, migrations versionnées, secrets en variables d'environnement, CI avec tests.

## Règles validées : demi-journée, validation et messages
- Demi-journée : forfait couvrant toute durée positive jusqu'à 12 heures incluses, sans facturation horaire.
- Un dépassement des 12 heures déclenche une alerte et **nécessite la validation explicite de la caissière** avant toute prolongation ou changement de montant ; aucune conversion automatique en journée.
- Avant validation : vérifier conflits de disponibilité, afficher le tarif supplémentaire proposé et demander confirmation ; journaliser auteur, date, ancien et nouveau montant.
- Les données sont validées à la fois côté React (confort) et côté Laravel (source d'autorité) : champs obligatoires, dates, capacité, disponibilité, montants, remises, paiements, permissions.
- **Tous les messages d'erreur destinés aux utilisateurs sont en français et s'affichent dans une fenêtre modale accessible** avec titre, explication claire, action de fermeture et, si possible, indication de correction. Ne jamais exposer une trace technique ni des détails sensibles.
- Une erreur de validation peut aussi signaler visuellement le champ concerné ; la modale fournit le résumé et permet de revenir au formulaire sans perdre les données.
- Gérer explicitement : erreur 422 (validation), 401 (session), 403 (accès interdit), 404 (introuvable), 409 (chambre indisponible/conflit), 429 (trop de demandes), 500/503 (incident technique). Pour les erreurs réseau, afficher « Connexion impossible. Vérifiez votre connexion et réessayez. »
- Modales compatibles clavier, focus piégé pendant l'ouverture, retour du focus à la fermeture, `role=alertdialog` si approprié, et bouton de fermeture explicite.


## Décisions confirmées V6
- MySQL 8+ InnoDB et utf8mb4 comme SGBD unique.
- `spatie/laravel-permission` pour rôles et permissions, pas Laravel Spark.
- Espace admin complet : utilisateurs, rôles, permissions, clients, chambres, tarifs, réservations, caisse, factures, rapports, paramètres et audit.
- Fiche client détaillée : nom, prénoms, téléphone, email, ville et pays de provenance, adresse, pièce d'identité si nécessaire, historique ; protéger les données et limiter leur collecte.
- Chambres enregistrées individuellement, états calculés par période.
- Demi-journée = forfait pour une durée positive jusqu'à 12 h ; au-delà, la caissière valide la prolongation et le supplément avant toute modification, sans conversion automatique.
- Chaque opération est validée côté frontend et backend. Toute erreur bloque l'opération et déclenche une modale accessible avec un message explicite **en français** ; conserver les saisies.
