# Rapport de travail — JB Hôtel

**Date :** 19/11/2026.

**Où en est le projet :**
- ✅ **Le backend (API) est complet pour les phases 0 à 5** : comptes, chambres, tarifs, clients, réservations, caisse, factures, QR code, e-mails.
- ✅ **Les premiers écrans sont faits (phase 6A)**, avec le design du dossier `JB_Hotel_Prototype`, amélioré et branché sur la vraie API.
- ⏭️ Ensuite : les écrans **Caisse** et **Factures et reçus** (6B), puis l'**administration** (6C).

Le suivi détaillé, case par case, est dans [CHECK_LEVEL.md](CHECK_LEVEL.md).

---

## 1. Ce que tu peux voir maintenant

Ouvre **http://localhost:5173** et connecte-toi avec un compte de démonstration : `admin@jbhotel.local` ou `caissiere@jbhotel.local`. Le mot de passe est celui affiché lors du `php artisan migrate:fresh --seed` ; je te l'ai aussi redonné dans la conversation.

| Écran | Ce qu'il fait |
|---|---|
| **Connexion** | Photo de l'hôtel, comme dans le prototype. Mot de passe affichable. Après connexion, tu retrouves la page que tu voulais ouvrir. |
| **Vue d'ensemble** | Encaissé aujourd'hui, facturé ce mois, soldes à recevoir, chambres occupées. Graphique des encaissements sur 7 jours, occupation des chambres, arrivées et départs du jour, dernières réservations. |
| **Réservations** | Liste filtrable (statut, chambre, dates) et paginée. |
| **Fiche réservation** | Confirmer, enregistrer l'arrivée ou le départ, **prolonger** (le supplément s'affiche d'abord, puis tu valides), modifier les occupants, annuler avec un motif, **encaisser**, **émettre la facture**, ouvrir le PDF et la page de vérification. On y voit aussi le récapitulatif de caisse (avance, solde) et l'historique complet. |
| **Nouvelle réservation** | Client existant ou nouveau, occupants, dates et heures, **seules les chambres réellement libres** sont proposées, prix calculé par le serveur en direct, remise, puis paiement **différé, intégral ou avance**. |
| **Disponibilités** | Planning de chaque chambre sur 7 ou 14 jours : libre, réservée, occupée, maintenance. |
| **Clients** | Recherche, fiche, séjours du client, création et modification (avec la préférence e-mail). |
| **État du système** | Réservé à l'administrateur. |

**Ce qui change selon le rôle :** le menu et les boutons suivent les **droits renvoyés par le serveur**. La caissière ne voit pas l'administration ; un bouton masqué reste de toute façon refusé par le serveur. Les entrées **Caisse**, **Factures et reçus**, **Rapports**, **Chambres**, **Tarifs** et **Utilisateurs** sont déjà dans le menu ; elles affichent « Bientôt disponible » jusqu'aux étapes 6B et 6C.

