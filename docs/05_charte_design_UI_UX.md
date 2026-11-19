# JB Hôtel — Charte UI/UX V3
**Document de proposition, identité à valider par l'hôtel.**
## Principes
Clarté opérationnelle, rapidité à la caisse, lisibilité des montants, prévention des doubles réservations, historique visible.
## Palette proposée
- Primaire : vert profond `#047857`
- Accent : vert `#10B981`
- Fond : `#F8FAFC`
- Texte : `#0F172A`
- Erreur : `#B91C1C`
- Avertissement : `#B45309`
Ne pas utiliser la couleur seule pour exprimer le statut.
## Typographie et grille
Police système ou Inter, base 16px, échelle cohérente, grille de 8px, focus visible, composants avec zones tactiles confortables.
## Composants
Navigation latérale, en-tête, recherche client, calendrier de disponibilité, cartes chambre, badges statut, tableaux filtrables, formulaire réservation, récapitulatif des prix, modale de confirmation, aperçu facture.
## Écrans prioritaires
1. Dashboard caisse : KPIs, filtres, journal, évolution.
2. Disponibilités : périodes, chambre, type, maintenance.
3. Nouvelle réservation : étapes client → occupants → période → chambre → prix/remise → paiement → confirmation.
4. Tarifs : matrice VIP/Standard × demi-journée/journée, historique des versions.
5. Facture/reçu : version imprimable A4.
## Accessibilité
Cible WCAG 2.2 AA : contrastes, clavier, labels, erreurs contextualisées, ordre de focus, libellés des graphiques.
## Cohérence métier
Afficher le prix historique sur les réservations existantes ; ne jamais recalculer silencieusement. Heures facultatives dans le formulaire ; afficher une alerte si les informations ne suffisent pas à garantir une disponibilité infra-journalière.

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


## Complément visuel validé par la demande du 19/11/2026

Le contenu de l’application reprend la référence « Tableau de bord financier de l’hôtel.webp » : fond clair légèrement bleuté, titres sombres avec icône dans un carré menthe, indicateurs verts/ambre/bleus, tableaux à en-tête vert pâle, filtres blancs encadrés et actions compactes. Les boutons de création et de validation sont verts, les actions secondaires neutres et les annulations/retraits signalés en rouge. Les icônes accompagnent les libellés et ne constituent jamais la seule explication d’une action.

**Contrainte explicite : l’aside existant reste inchangé.** Le thème est isolé dans `frontend/src/content-theme.css`, appliqué à la zone de travail et aux dialogues, sans modification des impressions. Les décisions D-045 et D-046 précisent le périmètre.


## Ajustements validés par l’utilisateur — 19/11/2026

- Synthèses avec cartes sur les pages métier, en précisant le périmètre des chiffres affichés.
- Boutons verts et bleus, couleurs différentes pour les actions côte à côte, avec davantage d’espace. Maintenir les états actifs, désactivés, le focus et les actions destructives distinctes.
- Icônes dans les champs et listes, sans remplacer leurs libellés accessibles.
- Chaque tableau d’écran dispose d’une zone de filtres automatiques et d’une pagination, y compris les tableaux secondaires ; commandes masquées sur les documents imprimés.
- Occupée : rouge ; réservée : bleu ; libre : vert ; maintenance : ambre.
- Aside conservé conformément à la demande explicite.
