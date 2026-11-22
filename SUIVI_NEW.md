# SUIVI NEW — Ticket thermique 80 mm et mode hors ligne

> Suivi des évolutions demandées dans le dossier `new/` (21/11/2026). Mis à jour à chaque étape.
> Le suivi général du projet reste dans `CHECK_LEVEL.md`.

**Dernière mise à jour :** 22/11/2026 — lot 4 suite commitée (`24bcb10`). **4.5 terminé** : hors ligne, création de réservation (chambres libres et prix calculés sur le poste), nouveau client, prolongation et annulation ; un élément créé hors ligne (`local-…`) reçoit l’identifiant du serveur à l’envoi, et les opérations qui en dépendent (encaissement sur cette réservation) partent en chaîne. **Recette de production** : coupure, nouveau client, réservation, paiement intégral, retour du réseau, 4 opérations acceptées par le vrai serveur. 183 tests frontend verts. Restent hors ligne : modification de réservation, occupants, confirmation d’une réservation en attente, émission de facture (4.13).

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
| 2 | Consultation hors ligne + menu « Synchronisation et sauvegardes » (sens local) + application installable | N-05 décidé (D-064) | ✅ Fait (suite navigateur en cours) | 95 % |
| 3 | Fiabilité réseau : clés d'idempotence (D-063) | non | ✅ Fait | 100 % |
| 4 | Tout fonctionne hors ligne : file d’attente rejouée, « Mettre à jour en ligne » | décidé : D-062, D-063, D-064 (N-05 révisée le 22/11) | 🟡 Réservation, client, encaissement, arrivée, départ, prolongation, annulation, export chiffré, tableau de bord, téléchargement complet faits ; reste modification, occupants, confirmation, facture hors ligne (4.13) | 90 % |
| 4A | Module admin « Mode hors ligne » (postes, synchronisation, règles, sauvegardes, guide) + encart du tableau de bord | en partie : postes et état possibles dès maintenant (D-062) ; le reste suit le lot 4 | 🟡 Postes de caisse faits (4A.3) ; reste encart, synchronisation, règles, sauvegardes, guide | 25 % |
| T | Tutoriels : un bouton « Tutoriel » par section du menu, fenêtre pas à pas animée, contenu propre à chaque section | non | ✅ Fait | 100 % |
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
| N-02 | ✅ **Décidé (21/11) : tout comme en ligne** → D-064 (revalidation serveur, refus possibles après coup, jamais effacés). Question initiale : quelles opérations sont permises hors ligne ? | Encaissement **en espèces** sur un séjour connu, création de client, demande de réservation **provisoire**. Interdits : confirmation définitive, remise au-delà du plafond, remboursement, annulation, suppression | Pas de double réservation définitive ; conflits possibles sur les réservations provisoires |
| N-03 | ✅ **Décidé (21/11) : provisoire `LOC-…` puis définitif** → D-064 (validation fiscale de l’hôtel attendue). Question initiale : numérotation des tickets émis hors ligne | Numéro provisoire `LOC-<poste>-<séquence>` imprimé, puis numéro REC ou FAC définitif attribué par le serveur et visible à la réimpression | À faire valider par l'hôtel sur le plan fiscal |
| N-04 | ✅ **Décidé (21/11) : option A** → D-062 | Un **poste principal** désigné par l'admin est le seul à enregistrer réservations et encaissements (en ligne et hors ligne) ; les autres appareils consultent et règlent | Aucun conflit possible sur les chambres et l'argent ; transfert du rôle sécurisé et numéroté |
| N-05 | ✅ **Révisée par l’utilisateur (22/11) : aucune durée maximale hors ligne**, verrou après 15 min conservé → D-064 (décision initiale du 21/11 : 12 h). Question initiale : durée de session hors ligne et verrouillage | Sans limite de durée (coupure possible d’un mois), verrouillage après 15 min d’inactivité, droits du dernier `/auth/me` | Un droit retiré ou un compte désactivé à distance n’est connu qu’au retour du réseau ; le serveur refuse alors ses opérations, avec la cause |
| N-06 | ✅ **Décidé (21/11) : export manuel chiffré + rappel après 1 h** → D-064. Question initiale : sauvegarde des opérations non synchronisées | Export chiffré manuel depuis le centre de synchronisation | Procédure à former côté hôtel |
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

