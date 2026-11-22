# Recette du mode hors ligne et du ticket 80 mm (lot 5)

**Pour :** la direction de l’hôtel, la caissière principale et l’administrateur qui valident l’application avant sa mise en service.
**État au 22/11/2026 :** tous les scénarios des deux spécifications (`new/`) sont prouvés par des essais automatiques, sauf ce qui demande le matériel de l’hôtel (imprimante, poste réel) : la fiche de la partie 3 sert à ces essais sur place.

Légende : ✅ prouvé par un essai automatique · 🏨 à vérifier à l’hôtel · ⚖️ décision ou validation de l’hôtel attendue.

## 1. Essais automatiques, refaits à chaque livraison

| Commande (dossier) | Ce qu’elle vérifie | Résultat au 22/11/2026 |
|---|---|---|
| `php artisan test` (`backend`) | Règles du serveur : prix, disponibilité, caisse, factures, idempotence, journal hors ligne, tarif hors ligne (N-09) | ✅ 255 essais |
| `npm test` (`frontend`) | Écrans, calculs du poste, file d’attente, sauvegarde chiffrée, règles hors ligne | ✅ 194 essais |
| `npm run test:e2e` (`frontend`) | 10 parcours réels dans le navigateur, dont le ticket 80 et 58 mm | ✅ 10/10 |
| `npm run test:e2e:offline` (`frontend`) | Version de production coupée du réseau : parcours complet et conflit entre deux postes | ✅ 2/2 |

Pour essayer soi-même sur ce PC : `npm run hors-ligne` (dossier `frontend`), puis http://localhost:4173 ; couper le réseau avec F12 → Réseau → « Hors connexion ».

## 2. Scénarios des spécifications

### 2.1 Architecture hors ligne (`new/JB_Hotel_Architecture_Offline_First`, § 12)

| Scénario | Preuve | Résultat |
|---|---|---|
| Couper Internet, créer un client, une réservation, un paiement espèces, imprimer un ticket ; fermer et rouvrir | Recette de production `e2e-offline/offline.spec.ts` : nouveau client, réservation, paiement intégral, application rouverte sans réseau, ticket « Provisoire » imprimable | ✅ |
| Au retour d’Internet, chaque opération envoyée une seule fois, même si l’envoi se répète | Serveur `IdempotencyTest` (même clé rejouée, y compris par des processus concurrents) ; `OfflineModuleTest` (rejeu noté « doublon évité ») ; recette de production : 5 opérations acceptées, aucune en double | ✅ |
| Coupure pendant l’envoi, puis nouvel essai | `outbox.test.ts` : opération gardée avec la même clé, renvoyée sans doublon | ✅ |
| Réservation concurrente dans le cloud : conflit affiché, rien d’écrasé | Recette de production `e2e-offline/conflict.spec.ts` : deux postes, refus du serveur avec sa cause, client créé gardé, refus examiné par l’administrateur | ✅ |
| Tarif modifié pendant une coupure : la facture historique garde son prix | Serveur `InvoiceTest::test_rate_change_never_alters_an_issued_invoice` ; réservation faite hors ligne au tarif de ce moment (N-09, `OfflineModuleTest`) | ✅ |
| Solde après paiement partiel, réimpression fidèle | `ReceiptTicketPage.test.tsx` (« reste dû », jamais « payé ») ; recette du ticket 80 mm | ✅ |
| Session hors ligne, droits et messages en français | Verrou après inactivité, mot de passe vérifié sur le poste, opération non permise refusée en français (`OfflinePages.test.tsx`, `outbox.test.ts`) ; aucune durée maximale (décision du 22/11/2026) | ✅ |
| Navigateur cible, imprimante 80 mm réelle, stockage, mises à jour, restauration après perte du poste | Restauration : `backup.test.ts` et écran de restauration ; stockage protégé affiché ; le reste sur le matériel de l’hôtel | 🏨 partie 3 |

### 2.2 Ticket thermique 80 mm (`new/JB_Hotel_Facture_Thermique_80mm`, § 12)

| N° | Scénario | Preuve | Résultat |
|---|---|---|---|
| 1 | Hors ligne : client, séjour, encaissement, ticket ; fermer et rouvrir l’application | Recette de production (voir 2.1) | ✅ |
| 2 | Reconnexion : envoi unique, envoi répété sans doublon | Voir 2.1 | ✅ |
| 3 | Échec du serveur : opération gardée, erreur affichée, nouvel essai | `outbox.test.ts` « panne du serveur (500, 503) » : gardée, cause en français, acceptée au passage suivant | ✅ |
| 4 | Conflit de chambre | `e2e-offline/conflict.spec.ts` | ✅ |
| 5 | Prix historique | Voir 2.1 | ✅ |
| 6 | Paiement partiel : solde affiché, jamais « intégralement payé » | `ReceiptTicketPage.test.tsx` | ✅ |
| 7 | Imprimante indisponible : document gardé, réimpression sans nouvel encaissement | `ReceiptTicketPage.test.tsx` « réimprime … sans créer de transaction » ; reçus et factures restent consultables | ✅ (🏨 avec l’imprimante réelle) |
| 8 | Papier 58 mm par erreur | Choix « Largeur du papier » 80/58 mm, mémorisé sur le poste ; recette `thermal-ticket.spec.ts` | ✅ (🏨 rouleau réel) |
| 9 | Aucune donnée bancaire sensible imprimée ni gardée | Aucun champ de carte bancaire ; le champ « Référence » rappelle de n’y mettre ni numéro de carte ni code ; la copie du poste ne contient que des données de gestion | ✅ (voir limite 4.5) |
| 10 | Effacement du navigateur : restauration, limites | Export chiffré et restauration (`backup.test.ts`, écran Synchronisation) ; limite : une opération jamais exportée ni envoyée est perdue | ✅ (🏨 exercice partie 3) |

