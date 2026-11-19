# JB Hôtel — Cahier des charges fonctionnel V3
**Statut :** base de conception à valider avec l'hôtel. **Périmètre V1 :** chambres, réservations et caisse, sans site public ni paiement en ligne.

## Acteurs
- Administrateur : utilisateurs, types et tarifs, chambres, droits, rapports, annulations et contrôles.
- Caissière : clients, réservations, arrivées/départs, encaissements, reçus et factures, réductions dans les limites autorisées.

## Référentiel
- Types de chambre : VIP et Standard. Tarifs configurables par type pour **demi-journée** et **journée** ; pas de tarif horaire.
- Chambres : numéro unique, type, capacité maximale, état de maintenance.
- Clients : identité, contact, historique de réservations ; occupants rattachés à chaque réservation.
- Prix par chambre, indépendant du nombre d'occupants tant que la capacité est respectée.

## Réservation et occupation
- Réservation immédiate ou future ; chambre attribuée et période demandée.
- Choix de l'unité tarifaire (demi-journée ou journée) et quantité ; heures d'arrivée et de départ facultatives pour la saisie commerciale, **aucun horaire standard imposé**.
- Les dates de début/fin et, lorsqu'elles sont nécessaires, les heures doivent permettre de vérifier les conflits de réservation. Si l'heure est absente, une règle de granularité/occupation conservatrice reste à valider : ne pas promettre une disponibilité infra-journalière non démontrée.
- Statuts : en attente, confirmée, en cours, terminée, annulée ; états calculés « libre », « réservé », « occupé », « maintenance » pour une période donnée.
- Prolongation uniquement après vérification des conflits ; journal des modifications et des annulations.

## Tarifs historiques
- L'administrateur peut modifier les tarifs futurs. Chaque réservation sauvegarde **prix unitaire appliqué, unité, quantité, montant brut, réduction, total net** et référence de version tarifaire.
- Les nouvelles réservations prennent la version tarifaire active ; les réservations existantes et factures émises ne sont pas recalculées.
- Historique : ancien tarif, nouveau tarif, auteur, date d'effet, motif.

## Réductions et paiement
- Réduction facultative : pourcentage ou montant fixe, avec motif, auteur et plafond de délégation configurable.
- Paiement intégral, avance/partiel ou différé ; plusieurs encaissements par réservation, solde calculé, reçu par paiement.
- Remboursement et annulation d'encaissement tracés, jamais par suppression silencieuse.

## Facturation
- Numéro de facture unique, facture imprimable PDF ou impression navigateur, montant brut, remise, net, versements et solde.
- Factures émises figées ; correction par document rectificatif/avoir selon règles comptables et fiscales locales à valider.

## Tableau de bord Caisse
- Filtres : période, chambre/type, caissière, statut.
- Indicateurs séparés : réservations, chambres occupées/libres, montant facturé, encaissements nets, impayés, réductions, remboursements.
- Graphiques d'évolution, ventilation VIP/Standard, journal de caisse, export CSV/PDF ; définition de chaque indicateur et rapprochement avec paiements.
- Ne pas assimiler montant facturé, chiffre d'affaires comptable et argent encaissé.

## Exigences transversales
- Authentification, autorisations côté serveur, journal d'audit, sauvegardes, validation, transactions atomiques, gestion des accès aux données personnelles.
- Conception responsive, impression A4, formats FCFA et dates locales.
- Modules isolés, contrats explicites, DTO, services, principes SOLID et tests.

## À valider avant développement
1. Définition exacte de la demi-journée et de la journée, arrondis, quantité et dates/heure manquantes.
2. Règles de confirmation des réservations non payées et conditions de remboursement.
3. Identifiants clients et obligations de facturation applicables en RCA.
4. Conditions de chevauchement entre réservations d'une même journée en l'absence d'heures.

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