### Lot 2 — Consultation hors ligne (sans écriture) et menu « Synchronisation et sauvegardes »

- [x] 2.1 Service worker écrit à la main (sans dépendance) : l’application s’ouvre sans réseau une fois chargée en ligne ; cache versionné ; actif seulement en production ; mise à jour proposée, jamais imposée pendant une saisie
- [x] 2.2 Indicateur permanent « En ligne / Hors ligne » dans la barre du haut, vérifié par `GET /health` (le signal `online` du navigateur ne suffit pas)
- [x] 2.3 Copie locale (IndexedDB) des données consultées, avec la date de dernière mise à jour ; effacée à la déconnexion et après 12 h sans connexion (D-064)
- [x] 2.4 Session hors ligne (D-064) : 12 h au plus, verrouillage après 15 min d’inactivité, mot de passe vérifié localement (empreinte PBKDF2, jamais en clair)
- [x] 2.4b Réimpression hors ligne d’un ticket déjà chargé, sans nouvelle transaction
- [x] 2.5 Messages en français : écriture refusée hors ligne tant que le lot 4 n’est pas livré, avec la raison (jamais d’opération mise en attente en silence)
- [x] 2.5b **Menu « Synchronisation et sauvegardes »** (demandes de l’utilisateur, 21/11) : état de la copie locale (date, volume, nombre d’informations), **historique des 50 dernières synchronisations** (date, sens, origine, résultat réussie/partielle/échec, éléments, durée, auteur, **cause de chaque échec**), dernière copie automatique et son état, contenu détaillé de la copie et bouton **« Mettre à jour en local »** (télécharge chambres, réservations, clients et documents récents pour la consultation hors ligne). Le sens **« Mettre à jour en ligne »** (envoi des opérations faites hors ligne) et l’export chiffré arrivent au lot 4, dans ce même menu
- [x] 2.6 Tests : 13 tests frontend (143 au total) + **recette navigateur sur la version de production** (`npm run test:e2e:offline`) : ouverture hors ligne par le service worker, planning affiché depuis la copie, échec journalisé avec sa cause, verrou après 15 min (mauvais puis bon mot de passe), retour du réseau journalisé, application déclarée installable par le navigateur
- [x] 2.8 **Retours de l’utilisateur (21/11)** : hors ligne, les listes principales (réservations, alertes, clients, factures, journal de caisse du jour) sont téléchargées par « Mettre à jour en local » avec les écrans essentiels ; un écran jamais gardé affiche « Pas encore disponible hors ligne » et la marche à suivre au lieu d’un chargement sans fin ; recette de production étendue et verte. Rappel : sur le PC de développement, le serveur est local (couper Internet ne coupe pas `localhost`) : arrêter `php artisan serve` ou utiliser l’onglet Réseau « Hors connexion » d’Edge pour tester
- [x] 2.7 **Application installable** (question de l’utilisateur, 21/11) : manifeste, icônes 192/512 px et adaptative, bouton « Installer l’application » dans « Synchronisation » ; seule réserve en recette : la navigation privée des tests

### Lot 3 — Clés d'idempotence côté serveur (utile même en ligne)

