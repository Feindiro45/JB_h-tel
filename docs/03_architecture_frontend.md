# JB Hôtel — Architecture frontend React V3
## Stack et organisation
React + TypeScript, React Router, client API typé, React Query/TanStack Query (option), bibliothèque de composants accessible. Frontend organisé par **fonctionnalités isolées**, cohérentes avec les contrats API du backend.

```text
src/
  app/ (router, providers, auth)
  shared/ (ui, api, utils, types)
  features/
    auth/
    customers/
    rooms/
    rates/
    reservations/
    cashier/
    invoices/
    reports/
```
Chaque feature possède `pages/`, `components/`, `hooks/`, `api/`, `types/`, `validation/` si nécessaire. Ne pas importer les composants internes d'une autre feature ; exposer des API publiques limitées.

## Navigation
- Tableau de bord Caisse
- Réservations : liste, création, modification/prolongation, annulation
- Disponibilités : calendrier par chambre et période, maintenance
- Clients : recherche, création, historique, occupants
- Encaissements : paiements, avances, soldes, remboursements autorisés
- Factures et reçus : prévisualisation, impression
- Administration : utilisateurs, chambres, catégories, versions tarifaires, plafonds de réduction, audit

## Parcours de réservation
1. Rechercher ou créer le client ; saisir les occupants et vérifier la capacité.
2. Choisir période et unité **demi-journée ou journée** ; heures facultatives selon règles de disponibilité à valider.
3. Afficher uniquement les chambres réellement compatibles avec la période.
4. Charger le tarif actif VIP/Standard ; montrer prix unitaire, quantité, brut.
5. Appliquer une réduction autorisée ; afficher total et justificatif.
6. Choisir paiement intégral, partiel ou différé ; confirmer.
7. Générer facture/reçu et proposer impression.

## Tableau de bord Caisse
Cartes de KPI (facturé, encaissé net, impayés, remboursements, réductions, réservations), courbes par date, barres VIP/Standard, journal filtrable. Indiquer clairement les dates de référence et l'état des données ; ne pas confondre encaissements et facturation.

## Règles UX
- Montants FCFA, milliers espacés, dates et heures explicites, fuseau configurable.
- États chargement, vide, erreur et succès ; confirmation pour annulations/remboursements.
- Navigation clavier, labels de formulaires, contrastes WCAG 2.2 AA ciblés, messages d'erreur accessibles.
- Impression A4 avec CSS print ; facture générée côté serveur comme source de vérité.
- L'UI ne décide jamais seule des autorisations ni de la disponibilité.
- Responsivité : desktop caisse en priorité, tablette prise en charge.

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
