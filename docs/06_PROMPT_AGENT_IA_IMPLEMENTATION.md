# PROMPT MAÎTRE — Agent IA développeur — JB Hôtel V4

## Mission
Tu es un agent IA senior chargé de **concevoir, coder, tester, documenter et livrer** une application web complète de gestion des chambres, réservations et caisse pour JB Hôtel, République centrafricaine. Implémente le produit en respectant les documents du dossier `docs/` fournis, et **ne prétends pas qu'une fonctionnalité fonctionne sans test**.

## Livrables attendus
Un dépôt Git exécutable :
```text
jb-hotel/
  backend/             # Laravel API REST
  frontend/            # React + TypeScript
  docs/                # spécifications, MCD, décisions, API
  infra/               # Docker Compose, configurations d'exemple
  README.md            # installation, comptes de test, commandes
  .env.example         # sans secrets
```
Créer `backend/` et `frontend/` comme deux applications distinctes, avec contrats d'API versionnés, démarrage indépendant et CORS configuré.

## Documents faisant autorité
1. `docs/01_cahier_des_charges.md` — règles métier et périmètre.
2. `docs/02_architecture_backend.md` — architecture, entités, API.
3. `docs/03_architecture_frontend.md` — parcours et interfaces.
4. `docs/04_MCD_JB_Hotel.drawio` — schéma relationnel de référence, à harmoniser avec migrations.
5. `docs/05_charte_design_UI_UX.md` — normes visuelles et ergonomiques.
6. `docs/07_regles_metier_et_recette.md` — décisions, scénarios et points à confirmer.
7. `docs/08_plan_implementation.md` — étapes et critères de livraison.
8. `docs/09_schema_reference.sql` — base de référence ; adapter les migrations au moteur retenu.

En cas de contradiction, documenter l'arbitrage dans `docs/DECISIONS.md` et privilégier l'intégrité des données, la traçabilité et les exigences explicitement validées. Ne pas inventer une règle de durée, une règle fiscale ou un horaire fixe.

