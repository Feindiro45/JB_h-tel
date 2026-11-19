# Journal des modifications — JB Hôtel

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### CI des parcours navigateur — 20/11/2026
- Annotations GitHub : chaque échec Playwright et les dernières erreurs du journal Laravel sont publiés (le journal d’exécution exige les droits d’administrateur du dépôt).
- Performance : le PDF d’une facture n’est plus rendu pour une notification qui ne partira pas (client sans e-mail) ; l’émission redevient immédiate au lieu d’environ 4 secondes, et 8 pour une prolongation facturée.
- Recette : serveur PHP à 4 processus sous Linux (`--no-reload`), parcours complet limité à 2 minutes.

### Annulation et prolongation alignées sur la caisse et la facture — 20/11/2026 (D-053)
- Corrigé : une réservation annulée restait comptée dans la caisse. L’annulation rembourse désormais intégralement ce qui a été encaissé, dans la même opération (montant confirmé, moyen au choix, droit de rembourser exigé), et annule la facture active par un avoir, que le séjour ait été payé ou non.
- Montant dû à 0 pour une réservation annulée sur la fiche, le tableau de bord et les séjours du client, prix initial affiché pour mémoire. Les annulations antérieures encore payées apparaissent dans « Annulations à rembourser » de la caisse.
- Prolongation d’un séjour facturé : l’ancienne facture est annulée par un avoir et une nouvelle facture, émise dans la même opération, détaille le séjour initial et la prolongation (« Facture remplaçant la facture n° … »). Chaque prolongation est enregistrée dans la nouvelle table `reservation_extensions`.
- Tout ou rien : si le remboursement ou la facturation échoue, l’annulation ou la prolongation n’est pas enregistrée. 10 tests backend, 5 tests frontend, 21 contrôles contre un vrai serveur ; MCD complété (28 tables).
- CI : les échecs des parcours navigateur sont publiés en annotations GitHub.

### Relecture finale avant envoi — 19/11/2026
- Relecture des écrans d’administration, des filtres et des rapports produits en parallèle, puis de toute la suite : 183 tests backend, 74 tests frontend, 4 tests navigateur, Pint, Larastan, lint, Prettier, TypeScript et build verts.
- Corrigé : la modification d’une catégorie de chambre renvoyait son code, que le serveur refuse en modification ; chaque enregistrement échouait en 422. Le code n’est plus envoyé, il apparaît dans le titre, et sa saisie à la création suit le format du serveur. Test ajouté.
- Contrats réels de l’administration et des filtres rejoués avec une vraie session sur la base de recette `jb_hotel_e2e` (60 contrôles) : catégories, chambres, maintenance, tarifs immédiat et daté puis retrait, utilisateurs, droits, paramètres, audit, recherche par client, lignes par page et refus de la caissière.
- Suivi : lignes UUID et catalogue de la phase 3 restées non cochées alors qu’elles étaient faites et testées, désormais cochées.

### Vues d’ensemble et tableaux complets — 19/11/2026
- Synthèses réelles sur les pages métier et fiches, périmètres des compteurs précisés, espacement accru entre éléments et icônes sémantiques dans les champs.
- Boutons verts et bleus, alternés lorsqu’ils sont voisins ; cartes différenciées. Aside conservé.
- Filtres et paginations propres aux tableaux secondaires (caisse, dashboard, catégories, tarifs, détails de séjour, planning, rapports et reçu). Recherche locale immédiate, états vides et impression complète des lignes reçues.
- Chambres occupées en rouge, y compris le graphique et les cartes ; occupation courante affichée et filtrable dans la liste des chambres, sous permission.


### Page blanche du serveur de développement — 19/11/2026
- Reproduction de l’erreur d’export `ReservationDetailPage` sur le serveur actif : Vite conservait une transformation vide, alors que le fichier contenait son export.
- Redémarrage du serveur frontend et réoptimisation forcée ; affichage rétabli sur le port 5173.
- Ajout de `npm run check:dev` pour vérifier le chargement réel sur un serveur déjà lancé, sans connexion ni réinitialisation de base. Quatre routes et un rechargement vérifiés, lint vert.


### Facture vert/or et filtres automatiques — 19/11/2026
- PDF inspiré de « Facture élégante du JB Hôtel.webp » : bandeau illustré, monogramme or, icônes, blocs client/séjour, tableau vert, totaux, statut, versements, QR et pied de page numéroté ; même charte pour les avoirs.
- Données figées et historiques conservées. Aucune TVA, échéance, prestation offerte, signature ni cachet ajoutés depuis l’image de référence. Illustration dérivée de l’image déjà utilisée par l’application.
- Recherches serveur différées de 300 ms, choix et dates valides immédiats, retour en première page, suppression des boutons Filtrer/Rechercher des listes. Périodes invalides retenues pendant correction, filtres clients/réservations effaçables ensemble.
- Tests du comportement des filtres, parcours navigateur étendu à la recherche et à l’effacement sans validation. Facture et avoir d’une page, document long de trois pages contrôlés ; QR décodés depuis les PDF rendus. Aside conservé.