- [x] 3.1 En-tête `Idempotency-Key` (UUID) accepté sur toutes les écritures de réservation, de caisse, de facturation et la création de client ; table `idempotency_keys`, unique par utilisateur ; clé enregistrée **dans la même transaction** que l’opération ; erreurs jamais mémorisées (nouvel essai possible)
- [x] 3.2 Requête répétée = même réponse (en-tête `Idempotent-Replayed`), jamais de double encaissement ; même clé avec d’autres valeurs = refus en français
- [x] 3.2b Frontend : une clé par dialogue ouvert (encaissement, remboursement, annulation, réservation et ses trois écritures, fiche client), gardée pour les nouvelles tentatives ; repli sans HTTPS ; 4 tests (130/130), dont un nouvel essai après erreur 503 qui réutilise la même clé
- [x] 3.3 Tests backend : 6 tests fonctionnels (rejeu identique, autres valeurs refusées, erreur jamais mémorisée, clé propre à chaque utilisateur, réservation rejouée sans conflit, purge après 30 jours) + **test de concurrence à vrais processus PHP** (deux envois simultanés du même encaissement → un seul enregistré, le second attend le premier puis rejoue sa réponse). 14 routes d’écriture protégées ; purge quotidienne planifiée (`model:prune`, nécessite le cron `schedule:run`)

### Lot 4 — Tout fonctionne hors ligne : file d’attente et « Mettre à jour en ligne » (D-062, D-063, D-064)

Conception retenue (21/11) : pas de protocole à part. Hors ligne, chaque écriture est gardée sur le poste avec sa **clé d’idempotence** (D-063) et le jeton du poste principal (D-062), l’écran montre aussitôt le résultat « en attente d’envoi » ; au retour du réseau, la file est **rejouée dans l’ordre** vers les routes habituelles, que le serveur revalide entièrement. Un envoi répété ne crée jamais de doublon ; un refus est gardé avec sa cause, jamais effacé.

