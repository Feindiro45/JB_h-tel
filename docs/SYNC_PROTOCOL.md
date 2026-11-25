# Protocole de synchronisation des postes (version 1)

> D-069, s'appuie sur D-063 (idempotence), D-064 (hors ligne), D-067 (identités d'opération
> conservées), N-09 (prix du moment de la saisie). Valable pour le logiciel Windows **et** la PWA.

## 1. Envoi : poste → serveur (opérations)

Il n'y a pas de route `POST /sync/push` séparée : chaque opération de la file est rejouée sur **la
route métier existante**, qui revalide tout (droits, poste principal, disponibilité, montants). Cela
évite une seconde implémentation des règles côté serveur.

| Élément | Valeur |
|---|---|
| Identifiant global | `operation.id` (UUID v4 créé sur le poste), envoyé en `Idempotency-Key` |
| Origine | jeton du poste `X-Workstation-Token` (D-062), session de l'auteur (cookie Sanctum) |
| Métadonnées | `X-Offline-Replay` : type, libellé, date de saisie (base64url JSON) → journal `offline_operations` |
| Ordre | ordre de création ; dépendances `local-<id>` remplacées par l'identifiant serveur au moment de l'envoi ; une origine refusée refuse ses dépendantes |
| Accusé | réponse 2xx (ou réponse mémorisée rejouée si la clé est déjà connue) → `accepted`, numéro définitif (`REC-…`, `FAC-…`) |
| Refus métier (4xx sauf 401/429) | `rejected`, cause gardée, jamais effacé ; visible dans Synchronisation et dans « Mode hors ligne » (admin) |
| Panne passagère (réseau, 401, 429, 5xx) | reste `pending`, envoi interrompu, repris au passage suivant |
| Rythme | 90/min (limite serveur 120/min), 429 réessayé ; un seul envoi à la fois (verrou) |

**Réponse perdue** : le poste renvoie la même clé ; le serveur rend la réponse mémorisée
(`idempotency_keys`, jamais purgée depuis D-067) → aucun double encaissement.

**Déclencheurs** : démarrage en ligne, retour du serveur (vérification `/health` toutes les 15 s hors
ligne), toutes les 30 s en ligne, focus de la fenêtre, réveil/déverrouillage de Windows (logiciel),
bouton « Mettre à jour en ligne ». Rien ne se passe quand le PC est éteint : reprise au démarrage.

## 2. Réception : serveur → poste (changements)

### `GET /api/v1/sync/status` (connecté)
```json
{ "data": { "protocol": 1, "server_time": "2026-11-23T10:00:00+01:00", "cursor": "v1.1834",
            "retention_days": 365, "poll_seconds": 30 } }
```

### `GET /api/v1/sync/changes?cursor=v1.1834&limit=200` (connecté)
```json
{ "data": [ { "entity": "payment", "id": "<uuid>", "action": "created",
              "occurred_at": "2026-11-23T10:00:01+01:00" } ],
  "meta": { "cursor": "v1.1840", "has_more": false, "protocol": 1 } }
```

- **Curseur opaque** (`v1.<n>`), conservé par le poste après application (clé `server-changes`, par utilisateur).
- **Journal** `sync_changes` : écrit par les événements Eloquent **dans la transaction** de l'opération
  (une opération annulée n'annonce rien). Tables suivies : clients, chambres, catégories, tarifs,
  réservations (+ prolongations, occupants), encaissements, remboursements, factures, utilisateurs,
  désignations de poste ; paramètres et droits des rôles repérés par leur ligne d'audit.
- **Ordre et sécurité** : le curseur n'avance que sur les lignes plus vieilles que
  `SYNC_COMMIT_LAG_SECONDS` (15 s) : une transaction lente validée après une plus rapide n'est jamais
  sautée. Les lignes récentes sont tout de même rendues (actualisation rapide) puis de nouveau au
  passage suivant (sans effet de bord : le poste ne fait que relire).
- **Droits** : chaque utilisateur ne reçoit que les types qu'il peut consulter (ex. une caissière ne
  voit pas les changements d'utilisateurs) ; le curseur avance quand même.
- **Pagination** : `limit` ≤ 500, `has_more` ; le poste lit jusqu'à 20 pages par passage.
- **Conservation** : `SYNC_RETENTION_DAYS` (365 j), purge quotidienne `model:prune` (planificateur).
  Curseur antérieur à la plus vieille ligne → **410 `sync_cursor_expired`** : le poste relit tous les
  écrans et repart du curseur courant (resnapshot). Curseur illisible → 422, même traitement.
- **Compatibilité** : un serveur sans ce module répond 404 ; le poste l'ignore et fonctionne comme avant.
- **Application** : les écrans concernés (clés de requête) sont invalidés et relus ; une donnée
  modifiée sur le poste et pas encore envoyée n'est jamais écrasée (elle vit dans la file, pas dans
  la copie serveur ; les éléments provisoires sont retirés seulement après acceptation).

Temps réel : pas de WebSocket sur l'hébergement actuel ; la lecture toutes les 30 s sert de
rafraîchissement (le prompt l'exige comme secours). Un événement Reverb pourrait plus tard
déclencher `pullServerChanges` immédiatement, sans changer ce protocole.

### Mise à jour automatique de la copie du poste (D-070)
Sur le logiciel Windows et la PWA installée, `runAutoLocalUpdate` (appelée à chaque
synchronisation) relit aussitôt les fiches dont l'identifiant figure dans le journal, met à
jour les écrans gardés et essentiels toutes les 15 min (2 min après un changement) et télécharge
tout le poste au démarrage et toutes les 3 h. Jamais hors ligne ni avec une opération en attente
d'envoi ; 40 requêtes/min ; une seule mise à jour à la fois.

## 3. Règles de conflit par donnée

| Donnée | Qui écrit | Règle |
|---|---|---|
| Réservation / attribution de chambre | poste principal (D-062) ; autres postes si l'admin n'impose pas | verrou de chambre + re-contrôle au serveur ; conflit → **refus 409** gardé, ressaisie par l'admin ; jamais de déplacement automatique |
| Prix / tarif | admin (en ligne seulement) | prix du moment de la saisie sur le poste (N-09, ≤ 62 j) ; écart → `offline_rate_review` à examiner (D-067) ; factures émises jamais recalculées |
| Client | caisse et admin | création hors ligne = nouveau client ; modification d'un client hors ligne non proposée ; pas de fusion automatique |
| Encaissement | caisse | idempotent ; net encaissé ≤ dû revérifié ; refus gardé ; jamais supprimé |
| Annulation / prolongation | caisse avec droit | revalidées ; remboursement et facture traités au serveur dans la même transaction (D-053) |
| Facture | serveur (automatique) | `FAC-LOC-…` provisoire → numéro définitif ; aucun PDF/QR/avoir sur un provisoire |
| Droits / rôles | admin | relus avant chaque envoi (`/auth/me`) ; changement annoncé à tous (`role`) |

Aucune stratégie « dernière écriture gagnante » pour les réservations, encaissements ou factures.

## 4. Erreurs

| Code | Sens | Poste |
|---|---|---|
| 401 | session expirée | envoi suspendu, reconnexion demandée |
| 403 | droit retiré ou poste non principal | opération refusée, cause gardée |
| 409 | conflit (chambre prise, solde, état) | refusée, cause et aide gardées |
| 410 | curseur expiré | rechargement complet |
| 422 | données invalides / curseur illisible | refus (opération) ou rechargement (curseur) |
| 429 | trop de requêtes | attente puis nouvel essai |
| 5xx / réseau | serveur indisponible | reprise plus tard, rien n'est perdu |
