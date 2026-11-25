# Base locale SQLite du poste Windows — schéma, migrations, sauvegardes

> D-069. Code : `electron/src/main/storage/`. Tests : `electron/src/main/storage/storage.test.ts`.

## Emplacement et durabilité

- Fichier : `%APPDATA%\JBHotel\jbhotel.sqlite` (dossier choisi par le logiciel, sans accent, propre au
  compte Windows ; jamais dans le dossier d'installation ni dans `app.asar`). Une réinstallation ou une
  mise à jour n'y touche pas ; la désinstallation non plus (`deleteAppDataOnUninstall: false`).
- Pilote : `node:sqlite` intégré à Electron 45 (SQLite 3.54.1) — aucun module natif à recompiler.
- Réglages : `journal_mode = WAL`, `synchronous = FULL` (transaction confirmée = sur le disque),
  `foreign_keys = ON`, `busy_timeout = 5000`, `secure_delete = ON`, `trusted_schema = OFF`,
  `application_id = 0x4A42484F` (« JBHO », reconnaît une base ou une sauvegarde JB Hôtel).
- Un seul écrivain : instance unique du logiciel (`requestSingleInstanceLock`) ; dans l'interface,
  les écritures passent en série.
- Plusieurs comptes Windows : chacun a sa base et sa clé ; les opérations sont propres au compte.

## Tables (migration 1 `stockage_local_initial`)

| Table | Rôle | Contraintes notables |
|---|---|---|
| `schema_migrations` | versions appliquées | une ligne par migration ; base plus récente que le logiciel → refus (`DowngradeError`) |
| `store_keys` | version de chaque clé logique (lecture versionnée, écriture conditionnelle) | `version ≥ 0`, `present ∈ {0,1}` |
| `kv` | autres clés (session hors ligne, journal de synchronisation, curseur serveur…) | FK vers `store_keys`, valeur chiffrée |
| `sync_outbox` | file des opérations (une ligne par opération) | id = clé d'idempotence ; `status ∈ {pending, accepted, rejected, abandoned}` ; `provisional_number` UNIQUE ; **une opération acceptée ne change plus d'état** (trigger) |
| `sync_outbox_journal` | trace immuable : mise en file, changement d'état, retrait | triggers ; aucune mise à jour possible |
| `sync_conflicts` (vue) | opérations refusées par le serveur | — |
| `sync_state` | numérotation provisoire `LOC-…` | trigger : **ne recule jamais** |
| `local_queries` | copie des données du serveur, une ligne par écran (`root` = module) | `query_hash` UNIQUE, valeur chiffrée |
| `audit_logs` | journal local (migration, reprise, restauration, sauvegarde, imprimante, vidage) | immuable (triggers) |
| `print_jobs` | impressions et réimpressions de tickets | `width_mm ∈ {58,80}`, `status ∈ {printed, failed, cancelled}` |

Colonnes en clair : identifiants, type d'opération, état, dates, tailles (diagnostic). Contenu
(montants, noms, téléphones, copies d'écran, session) : chiffré (voir `OFFLINE_SECURITY.md`).

## Correspondance avec la couche hors ligne de la PWA

| Clé logique (`storage.ts`) | Table SQLite |
|---|---|
| `outbox` | `sync_outbox` (ordre = `position`) |
| `provisional-sequence` | `sync_state('provisional_sequence')` |
| `query-cache` | `kv('query-cache')` (enveloppe) + `local_queries` (écrans) |
| autres (`offline-session`, `sync-log`, `server-changes`…) | `kv` |

`storage:commit` = une transaction `BEGIN IMMEDIATE … COMMIT` : clés attendues vérifiées, puis
écritures ; refus de conflit (`{ ok: false }`) → l'interface relit et recalcule. Vider le stockage
garde toujours la file et la numérotation.

## Migrations

`migrations.ts` : liste ordonnée `{ version, name, up }`. Au démarrage : si des migrations manquent
et que la base existe déjà, **sauvegarde `migration` d'abord**, puis chaque migration dans sa
transaction. Une nouvelle migration s'ajoute en fin de liste avec un numéro supérieur, ne modifie
jamais une migration publiée, et doit avoir un test dans `storage.test.ts`.

## Sauvegardes et restauration

| Quand | Raison notée |
|---|---|
| au démarrage puis chaque heure si la dernière date de plus de 24 h | `auto` |
| bouton « Sauvegarder maintenant » / « Copier sur une clé USB » | `manual` |
| avant une migration, une restauration, une installation de mise à jour | `migration`, `restore`, `update` |

- Copie à chaud par l'API de sauvegarde SQLite, convertie en fichier unique (sans WAL), puis
  **`integrity_check`** ; une copie invalide est supprimée et signalée.
- Dossier `%APPDATA%\JBHotel\sauvegardes`, 30 copies gardées (rotation).
- **Restauration** (écran Synchronisation → Poste Windows) : fichier choisi dans une fenêtre
  Windows, vérifié (intègre et signé JB Hôtel), confirmation, sauvegarde `restore` de l'état actuel,
  remplacement, puis **réintégration des opérations plus récentes** que la sauvegarde et numérotation
  au maximum des deux. Application relancée.
- **Base endommagée au démarrage** (`quick_check` en échec ou fichier illisible) : le fichier est mis
  de côté (`jbhotel.sqlite.endommagee-<date>`, jamais supprimé), la dernière sauvegarde valide est
  restaurée, un avertissement s'affiche et la reprise est notée dans `audit_logs`.
- Limite : une sauvegarde ne se restaure que sur le même compte Windows (clé DPAPI). Pour changer de
  poste, utiliser la sauvegarde des opérations chiffrée par mot de passe (N-06), déjà existante.
