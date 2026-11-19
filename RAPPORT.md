# Rapport de travail — JB Hôtel

**Date :** 19/11/2026, session autonome pendant ton absence.

**Où en est le projet :**
- phases 0 à 4 terminées et envoyées sur GitHub, avec une CI verte ;
- **phase 5A (caisse) terminée et testée, mais seulement en local**.

Le suivi détaillé, case par case, est dans [CHECK_LEVEL.md](CHECK_LEVEL.md).

> ⚠️ **Action requise de ta part : envoyer le dernier travail sur GitHub.**
> Après la phase 4, l'envoi suivant (`git push`) a été **bloqué par le contrôle automatique des permissions** de Claude Code. Je ne l'ai pas contourné.
>
> Ce qui n'est donc pas encore sur GitHub :
> - la phase 5A (caisse) ;
> - ce rapport ;
> - le suivi mis à jour.
>
> Tout est prêt et vérifié en local. Pour l'envoyer, tu peux :
> - soit me le redemander (« commit et push »), et autoriser l'opération si une demande de permission s'affiche ;
> - soit lancer toi-même `git push` depuis le dossier du projet, après le commit local décrit en section 8.

---

## 1. Résumé en 30 secondes

- ✅ **Le backend gère maintenant les réservations de bout en bout** :
  - clients ;
  - devis ;
  - réservation avec prix figé ;
  - remises plafonnées ;
  - arrivée et départ ;
  - annulation ;
  - prolongation avec validation explicite ;
  - disponibilités et occupation des chambres.
- ✅ **Double réservation impossible**, prouvé par un vrai test de concurrence : deux processus PHP réservent la même chambre en même temps, un seul obtient la chambre.
- ✅ **La caisse est en place (phase 5A)** :
  - avances et versements multiples ;
  - un reçu numéroté par versement ;
  - solde calculé ;
  - trop-perçu refusé ;
  - remboursements et annulations tracés, sans jamais rien supprimer.
- ✅ **Tests :** backend 139/139, frontend 29/29. Analyse statique (Larastan niveau 6) et format (Pint, Prettier) sans erreur.
- ⚠️ **À valider avec l'hôtel :** 6 questions bloquantes pour la mise en production (section 5).
- ⏭️ **Prochaine étape :** phase 5B, les factures (figées, numérotées, PDF A4, avoirs).

## 2. Ce qui a été fait pendant ton absence

| Étape | Commit | Contenu |
|---|---|---|
| Envoi de la phase 3 | `3f91816` | Catalogue des chambres, tarifs versionnés, identifiants UUID partout. CI verte. |
| **Phase 4** | `bd175ec` | Clients, réservations, disponibilités, concurrence (détail ci-dessous). CI verte. |
| **Phase 5A** | local, non envoyé | Caisse : encaissements, reçus, solde, remboursements (détail ci-dessous). |

### Phase 5A : la caisse, en détail

- **Encaissements :** paiement intégral, avance ou paiement différé, et plusieurs versements par réservation. Moyens acceptés : espèces, mobile money, carte, virement (liste modifiable).
- **Un reçu par versement**, numéroté sans trou : `REC-2026-000001`, `REC-2026-000002`… Un encaissement refusé ne consomme pas de numéro.
- **Situation de caisse :** montant dû, encaissé, remboursé, encaissé net, **solde**. Statuts : Non payé, Partiellement payé, Soldé, Trop-perçu à rembourser.
- **Trop-perçu refusé :** un versement supérieur au solde est bloqué, avec le message « Solde restant : 30 000 FCFA ».
- **Annulation d'un encaissement** saisi par erreur : motif obligatoire, l'encaissement est conservé avec le statut « Annulé ».
- **Remboursement :** une ligne à part, avec motif, auteur et date. Le paiement initial reste intact.
- **Droits (provisoire) :** la caissière encaisse ; l'annulation et le remboursement sont réservés à l'administrateur.
- **Réservation annulée après un versement :** elle n'exige plus rien, et ce qui a été versé apparaît « à rembourser ».

### Phase 4, en détail

