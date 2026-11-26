# Plan de correction — hors ligne, synchronisation et réservation guidée

Date : 22 novembre 2026. Demande utilisateur : conserver le fonctionnement hors ligne, synchroniser automatiquement au retour du réseau, guider les caissières après création et émettre les factures automatiquement.

## Comportement attendu

- Une opération annoncée comme gardée doit être inscrite durablement sur le poste ; deux écritures concurrentes ne doivent perdre aucune opération ni dupliquer un numéro.
- Les opérations restent récupérables après redémarrage, coupure et restauration. Le serveur reconnaît durablement les opérations déjà enregistrées, même après 30 jours.
- La synchronisation reprend automatiquement quand l'API répond et qu'une session valide est disponible. Les refus restent visibles et conservés ; les dépendances sont respectées.
- Une réservation confirmée reçoit automatiquement une facture unique. Une réservation en attente reçoit sa facture à la confirmation ; une réservation annulée n'est jamais facturée automatiquement. Hors ligne, un document provisoire est disponible et retrouve le document définitif à la synchronisation.
- La fiche réservation montre les étapes concrètes : confirmation si nécessaire, encaissement ou paiement différé, ticket de facture et reçu disponibles, arrivée, solde et départ. L'étape courante et la prochaine action sont visibles ; aucune arrivée ni aucun paiement ne sont inventés automatiquement.
- Les documents déjà émis restent figés. Annulation, modification et prolongation utilisent les avoirs/remplacements existants. Les règles fiscales restent celles déjà signalées à valider avec l'hôtel.
- Tous les comptes Caissière partagent les droits du rôle commun, avec création de réservation par défaut. Les sessions en ligne relisent leurs permissions au retour sur la fenêtre, au retour réseau et toutes les 30 secondes ; les droits connus sont conservés pendant une coupure.

## Lots et fichiers concernés

1. **Stockage et reprise** : `frontend/src/shared/offline/storage.ts`, `outbox.ts`, `backup.ts`, `offlineWrite.ts`, `outboxSync.ts`, `app/AppProviders.tsx` et tests. Transactions atomiques pour la file et les compteurs ; refus des écritures métier sans stockage durable ; coordination des envois et reprise après échec temporaire. Migration compatible des données locales existantes.
2. **Unicité et sécurité serveur** : `backend/app/Shared/Idempotency`, ordonnanceur, requêtes de rejeu, module Identity et tests. Garder durablement la reconnaissance des opérations ; interdire la promotion privilégiée par simple délégation de gestion des utilisateurs ; traiter les tarifs hors ligne sans accepter une heure déclarée comme preuve du droit à un ancien prix.
3. **Sauvegardes et client HTTP** : validation stricte des opérations restaurées, méthodes et chemins autorisés ; origine API imposée avant ajout des en-têtes sensibles ; tests de restauration et d'URL malveillante. Conservation des anciennes sauvegardes valides.
4. **Facturation automatique** : contrat `Reservations/Contracts/StayInvoicing`, implémentation Billing, création/confirmation de réservation, projection frontend hors ligne, rapprochement des documents et tests. L'émission découle de l'autorisation de confirmer une réservation ; elle ne nécessite plus un clic séparé. Pas de facturation rétroactive massive des anciennes réservations.
5. **Parcours guidé** : fiche et création de réservation, styles accessibles, tutoriels et tests. Étapes calculées à partir de l'état réel, boutons existants accessibles depuis l'étape suivante, facture/ticket accessibles directement, fonctionnement local et serveur.
6. **Validation et livraison** : tests métier ciblés puis suites, concurrence dans Edge/IndexedDB, build/typecheck/lint/format, analyse statique PHP, parcours navigateur en ligne et hors ligne ; mise à jour de `CHECK_LEVEL.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, schéma si migration et `RAPPORT.md`.

## Décisions de mise en œuvre

- Préserver React, Laravel, IndexedDB et le principe du poste principal. Un transfert forcé pendant une coupure peut produire un conflit à réconcilier ; il n'autorise aucun écrasement silencieux.
- Le navigateur peut fournir une version de tarif et un montant observé ; il ne peut pas prouver à lui seul l'heure réelle de saisie. Une divergence avec le tarif serveur est conservée comme refus explicite à examiner, plutôt que facturée silencieusement à un autre prix.
- Les factures sont produites côté serveur dans la transaction de création/confirmation afin d'éviter une réservation confirmée dont la facture aurait été oubliée. Le travail hors ligne garde une facture clairement provisoire.
- Une session serveur expirée suspend l'envoi, conserve les opérations et permet la reprise après connexion de leur auteur. La synchronisation application fermée dépend des capacités du navigateur ; l'ouverture et le retour réseau doivent suffire à reprendre automatiquement.
- Aucune réinitialisation de la base de travail, aucun envoi réel d'e-mail et aucun déploiement ne sont nécessaires aux corrections locales. Les tests emploient uniquement leurs bases isolées.

## Suivi

- [x] Plan écrit avant les corrections.
- [x] Lot 1 — stockage et reprise.
- [x] Lot 2 — unicité et sécurité serveur.
- [x] Lot 3 — sauvegardes et origine API.
- [x] Lot 4 — facturation automatique.
- [x] Lot 5 — parcours guidé.
- [x] Lot 6 — validation et documentation.

Résultats : 271 tests backend (2 221 assertions), 203 tests frontend, analyse statique PHP, Pint, types, lint, Prettier et build réussis. Deux parcours navigateur en ligne concernés réussis ; deux parcours hors ligne réussis (le parcours complet rejoué après adaptation de son sélecteur de ticket provisoire). Tests d'audit : 3 PHP et 5 frontend réussis ; concurrence Edge/IndexedDB sur un et deux onglets réussie. Détails et limites dans `RAPPORT.md`.