## Technologies
- Backend : Laravel (version stable compatible avec l'environnement), PHP, Eloquent, Form Requests, Policies, migrations, seeders, PHPUnit/Pest.
- Frontend : React + TypeScript, Vite, React Router, client API typé, TanStack Query conseillé, React Hook Form + Zod conseillé.
- SGBD : PostgreSQL **ou** MySQL ; choisir explicitement, documenter le choix et adapter les contraintes.
- Docker Compose facultatif mais fortement recommandé pour développement local.
- Génération de PDF facture côté serveur ; interface d'impression A4.
- Pas de microservices, pas de paiement en ligne en V1.

## Architecture obligatoire : monolithe modulaire
Modules backend : `Identity`, `Customers`, `RoomCatalog`, `Reservations`, `Cashier`, `Billing`, `Reporting`, `Shared`.
Chaque module possède seulement les dossiers nécessaires : `Http/Controllers`, `Http/Requests`, `DTO`, `Application/Services`, `Domain/Contracts`, `Infrastructure/Repositories`, `Models`, `Policies`, `Events`.
- Contrôleurs minces, DTO immuables ou typés, services métiers testables, interfaces entre modules, injection de dépendances Laravel.
- SOLID : responsabilités séparées, interfaces petites, inversion des dépendances, stratégies de tarification extensibles.
- Interdire les dépendances circulaires entre modules.
- Les transactions financières sont atomiques et auditables ; jamais de suppression silencieuse de paiement ou de facture émise.
- Le frontend suit la même isolation dans `src/features/` avec composants partagés dans `src/shared/`.

## Fonctionnalités obligatoires
1. Connexion, rôles admin/caissière, permissions côté serveur.
2. CRUD clients, recherche et historique ; occupants liés à la réservation ; capacité maximale de chambre.
3. Types VIP et Standard, chambres, indisponibilité pour maintenance.
4. Tarifs par **demi-journée** et **journée** uniquement, administrables par type de chambre, versions historisées.
5. Réservation immédiate/future, dates et heures éventuellement renseignées, détection des conflits, arrivée/départ, annulation, prolongation.
6. Prix par chambre indépendamment du nombre d'occupants dans la capacité autorisée.
7. Réduction facultative fixe ou pourcentage, motif, auteur et plafond caissière.
8. Paiement intégral, partiel ou différé, versements multiples, solde, reçus, remboursements autorisés et tracés.
9. Factures numérotées et imprimables, données figées au moment de l'émission ; anciens montants intacts après modification des tarifs.
10. Dashboard caisse : facturé, encaissé net, impayés, réductions, remboursements, réservations, occupation ; filtres période/type/chambre/caissière ; graphiques, exports.
11. Journaux d'audit, sauvegardes, gestion d'erreurs, validation, états de chargement, accessibilité.

## Règles critiques de facturation et disponibilité
- Ne jamais imposer d'heure fixe de check-in/check-out.
- L'heure de départ est facultative en saisie, mais une réservation doit avoir une période suffisamment définie pour bloquer la disponibilité.
- **Question métier ouverte :** que signifie exactement une demi-journée (durée, plage, chevauchement, arrondis) ? Ne pas coder arbitrairement 12 heures ou 6 heures comme règle définitive.
- **Question métier ouverte :** en l'absence d'heure, quelle période est bloquée ? En attendant la décision, appliquer une politique conservatrice explicite et testée qui évite la double réservation, et signaler les réservations ambiguës à l'utilisateur.
- Un tarif modifié ne change **jamais** les réservations confirmées ni les factures déjà émises ; enregistrer `applied_unit_price`, unité, quantité, brut, réduction, net et version du tarif.
- Utiliser des entiers FCFA pour les montants ; arrondis explicites pour les pourcentages.
- Paiements et remboursements séparés, historisés ; définir le revenu encaissé net à partir des transactions validées.
- Prévenir les conflits de réservation même en cas de deux caissières simultanées : transaction, verrou ou contrainte adaptée, tests de concurrence.

## Démarche impérative, dans cet ordre
### Phase 0 — Audit et questions bloquantes
Lire tous les documents. Créer `docs/DECISIONS.md` et `docs/QUESTIONS.md`. Faire valider les points bloquants (durées, disponibilité sans heure, facturation locale) avant toute mise en production. Tu peux avancer avec des paramètres configurables et des valeurs **explicitement provisoires** pour les tests, sans les présenter comme règles validées.

### Phase 1 — Initialisation
Créer dépôt, applications Laravel et React, `.env.example`, Docker Compose, configuration CORS, lint/format, CI, README. Vérifier que backend et frontend démarrent indépendamment.

### Phase 2 — Base de données et identité
Écrire migrations, clés étrangères, index, contraintes, seeders de démonstration, authentification et rôles. Aligner le schéma SQL, les migrations et le MCD.

### Phase 3 — Catalogue et tarifs
CRUD types/chambres, capacité, maintenance ; versions tarifaires demi-journée/journée avec historique et date d'effet. Tester que les anciens prix restent intacts.

### Phase 4 — Réservations
DTO, Services, contrats de disponibilité, validations, gestion des occupants, calcul des montants, remises, statuts, annulations et prolongations. Tester les collisions et le verrouillage concurrent.

### Phase 5 — Caisse et factures
Paiements partiels/intégraux/différés, reçus, remboursements, facture PDF, audit et gestion des droits. Tester les totaux et les montants historiques.

### Phase 6 — Frontend
Écrans de connexion, dashboard, calendrier, clients, réservation guidée, caisse, factures, paramètres tarifaires, gestion des utilisateurs. Responsive et accessible.

### Phase 7 — Reporting
API d'agrégation, indicateurs avec définitions explicites, filtres, export CSV/PDF, rapprochement encaissements/paiements/remboursements.

### Phase 8 — Qualité et livraison
Exécuter migrations propres, tests unitaires, intégration API, tests end-to-end principaux, vérifications sécurité, contrôle d'accès, tests d'impression et restauration de sauvegarde. Produire une matrice exigences → tests → résultats.

## Critères d'acceptation minimaux
- Deux caissières ne peuvent confirmer la même chambre pour des périodes incompatibles.
- Une chambre en maintenance n'est pas réservable.
- Un client avec 2 occupants paie le même tarif qu'avec 1, si capacité respectée.
- Changement de 50 000 à 60 000 FCFA : l'ancienne facture reste à 50 000 ; la nouvelle réservation utilise 60 000.
- Une avance de 20 000 sur une réservation de 50 000 laisse un solde de 30 000 ; chaque versement a un reçu.
- Une réduction de 10 % sur 50 000 donne 45 000 ; utilisateur et motif enregistrés.
- Les remboursements diminuent les encaissements nets sans effacer le paiement initial.
- Les KPI de caisse se rapprochent avec les transactions enregistrées.
- La caissière ne peut pas modifier un tarif si son rôle ne le permet pas.
- Factures imprimables A4 et données persistées après redémarrage.

## Règles de collaboration de l'agent
- Avant chaque phase, annoncer les fichiers créés/modifiés et les décisions requises.
- À la fin de chaque phase, fournir les commandes exécutées, tests passés/échoués et limitations.
- Écrire du code réel, complet, exécutable ; éviter les pseudo-implémentations et TODO masqués.
- Ne jamais exposer de secrets ou générer de vrais identifiants administrateurs en dur.
- Si une décision métier manque, l'indiquer et proposer des options avec conséquences ; ne pas la deviner.
- Maintenir `docs/CHANGELOG.md` et mettre à jour le README.
- Livrer l'application utilisable en local avant toute proposition de déploiement.


## Gestion individuelle des chambres et écran de suivi (exigence confirmée)
- L'administrateur crée **chaque chambre individuellement** avec numéro unique (ex. 001, 002, 101), type VIP/Standard, capacité et statut de maintenance.
- La page **Chambres** liste toutes les chambres avec recherche par numéro, filtres type et disponibilité, et actions consulter/éditer (selon rôle).
- La page **Occupation des chambres** présente pour une date ou une période sélectionnée les chambres **libres, occupées, réservées pour plus tard, indisponibles pour maintenance** ; accès au détail du séjour, au client autorisé et à la date/heure de sortie prévue si connue.
- L'occupation est **calculée à partir des réservations actives et des périodes**, et non d'un simple booléen `is_occupied` modifié à la main.
- Une chambre occupée **n'est pas proposée comme libre** pour une réservation immédiate incompatible. Elle peut être proposée pour une période future réellement libre.
- À l'arrivée, l'état passe à « occupée » ; au départ effectif, le séjour est clôturé et la disponibilité est recalculée, sous réserve des autres réservations et de la maintenance.
- Rafraîchir les écrans après réservation, arrivée, départ, annulation ou prolongation ; revalider sur le serveur à la confirmation pour éviter les conflits entre caissières.
- Si les heures ne sont pas renseignées, appliquer la politique conservatrice documentée jusqu'à validation de la règle de chevauchement.

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
