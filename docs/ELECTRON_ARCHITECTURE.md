# Architecture du logiciel Windows JB Hôtel (Electron, hors ligne d'abord)

> Décision **D-069** (23/11/2026). Audit préalable : `docs/ELECTRON_AUDIT.md`.
> Code : `electron/` (processus principal, preload, base SQLite, installateur) et `frontend/src/shared/desktop/`.

## 1. Choix retenu et pourquoi

Deux options ont été comparées :

| | **A — retenue** : même application React, SQLite derrière la couche hors ligne existante | B : base SQLite normalisée et services métier recodés dans le processus principal |
|---|---|---|
| Règles métier hors ligne | déjà écrites et testées (`offlineBooking.ts`, D-064/D-067/D-068), réutilisées telles quelles | à réécrire une seconde fois (réservation, prix, factures, caisse), risque de divergence |
| PWA | inchangée (même code, adaptateur choisi à l'exécution) | deux produits à maintenir |
| Synchronisation | file idempotente existante (D-063) + nouveau journal des changements | protocole entièrement nouveau |
| Délai / risque | quelques jours, testé de bout en bout | plusieurs semaines |

Le prompt interdit un « second produit divergent » et demande de réutiliser composants, validations
et règles : l'option A répond à cette exigence. La base locale **ne recopie pas** les tables MySQL :
elle garde la file des opérations, la copie des données telles que l'API les présente (une ligne
par écran), l'état de synchronisation, un journal local et les impressions. Le serveur reste
l'autorité ; c'est la même règle que la PWA validée (D-064).

## 2. Vue d'ensemble

```text
┌──────────────────────────── JB Hôtel Windows (JBHotel.exe) ────────────────────────────┐
│ Renderer (Chromium, sandbox)          Preload (contextBridge)      Main (Node 24)        │
│ ┌──────────────────────────┐   IPC   ┌──────────────────┐        ┌────────────────────┐ │
│ │ React existant (renderer/)│◄──────►│ window.jbDesktop │◄──────►│ ipc.ts (validation) │ │
│ │ shared/offline/*          │ nommé  │ storage, backups,│        │ LocalStore (SQLite) │ │
│ │ storage.ts → adaptateur   │        │ printing, system │        │ BackupService       │ │
│ │ desktop (SQLite)          │        └──────────────────┘        │ printing.ts         │ │
│ │ config.apiUrl =           │  fetch app://jbhotel/server/…      │ protocol.ts (relais)│ │
│ │ app://jbhotel/server      │───────────────────────────────────►│ updater.ts          │ │
│ └──────────────────────────┘                                     └─────────┬──────────┘ │
│ %APPDATA%\JBHotel : jbhotel.sqlite (WAL), sauvegardes\, cle-locale.bin, config.json,    │
│                     session\ (cookies), journal\main.log                                │
└────────────────────────────────────────────────────────────────────────┬────────────────┘
                                                                         │ HTTPS, cookies Sanctum,
                                                                         │ Idempotency-Key, X-Offline-Replay
                                     ┌───────────────────────────────────▼──────────────────────┐
                                     │ Laravel existant (/api/v1) + module Sync (D-069)          │
                                     │ sync_changes (même transaction), /sync/status, /changes  │
                                     └───────────────────────────────────┬──────────────────────┘
                                                                         │ même API, même journal
                                     ┌───────────────────────────────────▼──────────────────────┐
                                     │ PWA React (navigateur) : IndexedDB, actualisée toutes 30 s│
                                     └──────────────────────────────────────────────────────────┘
```

## 3. Responsabilités

