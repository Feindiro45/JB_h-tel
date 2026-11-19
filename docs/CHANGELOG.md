# Journal des modifications — JB Hôtel

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
- Phase 0 : audit des spécifications ; `docs/DECISIONS.md` (contradictions et arbitrages), `docs/QUESTIONS.md` (questions métier à valider) ; suivi d'avancement `CHECK_LEVEL.md`.
- Phase 1 : dépôt git ; application `backend/` (Laravel 12, Sanctum, API `/api/v1`, contrat d'erreur JSON en français, endpoint de santé) ; application `frontend/` (React 19 + TypeScript + Vite, routeur, TanStack Query, client API typé, modale d'erreur accessible) ; `infra/docker-compose.yml` (MySQL 8.4) ; CI GitHub Actions ; README.

- Phase 2 :
  - **Schéma de base complet** : 10 migrations, clés étrangères en `RESTRICT`, 20 contraintes `CHECK`, intervalle bloqué indexé ; documenté dans `docs/SCHEMA.md`.
  - **Module Identity** : connexion, déconnexion et profil (Sanctum SPA, CSRF, 5 essais/min) ; gestion des utilisateurs par l'administrateur, avec protections « soi-même » et « dernier administrateur » ; 27 permissions et 2 rôles (spatie/laravel-permission) ; permissions de la caissière modifiables ; commande `jb:create-admin`.
  - **Journal d'audit** (`AuditTrail`), append-only et transactionnel.
  - **Seeders** : rôles, paramètres provisoires (`settings`) et comptes de démonstration (local uniquement).
  - Décisions D-017 à D-025.

- **Identifiants publics UUID** (D-026) :
  - colonne `uuid` sur les 11 tables d'entités ;
  - routes et réponses de l'API uniquement en UUID ;
  - un entier dans une route donne 404.
- Phase 3, module **RoomCatalog** :
  - types de chambre (VIP et Standard en référence) ;
  - chambres individuelles avec tri naturel, recherche, filtres et maintenance tracée ;
  - **tarifs versionnés** demi-journée et journée : publication immédiate ou programmée, chaîne de versions continue, retrait d'une version programmée, historique (ancien et nouveau tarif, auteur, motif) et grille des tarifs en vigueur ;
  - contrats publics `CurrentPriceProvider` et `RoomDirectory` pour le module Reservations ;
  - catalogue de démonstration (local uniquement) ;
  - décisions D-027 et D-028.
- CI : Composer authentifié auprès de GitHub et cache des dépendances.
- Phase 4, module **Customers** : fiche client détaillée en UUID ; recherche (nom, prénoms, téléphone, e-mail, pièce) ; création et modification tracées ; contrat public `CustomerDirectory`.
- Phase 4, module **Reservations** :
  - **période bloquée** calculée (politique provisoire sans heure, D-009) ;
  - **demi-journée jusqu'à 12 h**, au-delà refus avec la quantité nécessaire et le supplément proposés, sans conversion automatique ;
  - **prix figé** (tarif en vigueur à la confirmation, prix par chambre, capacité contrôlée) ;
  - **remises** en pourcentage arrondies au FCFA ou en montant fixe, avec motif, auteur et plafond de la caissière ;
  - devis sans enregistrement ;
  - **anti double réservation** par verrou sur la chambre, testé avec deux vrais processus concurrents ;
  - statuts, confirmation, arrivée, départ, annulation motivée, occupants ;
  - **prolongation** en deux temps (aperçu du supplément, puis confirmation explicite) ;
  - historique des modifications ;
  - **disponibilités** par période et **occupation** à un instant (libre, réservée, occupée, maintenance, réservée plus tard) ;
  - décisions D-029 à D-034 et questions Q-18 à Q-21.
- Erreurs métier : champ `details` (aides à la correction), affiché par la modale du frontend.
- Phase 5A, module **Cashier** :
  - paiements intégraux, partiels ou différés, avec plusieurs versements par réservation ;
  - **un reçu numéroté par versement** (`REC-AAAA-NNNNNN`, numérotation continue sous verrou) ;
  - situation de caisse : montant dû, encaissé, remboursé, encaissé net, solde, statut ;
  - **trop-perçu refusé** ;
  - annulation d'encaissement et **remboursements** tracés, sans jamais supprimer le paiement initial ;
  - données du reçu imprimable ;
  - contrat public `ReservationLedger` côté Reservations ;
  - décision D-035.
