# Rapport de travail — JB Hôtel

**Date :** 19/11/2026.

**Où en est le projet :**
- ✅ **Le backend (API) est complet pour les phases 0 à 5** : comptes, chambres, tarifs, clients, réservations, caisse, factures, QR code, e-mails.
- ⏭️ La **phase 6 (écrans)** vient ensuite.
- Tout est sur GitHub (`main`), avec une CI verte à chaque envoi.

Le suivi détaillé, case par case, est dans [CHECK_LEVEL.md](CHECK_LEVEL.md).

> ⚠️ **Pourquoi tu ne « vois » pas encore l'application dans le navigateur.** Les écrans (connexion, réservation, caisse, factures…) correspondent à la **phase 6**, la prochaine. Aujourd'hui, http://localhost:5173 n'affiche que la page « État du système ». Tout le métier fonctionne déjà, mais seulement à travers l'API. Je peux attaquer les écrans dès maintenant si tu veux.

---

## 1. Résumé

| Domaine | État |
|---|---|
| Comptes, rôles, droits (administrateur et caissière) | ✅ |
| Chambres, types, maintenance, tarifs versionnés | ✅ |
| Clients, réservations, disponibilités, occupation | ✅, double réservation impossible (test avec deux processus concurrents) |
| Caisse : avances, versements, reçus, solde, remboursements | ✅ |
| Factures figées, avoirs, PDF A4 | ✅ |
| **QR code** sur chaque facture et vérification publique | ✅ (demande du 19/11) |
| **E-mails au client** à chaque opération sur son séjour | ✅ (demande du 19/11) |
| Écrans du frontend | ⏭️ phase 6 |
| Rapports, exports, recette finale | phases 7 et 8 |

**Tests :** backend **161/161**, frontend 29/29. Larastan (niveau 6), Pint et Prettier ne signalent aucune erreur. Chaque fonctionnalité a aussi été vérifiée **en conditions réelles** sur le serveur.

## 2. Ce qui a été fait depuis le dernier rapport

| Commit | Contenu | CI |
|---|---|---|
| `2a7c32e` | Phase 5A : caisse (encaissements, reçus `REC-2026-000001`, solde, trop-perçu refusé, remboursements) | ✅ |
| `f520504` | Phases 5B et 5C : factures figées `FAC-…`, avoirs `AV-…`, PDF A4, **QR code** et vérification publique | ✅ |
| *(ce commit)* | Phase 5D : **e-mails au client** ; rapport et suivi | voir CHECK_LEVEL |

### Ports libérés (ta demande)

Un ancien projet (`saass_v2`) occupait aussi le port 5173, sur l'adresse IPv6 `::1`. C'est pour cela que `localhost:5173` t'affichait l'ancien projet. J'ai arrêté :
- le frontend et le backend de `saass_v2` (ports 5173 et 8010) ;
- un serveur `reverb` (port 8080) ;
- Apache de XAMPP (ports 80 et 443).

J'ai gardé MariaDB (3306), indispensable à JB Hôtel. Il reste ouvert :
- http://localhost:5173 : frontend JB Hôtel ;
- http://localhost:8000 : API JB Hôtel.

### QR code sur la facture

- Chaque facture et chaque avoir porte un **QR code**. En le scannant avec un téléphone, on ouvre une **page publique**, sans connexion : « ✓ Document authentique », avec le numéro, la date, le montant net, le statut et les **initiales** du client.
- Le lien contient un **code secret propre à chaque facture** : impossible de deviner une autre facture ou de valider une fausse.
- Une facture inconnue et un code faux reçoivent la même réponse, « Document introuvable ». Le nombre de consultations est limité, et les pages ne sont pas indexées par les moteurs de recherche.
- Une facture annulée par avoir est signalée comme telle.

### E-mails au client

Si le client a donné son e-mail, il reçoit un message en français à chaque opération :
- confirmation et **bienvenue** ;
- arrivée, prolongation, annulation, départ ;
- **reçu de chaque paiement** (avec le reste à régler) et remboursement ;
- **facture en PDF joint**, avec le QR code ;
- avoir.

L'envoi se fait en file d'attente, après la validation de l'opération : un e-mail en échec ne bloque jamais la caisse. Chaque e-mail contient un **lien de désinscription**, et la préférence est aussi modifiable sur la fiche client.

## 3. Comment tester

```bash
# Terminal 1 : API          (déjà lancé)
cd backend && php artisan serve          # http://localhost:8000
# Terminal 2 : frontend     (déjà lancé)
cd frontend && npm run dev               # http://localhost:5173
# Terminal 3 : envoi des e-mails
cd backend && php artisan queue:work     # en local, les e-mails sont écrits dans backend/storage/logs/laravel.log
# Tests
cd backend && php artisan test           # 161 tests, environ 70 s
```

**Comptes de démonstration**, en local uniquement :
- `admin@jbhotel.local`
- `caissiere@jbhotel.local`

**Mot de passe :** `u0pubS5hPMDQnoEj`.

Les routes de l'API sont listées dans le [README](README.md).

**Exemple de facture PDF**, générée sur le serveur avec des données fictives :
`C:\Users\ACRED_IT\AppData\Local\Temp\claude\20485a309cac0ff2\b7e0052e-6ada-40bb-a638-99028a400df1\scratchpad\facture-exemple.pdf`

## 4. Questions à poser à l'hôtel (bloquantes pour la mise en production)

| # | Question | Ce que fait l'application aujourd'hui |
|---|---|---|
| Q-01 | Que couvre exactement une « journée » ? | La caissière choisit la quantité. |
| Q-02 / Q-03 | Quelle période bloquer quand aucune heure n'est saisie ? | Toute la journée. |
| Q-07 | Une réservation non payée peut-elle être confirmée ? Une réservation en attente expire-t-elle ? | Oui ; pas d'expiration. |
| Q-08 | Qui peut rembourser ? | L'administrateur seulement. |
| Q-09 | Quelles sont les obligations de facturation en RCA (NIF, RCCM, TVA) ? | En-tête « JB Hôtel », sans taxe. Les champs `HOTEL_*` sont prêts. |
| Q-21 | Le prix appliqué est celui **du jour de la confirmation**. Est-ce bien voulu ? | Oui (document 02). |
| **Q-22** *(nouvelle)* | Quel serveur SMTP et quelle adresse d'expédition pour les e-mails ? | En local, les e-mails sont écrits dans le journal. |

La liste complète est dans [docs/QUESTIONS.md](docs/QUESTIONS.md), et les décisions provisoires (D-001 à D-039) dans [docs/DECISIONS.md](docs/DECISIONS.md).

## 5. Ce qui reste à faire

1. **Phase 6 : les écrans.**
   - Connexion.
   - Tableau de bord de caisse.
   - Chambres et occupation.
   - Clients.
   - Réservation guidée.
   - Caisse et reçus.
   - Factures (aperçu, PDF).
   - Administration (utilisateurs, tarifs, paramètres).
   - Routes en UUID, en français, accessibles.
2. **Modifier une réservation** (changer de chambre ou de dates), en plus de la prolongation qui existe déjà.
3. **Phase 7 :** tableau de bord de caisse et rapports (encaissé, facturé, impayés, remises, remboursements), exports CSV et PDF.
4. **Phase 8 :** recette complète, sécurité, sauvegardes, déploiement.
5. **Points mineurs :**
   - redessiner le MCD (`docs/SCHEMA.md` fait foi en attendant) ;
   - tester le Docker Compose (Docker absent du poste) ;
   - prévoir des périodes de maintenance planifiées (Q-12).