| Composant | Fichier(s) | Rôle |
|---|---|---|
| Démarrage | `electron/src/main/main.ts` | dossier de données fixe `%APPDATA%\JBHotel`, instance unique, clé DPAPI, ouverture de la base (reprise si endommagée), fenêtre, réveil de Windows, sauvegarde quotidienne |
| Protocole `app://jbhotel/` | `protocol.ts` | fichiers de l'interface installés (CSP stricte, repli SPA), relais `/server/*` vers Laravel |
| Relais | `proxy.ts` (pur, testé) | adresse cible confinée au dossier de l'API, en-têtes autorisés seulement, `Origin` de l'application web, `X-XSRF-TOKEN` depuis le cookie de la session Electron, `Set-Cookie` jamais rendu à l'interface |
| Base locale | `storage/*.ts` | migrations, `LocalStore` (lecture versionnée, écriture conditionnelle transactionnelle), chiffrement, sauvegardes, restauration |
| IPC | `ipc.ts` | canaux nommés, émetteur vérifié (`app://jbhotel`), données validées, messages français |
| Impression | `printing.ts` | liste des imprimantes, ticket 58/80 mm en microns, imprimante absente / en erreur, journal `print_jobs` |
| Mises à jour | `updater.ts` | electron-updater (canal générique HTTPS), sauvegarde avant redémarrage, désactivé sans canal |
| Sécurité | `security.ts` | navigation et fenêtres limitées, permissions refusées, pas de `<webview>` |
| Pont | `preload/preload.ts`, `frontend/src/shared/desktop/bridge.ts` | contrat unique `window.jbDesktop` |
| Adaptateur de stockage | `frontend/src/shared/offline/storage.ts` | IndexedDB (web) ou SQLite (poste), même interface ; écritures du poste en série |
| Changements serveur | `frontend/src/shared/offline/serverChanges.ts` | curseur, pages, invalidation ciblée des écrans, 410 → rechargement complet, 404 → ignoré (serveur ancien) |
| Écran « Poste Windows » | `frontend/src/features/offline/DesktopPanel.tsx` | état de la base, chiffrement, sauvegardes, restauration, imprimante, mise à jour |
| Journal serveur | `backend/app/Modules/Sync` | `sync_changes` alimenté par les événements Eloquent dans la transaction, lecture par curseur et par droit |

## 4. Flux principaux

**Écriture hors ligne (ex. encaissement)** : écran → `runOrQueue` → `enqueueOperation` →
`storageMutate(['outbox','provisional-sequence'])` → pont → `LocalStore.commit` dans **une
transaction SQLite** : ligne `sync_outbox`, numéro `LOC-…` (croissant, trigger), copie des écrans
(`local_queries`). Rien n'est écrit si une étape échoue.

**Envoi** : démarrage, retour du serveur, toutes les 30 s, focus, réveil de Windows → `synchronize()`
→ `/auth/me` (droits à jour) → `sendPendingOperations` (ordre de création, clé d'idempotence =
identifiant d'opération, `X-Offline-Replay`) → accusé : `status = accepted` + numéro définitif ;
refus métier gardé (`rejected`, vue `sync_conflicts`) ; panne passagère : arrêt, reprise plus tard.

**Réception** : `pullServerChanges` → `GET /sync/changes?cursor=` par pages de 200 → écrans
concernés invalidés et relus → curseur enregistré après application. 410 (curseur trop ancien) :
tout est relu. Le même mécanisme actualise le tableau de bord de la PWA.

**Démarrage sans serveur** : fenêtre → `app://jbhotel/` (fichiers locaux) → copie SQLite restaurée →
session gardée → relecture échouée sans perte (F-7) → chip « Hors ligne ».

## 5. Autorité et conflits (résumé, détail dans `SYNC_PROTOCOL.md`)

- Le serveur décide toujours (disponibilité, droits, montants). Le poste propose.
- Poste principal unique (D-062) : seul écrivain des réservations et de la caisse quand l'administrateur l'impose.
- Aucune stratégie « dernière écriture gagnante » : une opération refusée reste visible avec sa cause,
  l'administrateur la traite dans « Mode hors ligne » (ressaisie ou rejet confirmé).
- Un encaissement rejoué ne compte qu'une fois (clé d'idempotence, D-063), même si l'accusé est perdu.

## 6. Ce qui distingue les trois « mises à jour »

| | Mécanisme | Quand |
|---|---|---|
| Données (SQLite ↔ MySQL) | file d'opérations + journal des changements | en continu dès que le serveur répond |
| Interface web | `pullServerChanges` toutes les 30 s → écrans relus | navigateur ouvert, en ligne |
| Logiciel (`.exe`) | electron-updater depuis le canal HTTPS | au démarrage puis toutes les 6 h ; installation au redémarrage, base jamais touchée |