### 2.3 Critères d’acceptation (§ 13)

| Critère | État |
|---|---|
| Ticket 80 mm lisible sur l’imprimante cible | 🏨 |
| Montants, remises, soldes exacts et traçables | ✅ (taxes : ⚖️ Q-09, Q-16) |
| Tickets imprimables sans Internet après installation | ✅ |
| Documents locaux conservés après redémarrage du navigateur | ✅ (copie et file d’attente dans IndexedDB, stockage protégé demandé au navigateur) |
| Synchronisation sans doublon de paiement | ✅ |
| Conflits signalés sans perte silencieuse | ✅ |
| Réimpression sans transaction supplémentaire | ✅ |
| Mentions fiscales et numérotation validées pour la RCA | ⚖️ (numéros provisoires LOC-… et FAC-LOC-…, N-03 et N-08) |
| Restauration après incident testée | ✅ automatiquement ; 🏨 exercice sur deux postes |

## 3. Fiche de recette à l’hôtel (lot 5.2)

À faire sur le **poste principal réel**, avec **l’imprimante de la caisse**, en présence de la caissière et de l’administrateur. Cocher chaque ligne ; noter tout écart avec une photo.

**Préparation**
- [ ] Ouvrir l’application en ligne (adresse HTTPS de l’hôtel), se connecter, l’**installer** (Synchronisation → Installation).
- [ ] Synchronisation → « Stockage de ce poste » : **Protégé** (sinon « Protéger »).
- [ ] Administration → Postes de caisse : ce poste est le **poste principal**.
- [ ] Synchronisation → **« Tout télécharger pour le hors ligne »** : réussi.

**Impression**
- [ ] Imprimer un reçu puis une facture en ticket **80 mm** : lisible, accents corrects, aucun montant coupé, une seule bande.
- [ ] Mettre un rouleau **58 mm**, choisir « 58 mm », réimprimer : lisible.
- [ ] Éteindre l’imprimante, lancer l’impression, la rallumer et réimprimer : aucun nouvel encaissement créé.
- [ ] Noter le modèle d’imprimante, la découpe automatique (oui/non), le pilote utilisé (N-07).

**Coupure d’Internet** (débrancher la box ou le câble)
- [ ] La pastille passe à « Hors ligne » ; les écrans restent consultables (réservations, planning d’une semaine suivante, caisse, clients, documents).
- [ ] Créer un client, une réservation, encaisser une avance, imprimer le reçu provisoire **LOC-…**, émettre une facture provisoire **FAC-LOC-…** et l’imprimer.
- [ ] Fermer l’application, la rouvrir : tout est toujours là.
- [ ] Exporter une sauvegarde chiffrée sur une clé USB (mot de passe noté à part).

**Retour d’Internet** (rebrancher)
- [ ] Les opérations partent seules ; Synchronisation : toutes « Envoyée », numéros définitifs REC-… et FAC-… affichés.
- [ ] Administration → Mode hors ligne : opérations reçues, aucune « À examiner ».
- [ ] Réimprimer le reçu et la facture définitifs.

**Conflit** (deux postes)
- [ ] Poste A hors ligne réserve la chambre X ; poste B en ligne réserve la même chambre aux mêmes dates ; au retour du réseau, A voit le refus « Chambre indisponible » ; l’administrateur l’examine dans Mode hors ligne.

**Panne ou perte du poste**
- [ ] Sur un second poste : Synchronisation → « Restaurer une sauvegarde » avec la clé USB et le mot de passe ; seules les opérations absentes sont ajoutées ; elles partent avec la session de leur auteur.
- [ ] Administration → Postes de caisse : transfert **forcé** vers ce poste, avec motif.

**Mise à jour de l’application**
- [ ] Après une nouvelle version publiée, rouvrir l’application en ligne : la nouvelle version s’affiche (pages toujours chargées depuis le serveur quand il répond).

## 4. Points ouverts et limites connues

1. **Validation fiscale** (⚖️) : numéros provisoires LOC-… et FAC-LOC-… remis au client pendant une coupure (N-03, N-08), mentions légales et taxes de la RCA (Q-09, Q-16).
2. **Imprimante** (N-07) : modèle, découpe automatique et impression sans fenêtre du navigateur restent à régler sur le matériel ; le navigateur seul ne garantit pas une impression silencieuse.
3. **Plafond de remise** : vérifié par le serveur à l’envoi ; une remise hors plafond faite hors ligne est refusée après coup, avec sa cause.
4. **Journal de caisse et rapports** d’une période jamais ouverte en ligne : non recalculés hors ligne (« pas disponible hors ligne », jamais de chiffres faux).
5. **Données sur le poste** : la copie (clients, réservations) n’est pas chiffrée sur le disque ; elle est protégée par le verrou de l’application et la session Windows du poste. Le fichier de sauvegarde, lui, est chiffré.
6. **Tarif hors ligne** (N-09, décidé le 22/11/2026) : une réservation faite hors ligne garde le tarif en vigueur sur le poste à ce moment-là ; l’heure du poste est bornée (jamais dans le futur, jamais plus de 62 jours en arrière).