- [x] 4.1 File d’attente (IndexedDB) : opération, clé, auteur, date, état (en attente, envoyée, refusée, abandonnée), tentatives, cause du dernier échec, numéros provisoire et définitif
- [x] 4.2 Moteur d’envoi : au démarrage en ligne, au retour du réseau (avant la mise à jour locale, pour ne rien écraser) et sur le bouton **« Mettre à jour en ligne »** ; ordre de création ; seulement les opérations de l’utilisateur connecté (auteur fidèle) ; refus gardé avec sa cause ; arrêt propre sur coupure, session expirée ou erreur passagère ; passage journalisé (sens « Vers le serveur »)
- [x] 4.3 Numéros provisoires `LOC-<poste>-<séquence>` (N-03) sur le reçu et le ticket (mention « Provisoire »), remplacés par le numéro REC définitif à l’accusé du serveur
- [x] 4.4 Hors ligne : **encaissement** (ligne provisoire, solde recalculé sur le poste, reçu et ticket imprimables, message « gardé sur ce poste »), **arrivée et départ** (fiche marquée « en attente d’envoi ») ; moyens de paiement gardés sur le poste
- [x] 4.5 Hors ligne : **création de réservation** (chambres libres, prix, conflits et règles du serveur recalculés sur le poste à partir des chambres, des tarifs en vigueur et à venir, et des réservations gardés : intervalle D-009, départ dépassé D-056, demi-journée D-007, remise D-008, jours D-055) ; **nouveau client** et recherche dans les clients gardés ; **prolongation** (prix unitaire et remise conservés, seule la période ajoutée est vérifiée) ; **annulation** (plus rien n’est dû, remboursement et avoir faits par le serveur à l’envoi). Chambre déjà prise sur le poste : refus immédiat, rien n’est gardé. Élément créé hors ligne : identifiant `local-…`, remplacé à l’envoi par celui du serveur dans les opérations qui en dépendent ; refus en chaîne avec sa cause si l’élément d’origine est refusé ; la fiche provisoire s’ouvre d’elle-même sur la fiche définitive
- [x] 4.6 Menu « Synchronisation » : panneau **« Mettre à jour en ligne »** (compteurs, liste avec numéros et causes, « Réessayer », « Abandonner » avec motif obligatoire) ; bandeau « N opération(s) en attente d’envoi » ; compteur de la vue d’ensemble
- [x] 4.7 Sauvegarde (N-06) : **export chiffré** (AES-GCM, clé PBKDF2 tirée d’un mot de passe d’au moins 8 caractères) des opérations en attente ou refusées ; **restauration** sur ce poste ou un autre sans doublon (même clé d’idempotence) ; **rappel** dans le bandeau, le tableau de bord et la page quand une opération attend depuis plus d’une heure sans figurer dans une sauvegarde ; procédure de restauration intégrée
- [x] 4.8 Tableau de bord : encart **« Opérations faites hors ligne »** (en attente, refusées avec leur cause, montant encaissé hors ligne pas encore compté dans les indicateurs, rappel de sauvegarde, lien vers Synchronisation) ; absent quand tout est envoyé
- [x] 4.10 **« Tout télécharger pour le hors ligne »** (demande de l’utilisateur, 22/11) : un clic garde sur le poste toutes les pages et leurs fiches (réservations en cours, à venir et terminées depuis 30 jours avec leur historique ; encaissements et reçus ; factures et avoirs ; tout le fichier clients), sans les parcourir une à une ; rythme limité à 90 requêtes par minute (le serveur en accepte 120), reprise après un 429, barre de progression, passage journalisé « Téléchargement complet »
- [x] 4.11 Page Synchronisation **visuelle** (demande de l’utilisateur, 22/11) : quatre repères à icônes (serveur, disque du poste, opérations à envoyer, dernière sauvegarde), camemberts **« Sur ce poste et en ligne »** (part disponible hors ligne et jauge par famille : réservations, clients, encaissements, factures ; dernier relevé du serveur gardé hors ligne), **stockage** (copie, opérations, historique, application), **opérations** et **synchronisations** ; contenu de la copie en barres classées. Couleurs vérifiées pour les daltoniens, jamais seules (icône, libellé, valeur)
- [x] 4.12 **Stockage protégé** : le poste demande au navigateur un stockage persistant (plus d’effacement automatique quand le disque se remplit) et l’affiche (« Protégé » ou « Non protégé », bouton « Protéger ») ; chaque écriture est confirmée sur le disque (durabilité stricte) ; **défaut corrigé** : une donnée sans écran ouvert quittait la mémoire au bout de 5 min puis la copie du poste
- [ ] 4.13 Hors ligne, reste : modification d’une réservation (D-058), occupants, confirmation d’une réservation en attente, émission de facture (numéro FAC provisoire à décider, comme N-03 pour les reçus). Aujourd’hui, ces actions sont masquées sur une réservation créée hors ligne et échouent avec « Connexion impossible » sur les autres
- [x] 4.9 Tests : file et moteur (rejeu avec la clé, numéro définitif, auteur fidèle, refus gardé, arrêt sur coupure, **envoi cadencé avec reprise après un 429**), sauvegarde chiffrée (5 tests : contenu illisible, mot de passe faux, fichier modifié ou étranger, restauration sans doublon, rappel d’une heure), téléchargement complet (étapes, fiches prises dans les listes, reprise après 429, rythme limité), comparaison poste / serveur, écrans (tableau de bord, page Synchronisation, export, restauration), durée illimitée (copie gardée après un mois, session sans limite) ; **recette de production** de l’encaissement hors ligne. **4.5** : moteur local (8 tests : heure de Bangui, arrondi des remises, tarif suivant à sa date, conflits et départ dépassé, chambres libres, devis, refus capacité / demi-journée / tarifs absents, prolongation), dépendances (encaissement envoyé avec l’identifiant du serveur, refus en chaîne, mise en file même en ligne), écran complet (réservation hors ligne puis bascule sur la fiche du serveur), prolongation et annulation hors ligne, chambre déjà prise refusée ; **recette de production** de la chaîne client → réservation → encaissement

### Lot 4A — Module admin « Mode hors ligne » (demande de l’utilisateur, 21/11)

Un menu **Administration → Mode hors ligne**, réservé à l’administrateur (nouvelle permission `offline.manage`), et un encart sur le tableau de bord.