**Clients**
- Fiche détaillée : nom, prénoms, téléphone, e-mail, ville et pays de provenance, adresse, pièce d'identité, notes.
- Recherche par nom, téléphone, e-mail ou numéro de pièce.
- Historique des réservations du client.
- Aucune suppression, et chaque modification est tracée.

**Réservations**
- **Période bloquée :** sans heure saisie, toute la journée est bloquée par prudence (règle provisoire). L'écran signale alors une « période déduite ».
- **Demi-journée :** couvre jusqu'à 12 h incluses. Au-delà, l'opération est **bloquée**, avec la quantité nécessaire et le supplément proposé (exemple : « Supplément proposé : +20 000 FCFA »). Elle n'est **jamais convertie automatiquement en journée**.
- **Prix figé** au tarif en vigueur au moment de la confirmation : unité, quantité, brut, remise, net. Le prix est **par chambre** : 2 occupants paient comme 1, dans la limite de la capacité.
- **Remises :** en pourcentage, arrondies au FCFA, ou en montant fixe. Le motif est obligatoire et l'auteur enregistré. La caissière est plafonnée à **10 %** (valeur provisoire) ; au-delà, seul l'administrateur peut appliquer la remise.
- **Devis** sans enregistrement, pour l'écran de réservation.
- **Cycle de vie :** en attente → confirmée → en cours → terminée, ou annulée.
  - L'arrivée n'est possible qu'à partir du jour prévu.
  - Le départ libère la chambre.
  - L'annulation exige un motif et devient impossible une fois le client arrivé.
- **Prolongation** en deux temps : un aperçu du supplément, puis une confirmation explicite. L'ancien et le nouveau montant sont tracés.
- **Historique** de chaque réservation : qui a fait quoi, et quand.

**Disponibilités et occupation**
- **Disponibilités** sur une période (`/availability`) : libre, réservée, occupée ou en maintenance, avec un filtre « seulement les chambres libres ».
- **Occupation** à un instant (`/occupancy`) : état de chaque chambre, sortie prévue, et « réservée pour plus tard ».

**Critères d'acceptation de la fiche 06 désormais validés par des tests**
- ✅ Deux caissières ne peuvent pas confirmer la même chambre sur des périodes qui se chevauchent.
- ✅ Une chambre en maintenance n'est pas réservable.
- ✅ 2 occupants paient le même tarif qu'un seul.
- ✅ Une réduction de 10 % sur 50 000 donne 45 000, avec l'auteur et le motif.
- ✅ Une caissière sans le droit nécessaire ne peut pas modifier un tarif.
- ✅ Une avance de 20 000 sur 50 000 laisse un solde de 30 000, avec un reçu par versement.
- ✅ Les remboursements diminuent l'encaissé net sans effacer le paiement initial.
- 🟡 Tarif passé de 50 000 à 60 000 : côté réservations, c'est fait (l'ancienne reste à 50 000, la nouvelle passe à 60 000). La partie **facture** viendra en phase 5B.

## 3. Comment vérifier toi-même

```bash
# Terminal 1 : API
cd backend
php artisan migrate --seed        # si la base n'est pas à jour
php artisan serve                 # http://localhost:8000

# Terminal 2 : tests
cd backend && php artisan test    # 139 tests, environ 50 s
cd frontend && npm test           # 29 tests
```

**Comptes de démonstration**, en local uniquement :
- `admin@jbhotel.local`
- `caissiere@jbhotel.local`

**Mot de passe actuel :** `u0pubS5hPMDQnoEj`. Il a été généré aléatoirement au seed et n'est écrit nulle part dans le code. Tu peux en imposer un avec `DEMO_USERS_PASSWORD` dans `backend/.env`.

Les routes de l'API et un exemple de réservation sont dans le [README](README.md#clients-et-réservations-phase-4).

> L'interface graphique (écrans de réservation, de caisse, etc.) correspond à la **phase 6**. Pour l'instant, le frontend affiche seulement l'état du système. Tout se teste par l'API.

## 4. Vérifications effectuées

