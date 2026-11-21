# SUIVI NEW — Ticket thermique 80 mm et mode hors ligne

> Suivi des évolutions demandées dans le dossier `new/` (21/11/2026). Mis à jour à chaque étape.
> Le suivi général du projet reste dans `CHECK_LEVEL.md`.

**Dernière mise à jour :** 21/11/2026 — **lot 1 terminé en local** : tickets du reçu et de la facture/avoir, 118 tests frontend et scénario navigateur verts ; reste l’essai sur l’imprimante réelle. Configuration remise en local (API 8000). Module admin « Mode hors ligne » ajouté au plan (lot 4A).

**Légende :** `[x]` fait et vérifié · `[~]` écrit, pas encore testé · `[ ]` à faire · `[!]` attend une décision ou l'hôtel.

## Documents reçus (`new/`)

| Fichier | Contenu | Usage |
|---|---|---|
| `JB_Hotel_Facture_Thermique_80mm.md` | Spécification du ticket 80 mm : maquette, données, règles, recette (12 scénarios) | Référence du lot 1 |
| `JB_Hotel_Architecture_Offline_First (1).md` | Architecture hors ligne : PWA, IndexedDB (Dexie), file d'envoi, synchronisation, conflits | Référence des lots 2 à 4 |
| `jb-hotel-ticket-80mm/…/ThermalReceipt.jsx` + CSS | Maquette React en JavaScript, données fictives, sans `package.json` | Inspiration visuelle seulement : réécrite en TypeScript avec les composants du projet |

Les deux documents se disent eux-mêmes « à valider avant implémentation ».

## Vue d'ensemble

| Lot | Intitulé | Dépend d'une décision ? | Statut | Avancement |
|---|---|---|---|---|
| 0 | Relancer le projet en local | non | ✅ Fait | 100 % |
| 1 | Ticket thermique 80 mm (en ligne) | N-01 décidé : ajout (D-061) | ✅ Fait en local (reste l’essai sur l’imprimante de l’hôtel) | 95 % |
| 2 | PWA en lecture hors ligne (consultation et réimpression) | non | ⬜ À faire | 0 % |
| 3 | Fiabilité réseau : clés d'idempotence côté serveur | non | ⬜ À faire | 0 % |
| 4 | Écritures hors ligne et synchronisation | **oui** : N-02, N-03, N-05, N-06 (N-04 décidé : D-062) | ⬜ Bloqué | 0 % |
| 4A | Module admin « Mode hors ligne » (postes, synchronisation, règles, sauvegardes, guide) + encart du tableau de bord | en partie : postes et état possibles dès maintenant (D-062) ; le reste suit le lot 4 | ⬜ À faire | 0 % |
| 5 | Recette (coupures, imprimante réelle) | matériel de l'hôtel | ⬜ À faire | 0 % |

## Lot 0 — Relancer le projet en local ✅