- Phase 5B, module **Billing** :
  - factures `FAC-AAAA-NNNNNN` **figées** (instantané complet, versements et solde à l'émission) et immuables ;
  - une facture active par réservation ;
  - **avoirs** `AV-AAAA-NNNNNN` ;
  - **PDF A4** généré côté serveur (dompdf, sous-ensemble de police, environ 30 Ko) ;
  - contrats publics `PaymentHistory` (Cashier) et `invoiceData` (Reservations) ;
  - décision D-037.
- Phase 5C, **QR code de vérification** sur chaque facture et avoir :
  - page publique sans connexion (`/verification/factures/{id}?code=`) et API JSON publique ;
  - code aléatoire par document, réponse identique si le document est inconnu ou le code faux ;
  - données minimales (initiales du client), débit limité ;
  - décision D-038.
- Phase 5D, **e-mails au client** (module Notifications) :
  - si le client a donné son e-mail, un message en français part à chaque opération : confirmation et bienvenue, arrivée, prolongation, annulation, départ, reçu, remboursement, **facture PDF jointe**, avoir ;
  - envoi en file d'attente après validation de la transaction ;
  - lien de désinscription signé, préférence modifiable sur la fiche client ;
  - nouveaux événements métier : `ReservationCheckedIn`, `ReservationCheckedOut`, `ReservationCancelled`, `ReservationExtended`, `PaymentRefunded` ;
  - contrats `InvoiceDocuments` (Billing) et `PaymentHistory::receipt/refund` (Cashier) ;
  - décision D-039 et question Q-22.

- Phase 6A, **écrans de la réception** (design du prototype, amélioré) :
  - système de design repris du prototype : barre latérale par groupes, cartes, badges, modales, notifications brèves, états vides et de chargement, impression ;
  - **connexion réelle** (cookie CSRF puis session Sanctum) avec la photo de l'hôtel ; retour à la page demandée après connexion ; session expirée gérée ;
  - **menu et routes filtrés selon les permissions du serveur** ; accueil sur la première page autorisée ;
  - **tableau de bord** : encaissé du jour, facturé du mois, soldes à recevoir, chambres occupées, encaissements des 7 derniers jours, occupation, arrivées et départs du jour, réservations récentes ;
  - **réservations** : liste filtrable et paginée, fiche avec confirmation, arrivée, départ, prolongation (aperçu du supplément puis validation), occupants, annulation motivée, encaissement, émission de facture, PDF, lien de vérification et historique ;
  - **nouvelle réservation guidée** : client existant ou nouveau, chambres réellement libres, devis du serveur en direct, remise, paiement différé, intégral ou avance ;
  - **disponibilités** : planning par chambre sur 7 ou 14 jours ;
  - **clients** : répertoire avec recherche, fiche, séjours, création et modification ;
  - nouveaux endpoints `GET /api/v1/dashboard` (module Reporting) et `GET /api/v1/planning` ;
  - 47 tests frontend ; décision D-040.
### Corrigé
- Connexion : la page demandée avant la connexion n'était pas toujours retrouvée (deux redirections concurrentes).
- Champs de formulaire : l'aide et le message d'erreur ne font plus partie du nom lu par les lecteurs d'écran ; ils sont reliés au champ par `aria-describedby`.
- Fiche client : le type et le numéro de pièce d'identité sont toujours contrôlés ensemble (la règle était ignorée quand un seul des deux était envoyé).
- Le modèle `User` a des attributs par défaut : un utilisateur tout juste créé ne provoque plus d'erreur 500 en mode strict.

### Modifié
- Spécifications déplacées de la racine vers `docs/` ; ancienne version V2 archivée dans `docs/archive/`.
- Phase 2 : le modèle `User` passe de `App\Models` à `App\Modules\Identity\Models` ; la colonne `users.role` du schéma 09 n'est pas créée (rôles Spatie).