| Vérification | Résultat |
|---|---|
| Tests backend (PHPUnit, MariaDB locale) | ✅ 139/139 (781 assertions) |
| Caisse sur le serveur | ✅ avance de 20 000 → `REC-2026-000001` et solde de 30 000 → versement de 40 000 refusé (trop-perçu) → solde réglé, « Soldé » → reçu avec client et chambre → remboursement refusé à la caissière (403) |
| Tests frontend (Vitest) | ✅ 29/29 |
| Larastan niveau 6, Pint, oxlint, Prettier, TypeScript, build | ✅ aucune erreur |
| Concurrence réelle (2 processus PHP) | ✅ la seconde caissière attend le verrou de la chambre, puis voit le conflit ; une seule confirmation lors d'une course |
| Parcours réel sur le serveur, avec session et CSRF | ✅ client avec accents → devis à 45 000 → réservation → doublon refusé (409) → disponibilités → arrivée anticipée refusée → annulation → historique → route avec un entier en 404 |
| CI GitHub (MySQL 8.4) | ✅ verte pour chaque phase envoyée (1 à 4) |

## 5. Questions à poser à l'hôtel

Ces points bloquent la **mise en production**. En attendant, l'application applique des valeurs **provisoires et modifiables**, détaillées dans [docs/QUESTIONS.md](docs/QUESTIONS.md).

| # | Question | Ce que fait l'application aujourd'hui |
|---|---|---|
| **Q-01** | Que couvre exactement une « journée » ? | La caissière choisit la quantité, sans contrôle de durée. |
| **Q-02 / Q-03** | Quelle période bloquer quand aucune heure n'est saisie ? | Toute la journée : deux demi-journées sans heure le même jour sont donc en conflit. |
| **Q-07** | Peut-on confirmer une réservation sans paiement ? Une réservation en attente expire-t-elle ? | Oui, confirmation sans paiement ; pas d'expiration. |
| **Q-08** | Qui peut rembourser, et dans quelles conditions ? | L'administrateur seulement (phase 5). |
| **Q-09** | Quelles sont les obligations de facturation en RCA (NIF, RCCM, TVA, avoirs) ? | Format provisoire `FAC-AAAA-NNNNNN`, sans taxe (phase 5). |
| **Q-21** *(nouvelle)* | Le prix appliqué est celui **du jour de la confirmation**, pas celui de la date du séjour. Est-ce bien voulu ? | Oui, conformément au document 02. |

Autres décisions provisoires prises pendant cette session :
- **D-029 :** une réservation en attente bloque la chambre.
- **D-030 :** une prolongation est facturée au prix d'origine de la réservation (Q-18).
- **D-031 :** une date d'arrivée passée est refusée (Q-20).

## 6. Ce qui reste à faire

- **Phase 5B : factures.**
  - Factures figées et numérotées (`FAC-AAAA-NNNNNN`, Q-09), en PDF A4 côté serveur.
  - Avoirs.
  - Critère à valider : « l'ancienne facture reste à 50 000 ».
- **Modification d'une réservation** (changement de chambre ou de dates) : seules la prolongation et la modification des occupants existent pour l'instant.
- **Phase 6 :** tous les écrans (connexion, tableau de bord, réservation guidée, caisse, factures, administration).
- **Phase 7 :** rapports et exports. **Phase 8 :** recette complète et livraison.
- **Points mineurs :**
  - redessiner le MCD (`docs/SCHEMA.md` fait foi en attendant) ;
  - tester le Docker Compose (Docker absent du poste) ;
  - prévoir des périodes de maintenance planifiées si l'hôtel le souhaite (Q-12).

## 7. État de la CI de la phase 4

✅ **Verte** (exécution `44535946930`, commit `bd175ec`). Le backend passe sur **MySQL 8.4**, test de concurrence à deux processus compris, et le frontend passe aussi.

La phase 5A n'a pas encore été vérifiée par la CI, puisqu'elle n'est pas envoyée (voir l'encadré en haut). Elle est verte en local sur MariaDB.

## 8. État git local

Le travail de la phase 5A, le rapport et le suivi sont dans un **commit local** sur `main`, prêt à être envoyé avec `git push`. Si ce commit local a lui aussi été refusé, les fichiers sont simplement modifiés dans le dossier, et `git status` les liste.