- [ ] 4A.1 **Encart du tableau de bord** : état du poste principal (en ligne, ou hors ligne depuis…), dernière synchronisation, opérations en attente déclarées, conflits à traiter ; lien vers le module
- [ ] 4A.2 **Vue d’ensemble** : signal du poste principal toutes les 30 s, alerte si le poste se tait plus de X minutes, chiffres du jour (opérations reçues, rejetées, en conflit)
- [x] 4A.3 **Postes de caisse** (D-062) : appareils enregistrés (nom, navigateur, dernière connexion, dernier utilisateur), renommer, révoquer, désigner le poste principal ; transfert planifié ou forcé, avec avertissement ; historique des attributions numérotées
  - [x] 4A.3a Base : tables `workstations` et `workstation_assignments` (numéro d’attribution unique), permission `workstations.manage` (admin seul), paramètres provisoires `workstations.enforce_main_post` (désactivé) et `workstations.silent_after_minutes` (5)
  - [x] 4A.3b API : enregistrement du navigateur (jeton secret, haché en base), signal de présence, liste, renommer, désigner (premier, planifié, forcé avec motif), révoquer, réactiver ; journal d’audit
  - [x] 4A.3c Blocage (D-062) : réservations et encaissements refusés hors du poste principal quand l’admin l’active (403 `workstation_not_main`) ; consultation et devis toujours permis. **6 tests backend verts (102 assertions)**
  - [x] 4A.3d Frontend : enregistrement automatique, en-tête `X-Workstation-Token`, signal toutes les 30 s, page Administration → Postes de caisse, groupe « Postes de caisse » dans Paramètres
  - [x] 4A.3e Tests : 6 tests backend (102 assertions) + `SettingsTest` à jour, **suite backend 243/243** ; 8 tests frontend (**126/126**) ; suite navigateur : 9/10 au premier passage (test visuel hors délai sur poste chargé), puis test visuel relancé **vert avec la nouvelle page ajoutée à la charte** (délai porté à 4 min) et scénario `workstations` vert ; scénario navigateur `workstations` (désignation, règle active, caissière d’un autre appareil refusée en français, saisie conservée, audit Axe) ; Larastan, Pint, lint, format verts. Base de dev migrée
- [ ] 4A.4 **Centre de synchronisation** (avec le lot 4) : opérations acceptées, doublons, rejetées et en conflit, avec le motif en français ; liste « À examiner » pour les envois d’un ancien poste ; actions valider, ressaisir ou rejeter avec motif, inscrites au journal d’audit
- [ ] 4A.5 **Règles hors ligne** (groupe « Hors ligne » de la page Paramètres) : opérations permises sans Internet (N-02), durée maximale de session et verrouillage (N-05), préfixe des numéros provisoires (N-03), délai d’alerte du poste muet. Valeurs provisoires étiquetées comme telles
- [ ] 4A.6 **Sauvegardes** (N-06) : date de la dernière sauvegarde du poste principal, export manuel des opérations non synchronisées, procédure de restauration
- [ ] 4A.7 **Guide « Comment gérer »** intégré : coupure d’Internet, retour du réseau, changement de poste planifié, panne ou vol du poste, conflit de chambre, restauration ; une fiche pour la caissière et une pour l’administrateur
- [ ] 4A.8 Tests : droits (caissière refusée), transfert forcé refusant l’ancien poste, alerte du poste muet, textes du guide
### Lot T — Tutoriels intégrés (demande de l’utilisateur, 21/11)