### Référence visuelle et boutons — 19/11/2026
- Style du contenu aligné sur l’image fournie : fil d’Ariane, titres avec icônes, cartes pastel, filtres, onglets, tableaux et actions. L’aside est explicitement conservé.
- Page Factures et reçus réorganisée autour des indicateurs réels, des filtres et de la liste ; type des pièces et icônes ajoutés, impression accessible.
- Boutons harmonisés avec icônes, actions sensibles distinctes, confirmations et chargements ; fenêtre de connexion et dialogues cohérents avec la même charte.
- Navigation clavier des onglets conservée malgré leur nouvelle disposition ; affichage monétaire zéro normalisé.


### Design des paginations — 19/11/2026
- Pied de liste commun avec boutons numérotés, page active vert profond et accent doré, ellipses, plage de résultats et sélecteur compact.
- Disposition adaptée à la largeur du panneau, navigation accessible et contrôle aux formats 1440/768/390/320 px ; test navigateur des changements de page, de taille et des résultats vides.
- Correction du débordement mobile des libellés masqués des tableaux ; pagination exclue de l’impression.


### Compléments du 19/11/2026 — Administration, filtres, rapports et livraison locale
- Écrans d’administration complets : chambres/catégories et maintenance, grille/historique et publication/retrait des tarifs, comptes et droits, paramètres signalés comme provisoires/validés, audit filtré avec détail avant/après.
- Filtres client, catégorie et forfait sur les séjours, recherche client sur reçus et instantanés de facture, provenance des clients, annuaires d’agents en UUID, pagination commune et taille de page.
- Rapports financiers filtrés, courbe quotidienne, ventilation par catégorie, soldes et occupation actuels, exports CSV/PDF protégés, rapprochement avec le journal et traitement correct des avoirs/remboursements/annulations.
- Moyens de paiement chargés depuis la configuration ; correction d’une erreur de syntaxe préexistante dans la recherche client et des liens PDF qui supprimaient le Referer nécessaire à Sanctum.
- Playwright : parcours réels sur base isolée, contrôle CSRF, droits, responsive et Axe WCAG ; ajout à la CI MySQL 8.4.
- Sauvegarde native, empreinte SHA-256 et restauration contrôlée dans une base vide distincte ; MCD draw.io aligné sur les 27 tables réelles ; matrice de recette et guide d’exploitation.
- Les validations métier/fiscales, SMTP et papier restent en attente ; aucune mise en production.


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
- Phase 6B, **caisse et documents** :
  - écran **Caisse** : journal d'une période (raccourcis aujourd'hui, hier, 7 jours, mois), encaissé, remboursé, net et annulés, ventilation par moyen de paiement et par agent, mouvements chronologiques, soldes à encaisser avec encaissement direct, impression ;
  - **remboursement** (plafonné au remboursable, motif obligatoire) et **annulation d'encaissement** (motif) pour l'administrateur, depuis la caisse, la liste des reçus et la fiche réservation ;
  - écran **Factures et reçus** : onglets accessibles au clavier, filtres, totaux « factures − avoirs », PDF, vérification publique, **avoir motivé** ;
  - **reçu imprimable A4** (`/documents/recus/:id`) avec l'en-tête de l'hôtel, les remboursements et le reste à payer ;
  - nouveaux endpoints `GET /api/v1/cash-journal`, `GET /api/v1/payments`, `GET /api/v1/invoices` et `GET /api/v1/receivables` ; contrat `ReservationLedger::findMany` ;
  - 7 tests backend, 8 tests frontend ; décision D-041.
### Corrigé
- Connexion : la page demandée avant la connexion n'était pas toujours retrouvée (deux redirections concurrentes).
- Champs de formulaire : l'aide et le message d'erreur ne font plus partie du nom lu par les lecteurs d'écran ; ils sont reliés au champ par `aria-describedby`.
- Fiche client : le type et le numéro de pièce d'identité sont toujours contrôlés ensemble (la règle était ignorée quand un seul des deux était envoyé).
- Le modèle `User` a des attributs par défaut : un utilisateur tout juste créé ne provoque plus d'erreur 500 en mode strict.

### Modifié
- Spécifications déplacées de la racine vers `docs/` ; ancienne version V2 archivée dans `docs/archive/`.
- Phase 2 : le modèle `User` passe de `App\Models` à `App\Modules\Identity\Models` ; la colonne `users.role` du schéma 09 n'est pas créée (rôles Spatie).