**Améliorations par rapport au prototype :**
- toutes les données sont réelles (aucune donnée d'exemple) et les liens utilisent des UUID ;
- les erreurs s'affichent dans une fenêtre en français, utilisable au clavier, et ce que tu as saisi est conservé ;
- quand ta session expire, un message l'explique et tu reviens à la connexion ;
- une confirmation brève s'affiche après chaque opération (par exemple « Encaissement enregistré — reçu REC-2026-000042 ») ;
- le bouton « Enregistrer l'arrivée » n'apparaît qu'à partir de la date d'arrivée prévue ;
- les écrans s'adaptent à la tablette, avec un menu repliable.

## 2. Ce qui a été vérifié

- **Tests :** backend **164/164**, frontend **47/47**. Larastan (niveau 6), Pint, oxlint, Prettier, TypeScript et le build de production ne signalent aucune erreur.
- **Les 47 tests du frontend couvrent notamment :**
  - la connexion et le retour à la page demandée ;
  - le menu filtré selon le rôle et l'accès refusé ;
  - la session expirée ;
  - les actions de la fiche réservation selon le statut et les droits ;
  - l'encaissement, avec le trop-perçu refusé avant tout envoi ;
  - la prolongation en deux temps ;
  - la nouvelle réservation : client, puis réservation, puis avance, dans cet ordre ;
  - la fiche client et ses erreurs.
- **En conditions réelles :** j'ai rejoué contre le serveur les **32 appels** que font les écrans, avec une vraie session. Toutes les réponses correspondent à ce qu'attendent les écrans. Exemples de résultats :
  - 10 % de remise sur 60 000 donnent 54 000 ;
  - après une avance de 20 000, il reste 34 000 à payer ;
  - un trop-perçu est refusé ;
  - une arrivée anticipée est refusée avec un message clair ;
  - le PDF de la facture s'ouvre.
- **Bugs trouvés et corrigés grâce aux tests :**
  - après connexion, l'application ouvrait parfois l'accueil au lieu de la page demandée ;
  - si la chambre était prise au moment de valider une réservation pour un nouveau client, une nouvelle tentative aurait créé le client en double ;
  - une chambre choisie restait sélectionnée après un changement de dates, même si elle n'était plus libre ;
  - les aides et les erreurs des champs étaient lues comme une partie du nom du champ par les lecteurs d'écran.

**Je ne peux pas regarder l'écran moi-même :** je n'ai pas de navigateur dans cette session. Merci de faire un tour sur http://localhost:5173 et de me dire ce qui ne te plaît pas (couleurs, textes, disposition).

## 3. Comment lancer

```bash
# Terminal 1 : API          (déjà lancé)
cd backend && php artisan serve          # http://localhost:8000
# Terminal 2 : frontend     (déjà lancé)
cd frontend && npm run dev               # http://localhost:5173
# Terminal 3 : envoi des e-mails
cd backend && php artisan queue:work     # en local, les e-mails sont écrits dans backend/storage/logs/laravel.log
# Tests
cd backend && php artisan test           # 164 tests, environ 100 s
cd frontend && npm test                  # 47 tests, environ 10 s
```

## 4. Questions à poser à l'hôtel (bloquantes pour la mise en production)

| # | Question | Ce que fait l'application aujourd'hui |
|---|---|---|
| Q-01 | Que couvre exactement une « journée » ? | La caissière choisit la quantité. |
| Q-02 / Q-03 | Quelle période bloquer quand aucune heure n'est saisie ? | Toute la journée (l'écran le signale). |
| Q-07 | Une réservation non payée peut-elle être confirmée ? Une réservation en attente expire-t-elle ? | Oui ; pas d'expiration. |
| Q-08 | Qui peut rembourser ? | L'administrateur seulement. |
| Q-09 | Quelles sont les obligations de facturation en RCA (NIF, RCCM, TVA) ? | En-tête « JB Hôtel », sans taxe. Les champs `HOTEL_*` sont prêts. |
| Q-21 | Le prix appliqué est celui **du jour de la confirmation**. Est-ce bien voulu ? | Oui (document 02). |
| Q-22 | Quel serveur SMTP et quelle adresse d'expédition pour les e-mails ? | En local, les e-mails sont écrits dans le journal. |
| — | La charte (vert `#047857`, or) est-elle validée par l'hôtel ? | Celle du prototype est appliquée. |

La liste complète est dans [docs/QUESTIONS.md](docs/QUESTIONS.md), et les décisions provisoires (D-001 à D-040) dans [docs/DECISIONS.md](docs/DECISIONS.md).

## 5. Ce qui reste à faire

1. **Phase 6B :** écran **Caisse**, avec les mouvements du jour, les soldes, les remboursements et les annulations par l'administrateur. Écran **Factures et reçus**, avec la liste, le PDF, les avoirs et le lien de vérification. Il faut aussi ajouter côté serveur la liste globale des paiements et des factures.
2. **Phase 6C : administration**, avec les chambres et leur maintenance, les tarifs (grille, historique, publication), les utilisateurs et leurs droits, les paramètres et le journal d'audit.
3. **Modifier une réservation** (changer de chambre ou de dates), en plus de la prolongation qui existe déjà.
4. **Phase 7 :** rapports : encaissé, facturé, impayés, remises et remboursements, avec exports CSV et PDF.
5. **Phase 8 :** recette complète, sécurité, sauvegardes et déploiement.
6. **Points mineurs :**
   - redessiner le MCD (`docs/SCHEMA.md` fait foi en attendant) ;
   - tester le Docker Compose (Docker absent du poste) ;
   - prévoir des périodes de maintenance planifiées (Q-12).