- [x] T.1 Composant commun : bouton « Tutoriel » dans l’en-tête de chaque page du menu, fenêtre accessible (clavier, focus, Échap) avec étapes numérotées, « Précédent », « Suivant », « Terminer » et indicateur « Étape 2 sur 5 »
- [x] T.2 Contenu propre à chaque section (Vue d’ensemble, Réservations, Alertes, Disponibilités, Clients, Synchronisation, Caisse, Factures et reçus, Rapports, Chambres, Tarifs, Utilisateurs, Postes de caisse, Paramètres, Journal d’audit, État du système), en français, fidèle aux règles réelles (D-xx)
- [x] T.3 Tests : chaque page du menu a son tutoriel, navigation entre étapes (boutons, pastilles, flèches), contenu différent par section, retour du focus (3 tests) ; suite frontend 146/146
- [x] T.4 **Vrai design et animations** (demande de l’utilisateur, 21/11) : bandeau vert et or avec l’icône de la section, barre de progression animée, illustration par étape (apparition, halo), glissement selon le sens de lecture, points clés cochés qui apparaissent en cascade, encadré « Conseil » avec ampoule, pastilles animées ; trois boutons sur une ligne sur mobile ; animations coupées si le système demande de réduire les mouvements. Relu sur captures PC et mobile

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
- **21/11/2026** — 4A.3 Postes de caisse : module `Workstations` (2 tables, droit admin, 2 paramètres provisoires), blocage des écritures hors poste principal quand la règle est active, page d’administration et pastille du poste dans la barre du haut.
- **21/11/2026** — 4A.3 : relecture des captures : navigateur résumé (« Edge · Windows »), auteur sous la date, badge « Actif » quand la règle est inactive. Page « Postes de caisse » ajoutée au contrôle visuel de la charte.
- **21/11/2026** — Lot 3 (D-063) : middleware `idempotent`, table `idempotency_keys`, test de concurrence à vrais processus, clés côté frontend. Base de dev migrée.
- **21/11/2026** — Lot 3 : suite navigateur complète verte (10/10).
- **21/11/2026** — Décisions de l’utilisateur : N-05 = 12 h + verrou 15 min ; N-02 = tout comme en ligne ; N-03 = provisoire puis définitif ; N-06 = export chiffré + rappel (D-064). Lots 2 et 4 débloqués.
- **21/11/2026** — Demande de l’utilisateur : menu de synchronisation dans les deux sens (mise à jour en local et en ligne). Sens local au lot 2, sens en ligne au lot 4, dans le même menu.
- **21/11/2026** — Lot 2 écrit : stockage IndexedDB, état du réseau vérifié, copie locale, session et verrou (D-064), service worker, menu « Synchronisation » avec historique et causes d’échec (demande de l’utilisateur). 130 tests existants toujours verts ; tests du mode hors ligne en cours.
- **21/11/2026** — Demande de l’utilisateur : tutoriel pas à pas sur chaque section du menu (lot T, après le lot 2).
- **21/11/2026** — Lot 2 vérifié : recette hors ligne de production verte. Corrigés en route : copie perdue lors d’un changement de page rapide (enregistrement à la sortie de page + écrans essentiels), état hors ligne non détecté au rechargement, caractère invisible dans un commentaire CSS du ticket.
- **21/11/2026** — Retours de l’utilisateur : données hors ligne (listes principales ajoutées, message clair), demande d’un usage hors ligne complet (lot 4, suivant). Lot T : tutoriels animés sur les 16 sections du menu.
- **22/11/2026** — Lot 4, première étape : file d’attente, « Mettre à jour en ligne », encaissement, arrivée et départ hors ligne. Corrigé en route : en ligne, une donnée restaurée de la copie est toujours rechargée à l’affichage ; une opération hors ligne enregistre la copie aussitôt.
- **22/11/2026** — N-05 révisée par l’utilisateur : aucune durée maximale hors ligne (l’hôtel peut rester un mois sans Internet). Ajouts : export chiffré et restauration, signal au tableau de bord, page Synchronisation visuelle, « Tout télécharger pour le hors ligne », comparaison poste / serveur, stockage protégé, envoi cadencé. Défaut corrigé : copie amputée des données non affichées depuis 5 min.
- **22/11/2026** — 4.5 terminé : réservation, nouveau client, prolongation et annulation hors ligne, calculés sur le poste avec les règles du serveur ; éléments `local-…` remplacés à l’envoi ; recette de production verte avec le vrai serveur. Incidents du jour : MariaDB (XAMPP) arrêtée deux fois pendant les recettes, relancée ; la page Synchronisation reprend la vue d’ensemble commune.
