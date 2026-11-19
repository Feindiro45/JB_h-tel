# Règles métier et recette — JB Hôtel
## Décisions confirmées
- Chambres enregistrées individuellement, numéros uniques, VIP ou Standard.
- Prix par chambre, non par occupant ; capacité maximale.
- Modes de facturation : demi-journée ou journée ; pas de tarif horaire.
- Heures d'arrivée et de départ facultatives ; aucun horaire standard imposé.
- Réservation immédiate ou future ; disponibilité par période.
- Paiements complets, partiels ou différés ; réductions autorisées et auditées.
- Tarifs versionnés ; anciennes réservations et factures figées.
- Dashboard caisse, suivi des chambres libres/occupées/réservées/maintenance.

## Points non tranchés
- Définition commerciale d'une demi-journée et d'une journée, arrondis.
- Période exacte bloquée quand aucune heure n'est renseignée.
- Règles de facturation et justificatifs fiscaux applicables.
L'agent ne doit pas inventer ces règles : demander validation avant mise en production.

## Scénarios de recette
1. Créer chambre 101 VIP et 102 Standard ; vérifier numéros uniques.
2. Confirmer une réservation immédiate de 101 : chambre affichée occupée durant le séjour.
3. Chercher 101 sur une période chevauchante : refus ; sur période libre : disponible.
4. Clôturer le séjour : recalculer l'état, en tenant compte des réservations futures.
5. Modifier un tarif VIP de 50 000 à 60 000 FCFA : facture antérieure inchangée.
6. Réserver pour deux occupants : tarif identique, capacité contrôlée.
7. Avance de 20 000 sur 50 000 : solde 30 000, reçu imprimable.
8. Réduction de 10 % sur 50 000 : net 45 000, motif/auteur enregistrés.
9. Remboursement : paiement initial conservé, encaissement net corrigé.
10. Deux caissières réservent la même chambre simultanément : une seule confirmation.

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