- [x] Lecture complète du dossier `new/` (2 spécifications et 3 fichiers de maquette)
- [x] Cause du blocage trouvée : `backend/.env` contient la configuration **de production** (cPanel, base `CPANELUSER_jbhotel`) et l'API locale répondait 500
- [x] **Configuration remise entièrement en local** (demande de l'utilisateur, 21/11) :
  - `backend/.env` : configuration locale (base `jb_hotel`, `root`, URL `localhost`), reprise de l'ancienne configuration locale `.env copy.example` ;
  - `frontend/.env.local` : `VITE_API_URL=http://localhost:8000` ;
  - **sauvegardes de la production** (ignorées par git) : `backend/.env.production.backup` (ancien `.env` cPanel complet) et `frontend/.env.production.backup` (ancien `.env.local`) ;
  - `frontend/.env.production.local` est conservé : il ne sert qu'à `npm run build` pour la production ;
  - fichiers temporaires de la session supprimés (`backend/.env.local`, `backend/.env.testing`, `frontend/.env.development.local`, `frontend/.env.test.local`) ; serveur temporaire du port 8001 arrêté
- [x] MariaDB 10.4 active ; 7 migrations appliquées sur `jb_hotel`
- [x] API locale sur **http://localhost:8000** : santé 200, base « ok », CORS et cookie CSRF corrects, connexion admin 200
- [x] Frontend sur **http://localhost:5173** : il appelle l'API locale (vérifié dans le module servi) ; `npm run check:dev` vert (routes, rechargement, aucune erreur JavaScript)
- [x] `DEMO_USERS_PASSWORD` était vide : nouveau mot de passe défini pour le compte de démo `admin@jbhotel.local`, **dans la base locale `jb_hotel` uniquement** (mot de passe transmis dans la conversation, jamais écrit dans un fichier du dépôt). Connexion vérifiée : 200, rôle admin, 28 permissions

### Commandes de lancement local

```bash
# Backend (depuis backend/)
php artisan serve                 # http://localhost:8000
php artisan queue:work            # e-mails en file d'attente
# Frontend (depuis frontend/)
npm run dev
```

## Analyse : écarts avec les règles actuelles du projet

| Point des nouvelles specs | Règle actuelle (CLAUDE.md, DECISIONS) | Conséquence |
|---|---|---|
| « Remplacer l'impression A4 » par le ticket 80 mm | La facture PDF A4 est générée par le serveur à partir de l'instantané figé : c'est la source de vérité (phases 5B et 5C, QR de vérification) | Proposition : **ajouter** le ticket 80 mm et garder le PDF A4 (N-01) |
| Réservations confirmées hors ligne | Pas de double réservation : confirmation en transaction avec verrou, et seul le serveur décide de la disponibilité | Une réservation hors ligne ne peut être que **provisoire** tant que le serveur ne l'a pas acceptée (N-02). Le document admet lui-même cette limite (§ 7) |
| Numérotation locale `LOC-01-…` | Numéros REC et FAC séquentiels attribués par le serveur (`DocumentNumberer`), dans la transaction | Numéro provisoire hors ligne, numéro définitif à la synchronisation (N-03) |
| Statuts `draft`, `local_pending`, `conflict`… | Statuts métier figés : en attente, confirmée, en cours, terminée, annulée | Ajouter un **état de synchronisation séparé**, sans toucher aux statuts métier |
| Session hors ligne avec permissions en cache | Le serveur est seul juge des droits (Sanctum par cookie, `/auth/me`) | Durée et droits hors ligne à fixer (N-05) |
| Calcul local du prix, des remises et du solde | Calcul côté serveur (`ReservationQuoter`, plafond de remise D-016, demi-journée ≤ 12 h) | L'affichage hors ligne reste un **aperçu** ; le serveur recalcule et peut refuser à la synchronisation |
| Taxes sur le ticket | Règles fiscales en Centrafrique non validées (questions ouvertes) | Aucune taxe inventée : la ligne n'apparaît que si l'instantané en contient |
| Caisse « CAISSE-01 » | Aucune notion de poste de caisse | Identifiant de poste à créer au lot 4 (N-04) |

## Décisions à confirmer

| ID | Question | Proposition de l'agent | Conséquence si acceptée |
|---|---|---|---|
| N-01 | ✅ **Décidé (21/11) : ajout** → D-061 | Le ticket 80 mm s'ajoute ; le PDF A4 avec QR reste le document de référence | Rien de supprimé ; deux boutons d'impression |
| N-02 | Quelles opérations sont permises hors ligne ? | Encaissement **en espèces** sur un séjour connu, création de client, demande de réservation **provisoire**. Interdits : confirmation définitive, remise au-delà du plafond, remboursement, annulation, suppression | Pas de double réservation définitive ; conflits possibles sur les réservations provisoires |
| N-03 | Numérotation des tickets émis hors ligne | Numéro provisoire `LOC-<poste>-<séquence>` imprimé, puis numéro REC ou FAC définitif attribué par le serveur et visible à la réimpression | À faire valider par l'hôtel sur le plan fiscal |
| N-04 | ✅ **Décidé (21/11) : option A** → D-062 | Un **poste principal** désigné par l'admin est le seul à enregistrer réservations et encaissements (en ligne et hors ligne) ; les autres appareils consultent et règlent | Aucun conflit possible sur les chambres et l'argent ; transfert du rôle sécurisé et numéroté |
| N-05 | Durée de session hors ligne et verrouillage | 12 h maximum, verrouillage après 15 min d'inactivité, droits du dernier `/auth/me` | Un droit retiré à distance n'est connu qu'au retour du réseau |
| N-06 | Sauvegarde des opérations non synchronisées | Export chiffré manuel depuis le centre de synchronisation | Procédure à former côté hôtel |
| N-07 | Imprimante : modèle, largeur (80 ou 58 mm), découpe automatique | Largeur 80 mm par défaut, avec une option 58 mm | Impression silencieuse et découpe : hors navigateur, non traitées |

## Plan de travail

### Lot 1 — Ticket thermique 80 mm (en ligne)

L'API fournit déjà le reçu (`GET /payments/{id}`) et la facture avec son instantané figé (`GET /invoices/{id}` : lignes, totaux, paiements, client, chambre). Seul ajout côté serveur : la période du séjour dans le reçu.

- [x] 1.0 Backend : `GET /payments/{id}` renvoie `stay` (arrivée, départ, heures, unité, quantité) via le contrat `ReservationLedger::invoiceData` ; test `CashierTest` vert (12 assertions)

- [x] 1.1 Composant partagé `shared/ui/ThermalTicket.tsx` + `thermalTicket.css` : 80 mm (contenu 72 mm), noir sur blanc, montants alignés à droite sans coupure, libellés renvoyés à la ligne, `formatFcfa`. Lignes en liste (pas de tableau) pour échapper aux styles de tableau du thème
- [x] 1.2 Impression dédiée : format injecté pendant l’affichage du ticket, **largeur du rouleau × hauteur mesurée du ticket** (une seule bande continue, `@page :first` prioritaire sur l’A4), retiré en quittant la page ; seul le ticket est imprimé ; choix 80 / 58 mm mémorisé dans le navigateur. *Note : `size: 80mm auto` de la spec est invalide en CSS, d’où la hauteur mesurée*
- [x] 1.3 Ticket d’un reçu : `/documents/recus/:id/ticket` (n°, date, caissière, client, chambre, arrivée, départ, durée, versement, mode, remboursements, situation du séjour, reste dû, statut). Jamais « Payé » tant qu’un reste dû subsiste, mention « Annulé » et motif
- [x] 1.4 Ticket d’une facture ou d’un avoir : `/documents/factures/:id/ticket`, **uniquement** depuis l’instantané (lignes, remise et motif, net, versements à l’émission, déjà réglé, reste dû, modes). Avoir : facture annulée et motif, sans versements. Facture créditée : « Annulée par avoir ». Aucune ligne de taxe
- [x] 1.5 Boutons « Ticket » : page du reçu A4 (« Ticket 80 mm »), actions de chaque paiement (caisse, réservation, liste des reçus), liste des factures et fiche réservation
- [x] 1.6 Tests Vitest : 8 nouveaux (montants, période, solde 20 000 / 50 000, statut « payé » refusé si solde, annulé et remboursement, avoir, facture créditée, montants pris dans l’instantané et non dans la liste, aucune taxe, format de page 80/58 mm retiré en quittant, bouton depuis le reçu A4)
- [x] 1.7 Contrôle navigateur : scénario `e2e/thermal-ticket.spec.ts` (base isolée `jb_hotel_e2e`) : réservation avec avance, facture, ticket du reçu en 80 puis 58 mm et ticket de la facture ; impression émulée → **PDF d’une seule page** à 80,1 et 57,8 mm de large ; aucun élément hors du ticket, aucun montant coupé, aucun libellé coupé en plein mot. Inspection visuelle des PDF : défaut « Clie / nt » trouvé et corrigé, gras passé en Arial Bold. Bande mesurée = hauteur du ticket + 6 mm de coupe (capture à la taille exacte de la page)
- [x] 1.8 Contrôles qualité : `typecheck`, `lint`, `format:check` verts ; **118 tests frontend** verts (109 → 118) ; `CashierTest` 11 tests verts ; `check:dev` vert ; **suite navigateur complète 9/9 verte** (les 8 scénarios existants + le ticket)
- [!] 1.9 Essai sur l'imprimante thermique réelle de l'hôtel (accents, marges, coupe)

### Lot 2 — PWA en lecture hors ligne (sans écriture)

- [ ] 2.1 Manifeste et service worker : cache versionné de l'application, compatible avec le déploiement en sous-dossier en cours (LWS)
- [ ] 2.2 Indicateur permanent « En ligne / Hors ligne », vérifié par `GET /health` (le signal `online` du navigateur ne suffit pas)
- [ ] 2.3 Copie locale IndexedDB des données consultées (chambres, réservations, clients, reçus, factures) avec la date de dernière mise à jour
- [ ] 2.4 Réimpression hors ligne d'un ticket déjà chargé, sans nouvelle transaction
- [ ] 2.5 Messages en français : action d'écriture bloquée hors ligne, avec la raison
- [ ] 2.6 Tests : cache, bascule hors ligne, données périmées signalées

### Lot 3 — Clés d'idempotence côté serveur (utile même en ligne)

- [ ] 3.1 En-tête `Idempotency-Key` accepté sur l'encaissement, la création de client et la création de réservation ; table dédiée et contrainte unique
- [ ] 3.2 Requête répétée = même réponse, jamais de double encaissement (double clic, réseau instable)
- [ ] 3.3 Tests backend, y compris en concurrence

### Lot 4 — Écritures hors ligne et synchronisation (après N-02 à N-06)

- [ ] 4.0 Écran admin « Postes de caisse » : enregistrement des navigateurs, désignation du **poste principal unique** (D-062), transfert sécurisé et numéroté ; écritures réservations et encaissements refusées par le serveur depuis un autre poste
  - *Changement planifié :* synchroniser l’ancien poste jusqu’à 0 opération en attente, puis l’admin désigne le nouveau ; l’ancien passe en consultation seule et le nouveau télécharge tout avant d’écrire
  - *Changement forcé (panne, vol) :* avertissement (dernier contact, opérations en attente connues), journal d’audit ; les envois tardifs de l’ancien poste sont refusés mais gardés dans « À examiner », jamais appliqués ni effacés en silence
  - *Retour à l’ancien PC :* même procédure, dans l’autre sens
- [ ] 4.1 Postes déclarés (`devices`), journal `sync_events`, accusés `sync_receipts`, `sync_conflicts`
- [ ] 4.2 `POST /api/v1/sync/push` : résultat par événement (`accepted`, `already_processed`, `conflict`, `rejected`) avec motif en français
- [ ] 4.3 `GET /api/v1/sync/pull?cursor=` : curseur serveur monotone, pagination, suppressions
- [ ] 4.4 File d'envoi locale (Dexie) écrite dans la même transaction que la donnée ; reprise avec délai croissant
- [ ] 4.5 Numéros provisoires (N-03), puis numéro définitif à la réimpression
- [ ] 4.6 Centre de synchronisation : opérations en attente, erreurs, conflits, « Réessayer », export de sauvegarde
- [ ] 4.7 Session hors ligne limitée et verrouillage (N-05)
- [ ] 4.8 Tableau de bord : indicateurs marqués « consolidés serveur » ou « locaux, non synchronisés »

### Lot 4A — Module admin « Mode hors ligne » (demande de l’utilisateur, 21/11)

Un menu **Administration → Mode hors ligne**, réservé à l’administrateur (nouvelle permission `offline.manage`), et un encart sur le tableau de bord.

- [ ] 4A.1 **Encart du tableau de bord** : état du poste principal (en ligne, ou hors ligne depuis…), dernière synchronisation, opérations en attente déclarées, conflits à traiter ; lien vers le module
- [ ] 4A.2 **Vue d’ensemble** : signal du poste principal toutes les 30 s, alerte si le poste se tait plus de X minutes, chiffres du jour (opérations reçues, rejetées, en conflit)
- [ ] 4A.3 **Postes de caisse** (D-062) : appareils enregistrés (nom, navigateur, dernière connexion, dernier utilisateur), renommer, révoquer, désigner le poste principal ; transfert planifié ou forcé, avec avertissement ; historique des attributions numérotées
- [ ] 4A.4 **Centre de synchronisation** (avec le lot 4) : opérations acceptées, doublons, rejetées et en conflit, avec le motif en français ; liste « À examiner » pour les envois d’un ancien poste ; actions valider, ressaisir ou rejeter avec motif, inscrites au journal d’audit
- [ ] 4A.5 **Règles hors ligne** (groupe « Hors ligne » de la page Paramètres) : opérations permises sans Internet (N-02), durée maximale de session et verrouillage (N-05), préfixe des numéros provisoires (N-03), délai d’alerte du poste muet. Valeurs provisoires étiquetées comme telles
- [ ] 4A.6 **Sauvegardes** (N-06) : date de la dernière sauvegarde du poste principal, export manuel des opérations non synchronisées, procédure de restauration
- [ ] 4A.7 **Guide « Comment gérer »** intégré : coupure d’Internet, retour du réseau, changement de poste planifié, panne ou vol du poste, conflit de chambre, restauration ; une fiche pour la caissière et une pour l’administrateur
- [ ] 4A.8 Tests : droits (caissière refusée), transfert forcé refusant l’ancien poste, alerte du poste muet, textes du guide
### Lot 5 — Recette

- [ ] 5.1 Scénarios des deux spécifications : coupure, reconnexion, envoi répété, échec serveur, conflit de chambre, prix historique, paiement partiel, imprimante absente, papier de 58 mm, effacement du navigateur
- [!] 5.2 Essais sur le poste et l'imprimante de l'hôtel

## Points d'attention relevés au lancement

- `backend/.env copy.example` contient **les vrais secrets locaux** (clé d'application, mot de passe SMTP). Son nom finit par `.example`, donc git **ne l'ignore pas** : il ne faut pas le committer. Le renommer (par exemple `.env.backup.local`) ou le supprimer
- Des modifications de déploiement (LWS, cPanel, sous-dossier) ne sont pas commitées ; l'agent n'y a pas touché

## Journal

- **21/11/2026** — Lecture de `new/`. Projet relancé en local (API 8001, frontend 5173), sans modifier les fichiers de production. Plan en 6 lots et 7 décisions à confirmer. Compte admin de démo local réactivé avec un nouveau mot de passe.
- **21/11/2026** — Décisions de l'utilisateur : N-01 = ajout (D-061), N-04 = option A, poste principal unique (D-062). Lot 1 lancé.
- **21/11/2026** — Lot 1 : composant ticket, pages reçu et facture/avoir, boutons, 8 tests. Configuration remise en local sur demande ; production sauvegardée dans les fichiers `.env.production.backup`.
- **21/11/2026** — Demande de l’utilisateur : module admin « Mode hors ligne » ajouté au plan (lot 4A).
- **21/11/2026** — Lot 1 : scénario navigateur du ticket vert (PDF une page, 80 et 58 mm) ; libellé coupé et graisse corrigés après inspection visuelle.
